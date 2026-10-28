import { Alert, Badge, Button, Card, Grid, Group, Stack, Table, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconHandGrab, IconRepeat } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ScanInput } from '../../components/ScanInput';
import { TicketStatusBadge } from '../../components/StatusBadge';
import { get, post } from '../../lib/api';
import { useNames } from '../../lib/catalog';
import { notifyError } from '../../lib/errors';
import { fmtMinutes, sinceMinutes } from '../../lib/format';
import { normalizeSerial } from '@gamut/core';
import { useSession } from '../../lib/session';

export type OpenTicket = {
  id: number;
  number: string;
  status: string;
  assignedTo: number | null;
  retestFails: number;
  alert: boolean;
  openedAt: string;
  unitId: number;
  serial: string;
  modelId: number | null;
  colorId: number | null;
  lastDefectCodeId: number | null;
};

export function RepairHome() {
  const { t } = useTranslation();
  const n = useNames();
  const { user, can } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [notFound, setNotFound] = useState<string | null>(null);
  const { data = [] } = useQuery({ queryKey: ['tickets'], queryFn: () => get<OpenTicket[]>('/api/tickets'), refetchInterval: 30_000 });

  const claim = useMutation({
    mutationFn: (id: number) => post(`/api/tickets/${id}/claim`),
    onSuccess: (_r, id) => {
      qc.invalidateQueries();
      navigate(`/repair/ticket/${id}`);
    },
    onError: (e) => notifyError(e, t),
  });

  const mine = data.filter((x) => x.assignedTo === user?.id);
  const returned = mine.filter((x) => x.status === 'in_repair' && x.retestFails > 0);
  const working = mine.filter((x) => (x.status === 'in_repair' && x.retestFails === 0) || x.status === 'waiting_parts');
  const sent = mine.filter((x) => x.status === 'waiting_retest');
  const waiting = data.filter((x) => x.status === 'waiting_repair');
  const alerts = data.filter((x) => x.alert);

  const onScan = (raw: string) => {
    const serial = normalizeSerial(raw);
    const hit = data.find((x) => x.serial === serial);
    if (hit) {
      setNotFound(null);
      navigate(`/repair/ticket/${hit.id}`);
    } else setNotFound(serial);
  };

  const row = (x: OpenTicket, action?: ReactNode) => (
    <Table.Tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/repair/ticket/${x.id}`)}>
      <Table.Td>
        <Text ff="monospace" fw={700}>
          {x.serial}
        </Text>
        <Text size="xs" c="dimmed">
          {x.number}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text fw={600}>{n.modelCode(x.modelId)}</Text>
        <Text size="xs" c="dimmed">
          {n.color(x.colorId)}
        </Text>
      </Table.Td>
      <Table.Td>{n.defect(x.lastDefectCodeId)}</Table.Td>
      <Table.Td>
        <Group gap={4}>
          {x.retestFails > 0 && (
            <Badge color="red" leftSection={<IconRepeat size={12} />}>
              {t('repair.retestFails', { count: x.retestFails })}
            </Badge>
          )}
          {x.alert && <Badge color="red" variant="filled" leftSection={<IconAlertTriangle size={12} />}>!</Badge>}
        </Group>
      </Table.Td>
      <Table.Td c="dimmed">{fmtMinutes(sinceMinutes(x.openedAt), t)}</Table.Td>
      {action !== undefined && <Table.Td onClick={(e) => e.stopPropagation()}>{action}</Table.Td>}
    </Table.Tr>
  );

  const section = (title: string, color: string, list: OpenTicket[], withClaim = false, empty = true) =>
    (list.length > 0 || empty) && (
      <Card withBorder padding="md" style={{ borderColor: list.length && color === 'red' ? 'var(--mantine-color-red-6)' : undefined }}>
        <Group justify="space-between" mb="xs">
          <Text fw={800} size="lg" c={list.length && color === 'red' ? 'red' : undefined}>
            {title}
          </Text>
          <Badge size="lg" color={color}>
            {list.length}
          </Badge>
        </Group>
        {list.length ? (
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Tbody>
              {list.map((x) =>
                row(
                  x,
                  withClaim ? (
                    <Button leftSection={<IconHandGrab size={18} />} loading={claim.isPending && claim.variables === x.id} onClick={() => claim.mutate(x.id)}>
                      {t('repair.claim')}
                    </Button>
                  ) : undefined,
                ),
              )}
            </Table.Tbody>
          </Table>
        ) : (
          <Text c="dimmed" size="sm">
            {t('common.nothing')}
          </Text>
        )}
      </Card>
    );

  return (
    <Stack gap="md">
      <Title order={2}>{t('repair.title')}</Title>
      <ScanInput onScan={onScan} placeholder={t('repair.scanPlaceholder')} />
      {notFound && (
        <Alert color="yellow" icon={<IconAlertTriangle />} withCloseButton onClose={() => setNotFound(null)}>
          {t('repair.noOpenTicket', { serial: notFound })}
        </Alert>
      )}
      {can('supervise') && alerts.length > 0 && (
        <Alert color="red" variant="filled" icon={<IconAlertTriangle />}>
          {t('repair.alerts', { count: alerts.length })}
        </Alert>
      )}
      <Grid>
        <Grid.Col span={{ base: 12, xl: 7 }}>
          <Stack gap="md">
            {section(t('repair.returned'), 'red', returned, false, false)}
            {section(t('repair.mine'), 'blue', working)}
            {section(t('repair.waitingForRepairman'), 'orange', waiting, true)}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, xl: 5 }}>
          <Stack gap="md">
            {section(t('repair.sentToTest'), 'violet', sent)}
            {can('supervise') && (
              <Card withBorder padding="md">
                <Text fw={800} size="lg" mb="xs">
                  {t('repair.allOpen')}
                </Text>
                <Table highlightOnHover>
                  <Table.Tbody>
                    {data.map((x) => (
                      <Table.Tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/repair/ticket/${x.id}`)}>
                        <Table.Td ff="monospace">{x.serial}</Table.Td>
                        <Table.Td>
                          <TicketStatusBadge status={x.status} size="sm" />
                        </Table.Td>
                        <Table.Td>{n.user(x.assignedTo)}</Table.Td>
                        <Table.Td c="dimmed">{fmtMinutes(sinceMinutes(x.openedAt), t)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Card>
            )}
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
