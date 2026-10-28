import { Badge, Box, Button, Card, Group, SegmentedControl, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { yieldLevel } from '@gamut/core';
import { IconFileSpreadsheet, IconPrinter } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { get } from '../../lib/api';
import { useNames } from '../../lib/catalog';
import { notifyError } from '../../lib/errors';
import { fmtDateTime, fmtMinutes } from '../../lib/format';

type Row = { key: number | string; tested: number; passed: number; failed: number; fpy: number | null; target?: number };
export type Report = {
  from: string;
  to: string;
  target: number;
  summary: {
    tested: number;
    passedFirst: number;
    failedFirst: number;
    fpy: number | null;
    retests: number;
    retestFails: number;
    repaired: number;
    scrapped: number;
    avgRepairMinutes: number | null;
    avgHandsOnMinutes: number | null;
    avgWaitRetestMinutes: number | null;
  };
  byDay: Row[];
  byModel: Row[];
  byColor: Row[];
  defects: Array<{ defectCodeId: number; count: number; cumulativePct: number }>;
  components: Array<{ componentId: number; actionTypeId: number; count: number }>;
  partsUsed: Array<{ partId: number; quantity: number }>;
  repairmen: Array<{ userId: number; units: number; actions: number; minutes: number; retests: number; retestFails: number }>;
  testers: Array<{ userId: number; tests: number; fails: number }>;
  scrapped: Array<{ serial: string; modelId: number | null; userId: number | null; reason: string; at: string }>;
  repeatUnits: Array<{ id: number; serial: string; modelId: number | null; repairs: number }>;
};

const RANGES = ['today', 'week', 'month', 'thisMonth', 'custom'] as const;
const LEVEL = { good: 'green', warning: 'orange', bad: 'red', none: 'gray' } as const;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function rangeDates(kind: (typeof RANGES)[number], customFrom: string, customTo: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  if (kind === 'week') start.setDate(start.getDate() - 6);
  if (kind === 'month') start.setDate(start.getDate() - 29);
  if (kind === 'thisMonth') start.setDate(1);
  if (kind === 'custom') {
    const f = new Date(`${customFrom}T00:00:00`);
    const t = new Date(`${customTo}T00:00:00`);
    t.setDate(t.getDate() + 1);
    return { from: f, to: t };
  }
  return { from: start, to: end };
}

const pct = (v: number | null) => (v == null ? '—' : `${v}%`);

export function ReportsPage() {
  const { t } = useTranslation();
  const n = useNames();
  const [kind, setKind] = useState<(typeof RANGES)[number]>('week');
  const [customFrom, setCustomFrom] = useState(iso(new Date(Date.now() - 6 * 86400000)));
  const [customTo, setCustomTo] = useState(iso(new Date()));
  const { from, to } = useMemo(() => rangeDates(kind, customFrom, customTo), [kind, customFrom, customTo]);
  const { data: r, isLoading } = useQuery({
    queryKey: ['report', from.toISOString(), to.toISOString()],
    queryFn: () => get<Report>(`/api/reports?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
  });
  const [exporting, setExporting] = useState(false);

  const exportExcel = async () => {
    if (!r) return;
    setExporting(true);
    try {
      const { exportReportToExcel } = await import('./excel');
      await exportReportToExcel(r, n, t);
    } catch (e) {
      notifyError(e, t);
    } finally {
      setExporting(false);
    }
  };

  const s = r?.summary;
  const maxDefect = Math.max(1, ...(r?.defects ?? []).map((d) => d.count));

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>{t('reports.title')}</Title>
        <Group className="no-print">
          <Button variant="light" color="green" leftSection={<IconFileSpreadsheet />} loading={exporting} disabled={!r} onClick={exportExcel}>
            {t('reports.excel')}
          </Button>
          <Button variant="light" leftSection={<IconPrinter />} disabled={!r} onClick={() => window.print()}>
            {t('reports.print')}
          </Button>
        </Group>
      </Group>
      <Group className="no-print">
        <SegmentedControl value={kind} onChange={(v) => setKind(v as typeof kind)} data={RANGES.map((k) => ({ value: k, label: t(`reports.range.${k}`) }))} />
        {kind === 'custom' && (
          <>
            <TextInput type="date" value={customFrom} onChange={(e) => setCustomFrom(e.currentTarget.value)} aria-label={t('reports.from')} />
            <TextInput type="date" value={customTo} onChange={(e) => setCustomTo(e.currentTarget.value)} aria-label={t('reports.to')} />
          </>
        )}
      </Group>
      <Text c="dimmed">
        {t('reports.period', { from: fmtDateTime(from.toISOString(), n.lang), to: fmtDateTime(new Date(to.getTime() - 60000).toISOString(), n.lang) })}
      </Text>
      {isLoading && <Text>{t('common.loading')}</Text>}

      {r && s && (
        <>
          <SimpleGrid cols={{ base: 2, md: 4, xl: 6 }}>
            <Tile label={t('kpi.fpy')} value={pct(s.fpy)} color={LEVEL[yieldLevel(s.fpy, r.target)]} sub={t('line.target', { value: r.target })} />
            <Tile label={t('kpi.tested')} value={s.tested} />
            <Tile label={t('kpi.failedFirst')} value={s.failedFirst} color="red" />
            <Tile label={t('kpi.repairedPassed')} value={s.repaired} color="green" />
            <Tile label={t('reports.retestFailRate')} value={s.retests ? `${Math.round((s.retestFails / s.retests) * 100)}%` : '—'} sub={`${s.retestFails} / ${s.retests}`} />
            <Tile label={t('kpi.scrapped')} value={s.scrapped} />
            <Tile label={t('reports.avgRepair')} value={fmtMinutes(s.avgRepairMinutes, t)} />
            <Tile label={t('reports.avgHandsOn')} value={fmtMinutes(s.avgHandsOnMinutes, t)} />
            <Tile label={t('reports.avgWaitRetest')} value={fmtMinutes(s.avgWaitRetestMinutes, t)} />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <Section title={t('reports.byDay')}>
              <YieldTable rows={r.byDay} label={(k) => String(k)} target={r.target} />
            </Section>
            <Section title={t('reports.defects')}>
              <Stack gap={6}>
                {r.defects.length === 0 && <Text c="dimmed">{t('common.nothing')}</Text>}
                {r.defects.map((d) => (
                  <Box key={d.defectCodeId}>
                    <Group justify="space-between" wrap="nowrap">
                      <Text size="sm" fw={600}>
                        {n.defect(d.defectCodeId)}
                      </Text>
                      <Text size="sm">
                        <b>{d.count}</b> <span style={{ color: 'var(--mantine-color-dimmed)' }}>· {d.cumulativePct}%</span>
                      </Text>
                    </Group>
                    <Box h={8} bg="gray.2" style={{ borderRadius: 4 }}>
                      <Box h={8} bg="red.6" style={{ width: `${(d.count / maxDefect) * 100}%`, borderRadius: 4 }} />
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Section>
            <Section title={t('reports.byModel')}>
              <YieldTable rows={r.byModel} label={(k) => n.model(Number(k))} target={r.target} />
            </Section>
            <Section title={t('reports.byColor')}>
              <YieldTable rows={r.byColor} label={(k) => n.color(Number(k))} target={r.target} />
            </Section>
            <Section title={t('reports.components')}>
              <SimpleTable
                head={[t('fields.component'), t('fields.actionType'), t('reports.count')]}
                rows={r.components.map((c) => [n.component(c.componentId), n.action(c.actionTypeId), c.count])}
              />
            </Section>
            <Section title={t('reports.partsUsed')}>
              <SimpleTable head={[t('parts.number'), t('reports.quantity')]} rows={r.partsUsed.map((p) => [n.part(p.partId), p.quantity])} />
            </Section>
            <Section title={t('reports.repairmen')}>
              <SimpleTable
                head={[t('fields.fullName'), t('people.unitsRepaired'), t('people.repairTime'), t('reports.retestFails')]}
                rows={r.repairmen.map((x) => [
                  <Link key="l" to={`/people/${x.userId}`}>{n.user(x.userId)}</Link>,
                  x.units,
                  fmtMinutes(x.minutes, t),
                  `${x.retestFails} / ${x.retests}`,
                ])}
              />
            </Section>
            <Section title={t('reports.testers')}>
              <SimpleTable
                head={[t('fields.fullName'), t('people.unitsTested'), t('people.failsFound')]}
                rows={r.testers.map((x) => [<Link key="l" to={`/people/${x.userId}`}>{n.user(x.userId)}</Link>, x.tests, x.fails])}
              />
            </Section>
            <Section title={t('reports.repeat')}>
              <SimpleTable
                head={[t('fields.serial'), t('fields.model'), t('units.repairs')]}
                rows={r.repeatUnits.map((u) => [
                  <Link key="l" to={`/units/${encodeURIComponent(u.serial)}`} style={{ fontFamily: 'monospace' }}>
                    {u.serial}
                  </Link>,
                  n.modelCode(u.modelId),
                  u.repairs,
                ])}
              />
            </Section>
            <Section title={t('kpi.scrapped')}>
              <SimpleTable
                head={[t('fields.serial'), t('fields.model'), t('repair.scrapReason'), t('reports.by')]}
                rows={r.scrapped.map((x) => [
                  <Link key="l" to={`/units/${encodeURIComponent(x.serial)}`} style={{ fontFamily: 'monospace' }}>
                    {x.serial}
                  </Link>,
                  n.modelCode(x.modelId),
                  x.reason,
                  n.user(x.userId),
                ])}
              />
            </Section>
          </SimpleGrid>
        </>
      )}
    </Stack>
  );
}

function Tile({ label, value, color, sub }: { label: string; value: ReactNode; color?: string; sub?: string }) {
  return (
    <Card withBorder padding="md">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={800} size="28px" c={color}>
        {value}
      </Text>
      {sub && (
        <Text size="xs" c="dimmed">
          {sub}
        </Text>
      )}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card withBorder padding="md">
      <Text fw={800} size="lg" mb="xs">
        {title}
      </Text>
      {children}
    </Card>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  const { t } = useTranslation();
  if (!rows.length) return <Text c="dimmed">{t('common.nothing')}</Text>;
  return (
    <Table striped>
      <Table.Thead>
        <Table.Tr>
          {head.map((h) => (
            <Table.Th key={h}>{h}</Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r, i) => (
          <Table.Tr key={i}>
            {r.map((c, j) => (
              <Table.Td key={j}>{c}</Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function YieldTable({ rows, label, target }: { rows: Row[]; label: (k: number | string) => string; target: number }) {
  const { t } = useTranslation();
  return (
    <SimpleTable
      head={['', t('kpi.tested'), t('kpi.failedFirst'), t('kpi.fpy')]}
      rows={rows.map((r) => [
        label(r.key),
        r.tested,
        r.failed,
        <Badge key="b" color={LEVEL[yieldLevel(r.fpy, r.target ?? target)]} variant="light">
          {pct(r.fpy)}
          {r.target != null && r.target !== target ? ` / ${r.target}%` : ''}
        </Badge>,
      ])}
    />
  );
}
