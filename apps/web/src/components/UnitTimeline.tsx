import { Badge, Group, Stack, Text, ThemeIcon, Timeline } from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconFlag,
  IconHandGrab,
  IconPackage,
  IconSearch,
  IconSend,
  IconTool,
  IconTrash,
  IconUserShare,
  IconX,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNames } from '../lib/catalog';
import { fmtDateTime } from '../lib/format';
import type { Diagnosis, EventRow, RepairAction, Test, Ticket } from '../lib/types';

type Item = { at: string; key: string; color: string; icon: ReactNode; title: ReactNode; body?: ReactNode };

export function UnitTimeline({
  tests,
  actions,
  diagnoses,
  events,
  tickets,
}: {
  tests: Test[];
  actions: RepairAction[];
  diagnoses: Diagnosis[];
  events: EventRow[];
  tickets: Ticket[];
}) {
  const { t } = useTranslation();
  const n = useNames();
  const ticketNo = (id: number | null) => tickets.find((x) => x.id === id)?.number ?? '';
  const items: Item[] = [];

  for (const test of tests) {
    const failed = test.checks.filter((c) => !c.ok);
    items.push({
      at: test.testedAt,
      key: `t${test.id}`,
      color: test.result === 'pass' ? 'green' : 'red',
      icon: test.result === 'pass' ? <IconCheck size={16} /> : <IconX size={16} />,
      title: (
        <Group gap="xs">
          <Text fw={700}>{test.result === 'pass' ? t('timeline.testPassed') : t('timeline.testFailed')}</Text>
          <Badge variant="light">{test.attemptNo === 1 ? t('quality.firstTest') : t('quality.attempt', { n: test.attemptNo })}</Badge>
        </Group>
      ),
      body: (
        <Stack gap={2}>
          <Text size="sm" c="dimmed">
            {t('timeline.by', { name: n.user(test.testedBy) })} · {n.station(test.stationId)}
          </Text>
          {test.defectCodeId && <Text size="sm">{n.defect(test.defectCodeId)}</Text>}
          {failed.length > 0 && (
            <Text size="sm" c="red">
              ✗ {failed.map((c) => n.check(c.itemId)).join(', ')}
            </Text>
          )}
          {test.notes && <Text size="sm">“{test.notes}”</Text>}
        </Stack>
      ),
    });
  }

  for (const d of diagnoses) {
    items.push({
      at: d.createdAt,
      key: `d${d.id}`,
      color: 'cyan',
      icon: <IconSearch size={16} />,
      title: <Text fw={700}>{t('timeline.diagnosis')}</Text>,
      body: (
        <Stack gap={2}>
          <Text size="sm" c="dimmed">
            {t('timeline.by', { name: n.user(d.userId) })} · {ticketNo(d.ticketId)}
          </Text>
          <Text size="sm">{n.defect(d.defectCodeId)}</Text>
          {d.notes && <Text size="sm">“{d.notes}”</Text>}
        </Stack>
      ),
    });
  }

  for (const a of actions) {
    items.push({
      at: a.createdAt,
      key: `a${a.id}`,
      color: 'blue',
      icon: <IconTool size={16} />,
      title: (
        <Text fw={700}>
          {n.action(a.actionTypeId)} — {n.component(a.componentId)}
        </Text>
      ),
      body: (
        <Stack gap={2}>
          <Text size="sm" c="dimmed">
            {t('timeline.by', { name: n.user(a.userId) })} · {ticketNo(a.ticketId)}
            {a.durationMin != null ? ` · ${t('time.minutes', { count: a.durationMin })}` : ''}
          </Text>
          {a.description && <Text size="sm">{a.description}</Text>}
          {(a.partsUsed?.length ?? 0) > 0 && (
            <Text size="sm">
              {t('parts.used')}: {a.partsUsed!.map((p) => `${n.part(p.partId)} ×${p.quantity}`).join(', ')}
            </Text>
          )}
          {a.parts && (
            <Text size="sm">
              {t('repair.otherParts')}: {a.parts}
            </Text>
          )}
        </Stack>
      ),
    });
  }

  for (const e of events) {
    const by = e.userId ? t('timeline.by', { name: n.user(e.userId) }) : '';
    const base = { at: e.createdAt, key: `e${e.id}` };
    if (e.type === 'ticket_opened')
      items.push({ ...base, color: 'orange', icon: <IconFlag size={16} />, title: <Text fw={700}>{t('timeline.ticketOpened', { number: ticketNo(e.ticketId) })}</Text> });
    else if (e.type === 'status_changed' && e.toStatus === 'in_repair' && e.fromStatus === 'waiting_repair')
      items.push({ ...base, color: 'blue', icon: <IconHandGrab size={16} />, title: <Text fw={700}>{t('timeline.claimed')}</Text>, body: <Text size="sm" c="dimmed">{by}</Text> });
    else if (e.type === 'status_changed' && e.toStatus === 'waiting_parts')
      items.push({ ...base, color: 'yellow', icon: <IconPackage size={16} />, title: <Text fw={700}>{t('status.ticket.waiting_parts')}</Text>, body: <Text size="sm" c="dimmed">{by}</Text> });
    else if (e.type === 'status_changed' && e.toStatus === 'waiting_retest')
      items.push({ ...base, color: 'violet', icon: <IconSend size={16} />, title: <Text fw={700}>{t('timeline.sentToTest')}</Text>, body: <Text size="sm" c="dimmed">{by}</Text> });
    else if (e.type === 'assigned')
      items.push({
        ...base,
        color: 'gray',
        icon: <IconUserShare size={16} />,
        title: <Text fw={700}>{t('timeline.assigned', { name: n.user(e.data.to) })}</Text>,
        body: <Text size="sm" c="dimmed">{by}</Text>,
      });
    else if (e.type === 'ticket_closed')
      items.push({ ...base, color: 'green', icon: <IconCheck size={16} />, title: <Text fw={700}>{t('timeline.ticketClosed', { number: ticketNo(e.ticketId) })}</Text> });
    else if (e.type === 'scrapped')
      items.push({
        ...base,
        color: 'dark',
        icon: <IconTrash size={16} />,
        title: <Text fw={700}>{t('timeline.scrapped')}</Text>,
        body: (
          <Text size="sm">
            {by} — “{e.data.reason}”
          </Text>
        ),
      });
    else if (e.type === 'retest_failed' && e.data.retestFails >= 2)
      items.push({
        ...base,
        color: 'red',
        icon: <IconAlertTriangle size={16} />,
        title: <Text fw={700}>{t('timeline.repeatedFails', { count: e.data.retestFails })}</Text>,
      });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime() || b.key.localeCompare(a.key));

  if (!items.length) return <Text c="dimmed">{t('common.nothing')}</Text>;
  return (
    <Timeline bulletSize={28} lineWidth={2}>
      {items.map((it) => (
        <Timeline.Item
          key={it.key}
          bullet={
            <ThemeIcon size={28} radius="xl" color={it.color}>
              {it.icon}
            </ThemeIcon>
          }
          title={
            <Group justify="space-between" wrap="nowrap">
              {it.title}
              <Text size="xs" c="dimmed">
                {fmtDateTime(it.at, n.lang)}
              </Text>
            </Group>
          }
        >
          {it.body}
        </Timeline.Item>
      ))}
    </Timeline>
  );
}
