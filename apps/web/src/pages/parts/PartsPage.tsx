import { Alert, Badge, Button, Card, Group, Modal, NumberInput, SegmentedControl, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { tr } from '@gamut/core';
import { IconAlertTriangle, IconHistory, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post } from '../../lib/api';
import { isLowStock, useNames } from '../../lib/catalog';
import { notifyError, notifyOk } from '../../lib/errors';
import { fmtDateTime } from '../../lib/format';
import { useSession } from '../../lib/session';
import type { Part } from '../../lib/types';

export function PartsPage() {
  const { t } = useTranslation();
  const n = useNames();
  const { can } = useSession();
  const [q, setQ] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [stockPart, setStockPart] = useState<Part | null>(null);
  const [historyPart, setHistoryPart] = useState<Part | null>(null);
  const all = (n.catalog?.parts ?? []).filter((p) => p.active);
  const low = all.filter(isLowStock);
  const term = q.trim().toLowerCase();
  const list = (onlyLow ? low : all).filter(
    (p) => !term || p.partNumber.toLowerCase().includes(term) || tr(p.name, n.lang).toLowerCase().includes(term),
  );

  return (
    <Stack gap="md">
      <Title order={2}>{t('parts.title')}</Title>
      {low.length > 0 && (
        <Alert color="orange" icon={<IconAlertTriangle />} title={t('parts.lowTitle', { count: low.length })}>
          {low.map((p) => `${p.partNumber} (${p.stockQty})`).join(' · ')}
        </Alert>
      )}
      <Group>
        <TextInput style={{ flex: 1 }} size="lg" leftSection={<IconSearch />} placeholder={t('parts.search')} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
        <SegmentedControl
          value={onlyLow ? 'low' : 'all'}
          onChange={(v) => setOnlyLow(v === 'low')}
          data={[
            { value: 'all', label: t('parts.all') },
            { value: 'low', label: t('parts.low') },
          ]}
        />
      </Group>
      <Card withBorder padding={0}>
        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('parts.number')}</Table.Th>
              <Table.Th>{t('fields.name')}</Table.Th>
              <Table.Th>{t('fields.component')}</Table.Th>
              <Table.Th>{t('parts.stock')}</Table.Th>
              <Table.Th>{t('parts.min')}</Table.Th>
              {can('supervise') && <Table.Th />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {list.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td ff="monospace" fw={700}>
                  {p.partNumber}
                </Table.Td>
                <Table.Td>{tr(p.name, n.lang)}</Table.Td>
                <Table.Td>{p.componentId ? n.component(p.componentId) : ''}</Table.Td>
                <Table.Td>
                  <Badge size="lg" color={p.stockQty <= 0 ? 'red' : isLowStock(p) ? 'orange' : 'green'} variant="light">
                    {p.stockQty}
                  </Badge>
                </Table.Td>
                <Table.Td c="dimmed">{p.minStock || '—'}</Table.Td>
                {can('supervise') && (
                  <Table.Td>
                    <Group gap="xs" justify="flex-end">
                      <Button size="xs" onClick={() => setStockPart(p)}>
                        {t('parts.updateStock')}
                      </Button>
                      <Button size="xs" variant="subtle" leftSection={<IconHistory size={14} />} onClick={() => setHistoryPart(p)}>
                        {t('parts.movements')}
                      </Button>
                    </Group>
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {list.length === 0 && (
          <Text c="dimmed" p="md">
            {t('common.nothing')}
          </Text>
        )}
      </Card>
      {can('admin') && (
        <Text size="sm" c="dimmed">
          {t('parts.adminHint')}
        </Text>
      )}
      <StockModal part={stockPart} onClose={() => setStockPart(null)} />
      <MovementsModal part={historyPart} onClose={() => setHistoryPart(null)} />
    </Stack>
  );
}

function StockModal({ part, onClose }: { part: Part | null; onClose: () => void }) {
  const { t } = useTranslation();
  const n = useNames();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'received' | 'count'>('received');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () => post(`/api/parts/${part!.id}/stock`, { mode, quantity: Number(quantity), note }),
    onSuccess: () => {
      qc.invalidateQueries();
      notifyOk(t('repair.saved'));
      setQuantity('');
      setNote('');
      onClose();
    },
    onError: (e) => notifyError(e, t),
  });
  return (
    <Modal opened={!!part} onClose={onClose} centered title={<Text fw={700}>{part ? `${part.partNumber} — ${tr(part.name, n.lang)}` : ''}</Text>}>
      <Stack>
        <Text>{t('parts.current', { count: part?.stockQty ?? 0 })}</Text>
        <SegmentedControl
          value={mode}
          onChange={(v) => setMode(v as 'received' | 'count')}
          data={[
            { value: 'received', label: t('parts.received') },
            { value: 'count', label: t('parts.counted') },
          ]}
        />
        <NumberInput size="lg" min={0} label={mode === 'received' ? t('parts.receivedQty') : t('parts.countedQty')} value={quantity} onChange={(v) => setQuantity(typeof v === 'number' ? v : '')} data-autofocus />
        <TextInput label={t('fields.notes')} placeholder={t('parts.notePlaceholder')} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        <Button size="lg" disabled={quantity === ''} loading={save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      </Stack>
    </Modal>
  );
}

function MovementsModal({ part, onClose }: { part: Part | null; onClose: () => void }) {
  const { t } = useTranslation();
  const n = useNames();
  const { data = [] } = useQuery({
    queryKey: ['movements', part?.id],
    queryFn: () => get<any[]>(`/api/parts/${part!.id}/movements`),
    enabled: !!part,
  });
  return (
    <Modal opened={!!part} onClose={onClose} size="lg" centered title={<Text fw={700}>{part?.partNumber}</Text>}>
      <Table>
        <Table.Tbody>
          {[...data].reverse().map((m) => (
            <Table.Tr key={m.id}>
              <Table.Td c="dimmed">{fmtDateTime(m.createdAt, n.lang)}</Table.Td>
              <Table.Td>{t(`parts.reason.${m.reason}`)}</Table.Td>
              <Table.Td fw={700} c={m.delta < 0 ? 'red' : 'green'}>
                {m.delta > 0 ? `+${m.delta}` : m.delta}
              </Table.Td>
              <Table.Td>{n.user(m.userId)}</Table.Td>
              <Table.Td>{m.note}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {data.length === 0 && <Text c="dimmed">{t('common.nothing')}</Text>}
    </Modal>
  );
}
