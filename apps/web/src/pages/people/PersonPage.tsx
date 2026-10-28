import { Card, Group, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ResultBadge } from '../../components/StatusBadge';
import { get } from '../../lib/api';
import { useNames } from '../../lib/catalog';
import { fmtDateTime } from '../../lib/format';
import { useSession } from '../../lib/session';

const RANGES = { today: 0, week: 7, month: 30 } as const;

export function PersonPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const n = useNames();
  const { can } = useSession();
  const navigate = useNavigate();
  const [range, setRange] = useState<keyof typeof RANGES>('today');
  const { from, to } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - RANGES[range]);
    const end = new Date();
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [range]);
  const { data } = useQuery({
    queryKey: ['person', id, from, to],
    queryFn: () => get(`/api/people/${id}/activity?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  });
  const person = n.catalog?.users.find((u) => u.id === Number(id));
  const tests: any[] = data?.tests ?? [];
  const actions: any[] = data?.actions ?? [];
  const minutes = actions.reduce((s, a) => s + (a.durationMin ?? 0), 0);
  const units = new Set(actions.map((a) => a.ticketId)).size;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Stack gap={0}>
          <Title order={2}>{person?.fullName}</Title>
          <Text c="dimmed">
            {person?.employeeId} · {person?.roles.map((r) => t(`roles.${r}`)).join(', ')}
          </Text>
        </Stack>
        <Group>
          {can('supervise') && (
            <Select
              searchable
              w={240}
              value={id ?? null}
              onChange={(v) => v && navigate(`/people/${v}`)}
              data={(n.catalog?.users ?? []).map((u) => ({ value: String(u.id), label: u.fullName }))}
            />
          )}
          <SegmentedControl
            value={range}
            onChange={(v) => setRange(v as keyof typeof RANGES)}
            data={[
              { value: 'today', label: t('people.today') },
              { value: 'week', label: t('people.week') },
              { value: 'month', label: t('people.month') },
            ]}
          />
        </Group>
      </Group>
      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Stat label={t('people.unitsTested')} value={tests.length} />
        <Stat label={t('people.failsFound')} value={tests.filter((x) => x.result === 'fail').length} />
        <Stat label={t('people.unitsRepaired')} value={units} />
        <Stat label={t('people.repairTime')} value={t('time.minutes', { count: minutes })} />
      </SimpleGrid>
      {actions.length > 0 && (
        <Card withBorder padding="md">
          <Title order={4} mb="sm">
            {t('people.repairs')}
          </Title>
          <Table highlightOnHover>
            <Table.Tbody>
              {actions.map((a) => (
                <Table.Tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/units/${encodeURIComponent(a.serial)}`)}>
                  <Table.Td c="dimmed">{fmtDateTime(a.createdAt, n.lang)}</Table.Td>
                  <Table.Td ff="monospace" fw={600}>
                    {a.serial}
                  </Table.Td>
                  <Table.Td>{n.modelCode(a.modelId)}</Table.Td>
                  <Table.Td>
                    {n.action(a.actionTypeId)} — {n.component(a.componentId)}
                  </Table.Td>
                  <Table.Td>{a.description}</Table.Td>
                  <Table.Td>{a.durationMin != null ? t('time.minutes', { count: a.durationMin }) : ''}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}
      {tests.length > 0 && (
        <Card withBorder padding="md">
          <Title order={4} mb="sm">
            {t('people.tests')}
          </Title>
          <Table highlightOnHover>
            <Table.Tbody>
              {tests.map((x) => (
                <Table.Tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/units/${encodeURIComponent(x.serial)}`)}>
                  <Table.Td c="dimmed">{fmtDateTime(x.testedAt, n.lang)}</Table.Td>
                  <Table.Td ff="monospace" fw={600}>
                    {x.serial}
                  </Table.Td>
                  <Table.Td>{n.modelCode(x.modelId)}</Table.Td>
                  <Table.Td>
                    <ResultBadge result={x.result} size="sm" />
                  </Table.Td>
                  <Table.Td>{x.attemptNo === 1 ? t('quality.firstTest') : t('quality.attempt', { n: x.attemptNo })}</Table.Td>
                  <Table.Td>{x.defectCodeId ? n.defect(x.defectCodeId) : ''}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}
      {!tests.length && !actions.length && <Text c="dimmed">{t('common.nothing')}</Text>}
    </Stack>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card withBorder padding="md">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={800} size="32px">
        {value}
      </Text>
    </Card>
  );
}
