import { Badge, Button, Card, Code, Group, SegmentedControl, Select, Stack, Table, Text, Title } from '@mantine/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { get } from '../../lib/api';
import { useNames } from '../../lib/catalog';
import { fmtDateTime } from '../../lib/format';

export const EVENT_TYPES = [
  'unit_created',
  'test_passed',
  'test_failed',
  'ticket_opened',
  'status_changed',
  'assigned',
  'diagnosis_added',
  'repair_action_added',
  'retest_failed',
  'ticket_closed',
  'scrapped',
  'photo_added',
  'stock_changed',
  'admin_change',
  'settings_changed',
  'translation_changed',
  'pin_changed',
] as const;

const RANGE_DAYS = { today: 0, week: 6, month: 29 } as const;
const PAGE = 100;

type Ev = {
  id: number;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  userId: number | null;
  data: Record<string, any>;
  createdAt: string;
  serial: string | null;
  ticketNumber: string | null;
  ticketId: number | null;
};

/** Change log: every action in the app, who did it and when. Nothing can be removed from it. */
export function AuditPage() {
  const { t } = useTranslation();
  const n = useNames();
  const [range, setRange] = useState<keyof typeof RANGE_DAYS>('week');
  const [type, setType] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const { from, to } = useMemo(() => {
    const f = new Date();
    f.setHours(0, 0, 0, 0);
    f.setDate(f.getDate() - RANGE_DAYS[range]);
    return { from: f.toISOString(), to: new Date(Date.now() + 60_000).toISOString() };
  }, [range]);

  const q = useInfiniteQuery({
    queryKey: ['audit', from, type, userId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ from, to, limit: String(PAGE) });
      if (type) p.set('type', type);
      if (userId) p.set('userId', userId);
      if (pageParam) p.set('beforeId', String(pageParam));
      return get<Ev[]>(`/api/audit?${p}`);
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].id : undefined),
  });
  const rows = q.data?.pages.flat() ?? [];

  const details = (e: Ev) => {
    const d = e.data ?? {};
    switch (e.type) {
      case 'status_changed':
      case 'ticket_opened':
      case 'ticket_closed':
        return [e.fromStatus && t(`status.ticket.${e.fromStatus}`), e.toStatus && t(`status.ticket.${e.toStatus}`)].filter(Boolean).join(' → ');
      case 'assigned':
        return `${n.user(d.from)} → ${n.user(d.to)}`;
      case 'scrapped':
        return `“${d.reason}”`;
      case 'retest_failed':
        return t('timeline.repeatedFails', { count: d.retestFails });
      case 'test_passed':
      case 'test_failed':
        return d.attemptNo === 1 ? t('quality.firstTest') : t('quality.attempt', { n: d.attemptNo });
      case 'stock_changed':
        return `${d.partNumber}: ${d.delta > 0 ? '+' : ''}${d.delta} → ${d.stock}${d.note ? ` · ${d.note}` : ''}`;
      case 'translation_changed':
        return `${String(d.lang).toUpperCase()} ${d.key} = “${d.value}”`;
      case 'admin_change': {
        const changes = Object.keys(d.after ?? {})
          .filter((k) => !['id'].includes(k) || d.action === 'create')
          .map((k) => `${k}: ${d.action === 'update' ? `${JSON.stringify(d.before?.[k])} → ` : ''}${JSON.stringify(d.after[k])}`);
        if (d.pinChanged) changes.push('PIN');
        return (
          <Stack gap={0}>
            <Text size="sm" fw={600}>
              {t(`audit.entity.${d.entity}`, { defaultValue: d.entity })} #{d.id} — {t(`audit.action.${d.action}`)}
            </Text>
            <Code block style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
              {changes.join('\n').slice(0, 600)}
            </Code>
          </Stack>
        );
      }
      case 'settings_changed':
        return <Code>{JSON.stringify(d)}</Code>;
      default:
        return '';
    }
  };

  return (
    <Stack gap="md">
      <Title order={2}>{t('audit.title')}</Title>
      <Text c="dimmed">{t('audit.text')}</Text>
      <Group>
        <SegmentedControl
          value={range}
          onChange={(v) => setRange(v as keyof typeof RANGE_DAYS)}
          data={[
            { value: 'today', label: t('people.today') },
            { value: 'week', label: t('people.week') },
            { value: 'month', label: t('people.month') },
          ]}
        />
        <Select w={260} clearable placeholder={t('audit.allTypes')} value={type} onChange={setType} data={EVENT_TYPES.map((x) => ({ value: x, label: t(`audit.type.${x}`) }))} />
        <Select
          w={220}
          clearable
          searchable
          placeholder={t('audit.everyone')}
          value={userId}
          onChange={setUserId}
          data={(n.catalog?.users ?? []).map((u) => ({ value: String(u.id), label: u.fullName }))}
        />
      </Group>
      <Card withBorder padding={0}>
        <Table verticalSpacing="xs" horizontalSpacing="md" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('reports.date')}</Table.Th>
              <Table.Th>{t('reports.by')}</Table.Th>
              <Table.Th>{t('audit.what')}</Table.Th>
              <Table.Th>{t('fields.serial')}</Table.Th>
              <Table.Th>{t('audit.details')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((e) => (
              <Table.Tr key={e.id}>
                <Table.Td c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                  {fmtDateTime(e.createdAt, n.lang)}
                </Table.Td>
                <Table.Td>{n.user(e.userId)}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color={['admin_change', 'settings_changed', 'translation_changed', 'pin_changed', 'stock_changed'].includes(e.type) ? 'grape' : e.type === 'test_failed' || e.type === 'retest_failed' || e.type === 'scrapped' ? 'red' : 'blue'}>
                    {t(`audit.type.${e.type}`, { defaultValue: e.type })}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {e.serial && (
                    <Link to={`/units/${encodeURIComponent(e.serial)}`} style={{ fontFamily: 'monospace' }}>
                      {e.serial}
                    </Link>
                  )}
                  {e.ticketNumber && (
                    <Text size="xs" c="dimmed">
                      {e.ticketNumber}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>{details(e)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {!rows.length && !q.isLoading && (
          <Text c="dimmed" p="md">
            {t('common.nothing')}
          </Text>
        )}
      </Card>
      {q.hasNextPage && (
        <Button variant="light" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} style={{ alignSelf: 'center' }}>
          {t('audit.more')}
        </Button>
      )}
    </Stack>
  );
}
