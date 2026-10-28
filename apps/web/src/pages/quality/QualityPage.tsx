import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Modal,
  NumberInput,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { tr } from '@gamut/core';
import { IconAlertTriangle, IconCheck, IconRepeat, IconX } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ResultBadge } from '../../components/StatusBadge';
import { ScanInput } from '../../components/ScanInput';
import { get, post } from '../../lib/api';
import { useNames } from '../../lib/catalog';
import { errorText, notifyError, notifyOk } from '../../lib/errors';
import { fmtMinutes, fmtTime, sinceMinutes } from '../../lib/format';
import { getStation } from '../../lib/station';
import type { ChecklistItem, RepairAction, Ticket, Unit } from '../../lib/types';

type Lookup = {
  serial: string;
  mode: 'first_test' | 'retest' | 'already_passed' | 'in_repair' | 'scrapped';
  unit: Unit | null;
  ticket: Ticket | null;
  repairs: RepairAction[];
  attempts: number;
  pastTickets: number;
  suggestedModelId: number | null;
  suggestedColorId: number | null;
  suggestedCategoryId: number | null;
  unknownModelCode: string | null;
  unknownColorCode: string | null;
};

type CheckState = { ok: boolean | null; value: number | null };

const LAST_KEY = 'gamut.quality.last';
const readLast = (): { modelId?: number; colorId?: number } => {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}');
  } catch {
    return {};
  }
};

function inRange(item: ChecklistItem, v: number) {
  return (item.min == null || v >= item.min) && (item.max == null || v <= item.max);
}

export function QualityPage() {
  const { t } = useTranslation();
  const n = useNames();
  const c = n.catalog;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const station = getStation();
  const scanRef = useRef<HTMLInputElement>(null);

  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [modelId, setModelId] = useState<number | null>(null);
  const [colorId, setColorId] = useState<number | null>(null);
  const [checks, setChecks] = useState<Record<number, CheckState>>({});
  const [failOpen, setFailOpen] = useState(false);
  const [defectId, setDefectId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);

  const summary = useQuery({ queryKey: ['quality-summary'], queryFn: () => get('/api/quality/summary'), refetchInterval: 30_000 });

  const model = c?.models.find((m) => m.id === modelId);
  const categoryId = lookup?.unit?.categoryId ?? model?.categoryId ?? lookup?.suggestedCategoryId ?? null;
  const items = useMemo(
    () => (c?.checklistItems ?? []).filter((i) => i.active && i.categoryId === categoryId).sort((a, b) => a.sort - b.sort),
    [c, categoryId],
  );

  const reset = () => {
    setLookup(null);
    setChecks({});
    setDefectId(null);
    setNotes('');
    setFailOpen(false);
    setTimeout(() => scanRef.current?.focus(), 50);
  };

  const scan = useMutation({
    mutationFn: (serial: string) => post<Lookup>('/api/scan', { serial }),
    onSuccess: (res) => {
      setScanError(null);
      const last = readLast();
      setLookup(res);
      setModelId(res.suggestedModelId ?? (res.unknownModelCode ? null : (last.modelId ?? null)));
      setColorId(res.suggestedColorId ?? (res.unknownColorCode ? null : (last.colorId ?? null)));
      setChecks({});
      setDefectId(null);
      setNotes('');
    },
    onError: (e) => {
      setLookup(null);
      setScanError(errorText(e, t));
    },
  });

  const record = useMutation({
    mutationFn: (result: 'pass' | 'fail') => {
      const list = items
        .map((it) => {
          const st = checks[it.id];
          if (result === 'pass') return { itemId: it.id, ok: true, value: st?.value ?? null };
          if (!st || st.ok === null) return null;
          return { itemId: it.id, ok: st.ok, value: st.value ?? null };
        })
        .filter(Boolean);
      return post('/api/tests', {
        serial: lookup!.serial,
        stationId: station?.id ?? null,
        modelId: lookup!.unit ? null : modelId,
        colorId: lookup!.unit ? null : colorId,
        result,
        defectCodeId: result === 'fail' ? defectId : null,
        checks: list,
        notes,
      });
    },
    onSuccess: (res: any, result) => {
      if (!lookup?.unit) {
        try {
          localStorage.setItem(LAST_KEY, JSON.stringify({ modelId, colorId }));
        } catch {
          /* ignore */
        }
      }
      notifyOk(
        result === 'pass'
          ? t('quality.passedMsg', { serial: res.serial })
          : t('quality.failedMsg', { serial: res.serial, number: res.ticket?.number ?? '' }),
      );
      qc.invalidateQueries();
      reset();
    },
    onError: (e) => notifyError(e, t),
  });

  const setCheck = (id: number, patch: Partial<CheckState>) =>
    setChecks((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { ok: null, value: null }), ...patch } }));

  const anyFailed = items.some((it) => checks[it.id]?.ok === false);
  const blocked = lookup?.mode === 'in_repair' || lookup?.mode === 'scrapped';
  const needsModel = !!lookup && !lookup.unit && !modelId;
  const failedItems = items.filter((it) => checks[it.id]?.ok === false);

  const categoryDefects = (c?.defectCodes ?? []).filter((d) => d.active && d.categoryId === categoryId);
  const s = summary.data;

  return (
    <Grid gutter="lg">
      <Grid.Col span={{ base: 12, lg: 8 }}>
        <Stack gap="md">
          <Title order={2}>{t('quality.title')}</Title>
          <ScanInput ref={scanRef} onScan={(v) => scan.mutate(v)} disabled={scan.isPending || record.isPending} />
          {scanError && (
            <Alert color="red" icon={<IconAlertTriangle />} title={t('common.error')}>
              {scanError}
            </Alert>
          )}

          {lookup && (
            <Card withBorder padding="lg" radius="md">
              <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={4}>
                    <Text ff="monospace" fw={800} size="28px">
                      {lookup.serial}
                    </Text>
                    <Group gap="xs">
                      <ModeBadge mode={lookup.mode} attempts={lookup.attempts} />
                      {lookup.pastTickets > 0 && lookup.mode !== 'retest' && (
                        <Badge color="orange" variant="light" size="lg">
                          {t('quality.pastRepairs', { count: lookup.pastTickets })}
                        </Badge>
                      )}
                    </Group>
                  </Stack>
                  <Button variant="subtle" color="gray" onClick={reset}>
                    {t('common.cancel')}
                  </Button>
                </Group>

                {lookup.mode === 'in_repair' && (
                  <Alert color="orange" icon={<IconAlertTriangle />} title={t('quality.inRepairTitle')}>
                    {t('quality.inRepairText', { number: lookup.ticket?.number, name: n.user(lookup.ticket?.assignedTo) })}
                  </Alert>
                )}
                {lookup.mode === 'scrapped' && (
                  <Alert color="dark" icon={<IconX />} title={t('status.unit.scrapped')}>
                    {t('quality.scrappedText')}
                  </Alert>
                )}
                {lookup.mode === 'already_passed' && (
                  <Alert color="yellow" icon={<IconAlertTriangle />}>
                    {t('quality.alreadyPassed', { date: fmtTime(lookup.unit?.releasedAt, n.lang) })}
                  </Alert>
                )}
                {lookup.mode === 'retest' && (
                  <Alert color="violet" icon={<IconRepeat />} title={t('quality.retestTitle', { number: lookup.ticket?.number })}>
                    <Stack gap={4}>
                      <Text size="sm">{t('quality.repairedBy', { name: n.user(lookup.ticket?.assignedTo) })}</Text>
                      {lookup.repairs.map((a) => (
                        <Text size="sm" key={a.id}>
                          • {n.action(a.actionTypeId)} — {n.component(a.componentId)}
                          {a.description ? `: ${a.description}` : ''}
                        </Text>
                      ))}
                    </Stack>
                  </Alert>
                )}
                {lookup.unknownModelCode && !lookup.unit && (
                  <Alert color="red" icon={<IconAlertTriangle />}>
                    {t('errors.unknown_model_code', { code: lookup.unknownModelCode })}
                  </Alert>
                )}
                {lookup.unknownColorCode && !lookup.unit && (
                  <Alert color="red" icon={<IconAlertTriangle />}>
                    {t('errors.unknown_color_code', { code: lookup.unknownColorCode })}
                  </Alert>
                )}

                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  {lookup.unit ? (
                    <>
                      <Info label={t('fields.model')} value={n.model(lookup.unit.modelId)} />
                      <Info label={t('fields.color')} value={n.color(lookup.unit.colorId)} />
                    </>
                  ) : (
                    <>
                      <Select
                        size="lg"
                        label={t('fields.model')}
                        searchable
                        required
                        value={modelId ? String(modelId) : null}
                        onChange={(v) => setModelId(v ? Number(v) : null)}
                        data={(c?.models ?? []).filter((m) => m.active).map((m) => ({ value: String(m.id), label: `${m.code} · ${m.name}` }))}
                        error={needsModel ? t('quality.pickModel') : undefined}
                      />
                      <Select
                        size="lg"
                        label={t('fields.color')}
                        searchable
                        clearable
                        value={colorId ? String(colorId) : null}
                        onChange={(v) => setColorId(v ? Number(v) : null)}
                        data={(c?.colors ?? []).filter((x) => x.active).map((x) => ({ value: String(x.id), label: `${x.code} · ${tr(x.name, n.lang)}` }))}
                      />
                    </>
                  )}
                </SimpleGrid>

                {!blocked && items.length > 0 && (
                  <Stack gap="xs">
                    <Text fw={700} size="lg">
                      {t('quality.checklist')}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {t('quality.checklistHint')}
                    </Text>
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xs">
                      {items.map((it) => {
                        const st = checks[it.id];
                        return (
                          <Card key={it.id} withBorder padding="xs" bg={st?.ok === false ? 'red.0' : st?.ok ? 'green.0' : undefined}>
                            <Group justify="space-between" wrap="nowrap">
                              <Text fw={600}>{tr(it.name, n.lang)}</Text>
                              {it.kind === 'measure' ? (
                                <NumberInput
                                  w={150}
                                  size="md"
                                  decimalScale={3}
                                  placeholder={`${it.min ?? ''}–${it.max ?? ''} ${it.unit}`}
                                  rightSection={<Text size="xs">{it.unit}</Text>}
                                  value={st?.value ?? ''}
                                  onChange={(v) => {
                                    const num = typeof v === 'number' ? v : null;
                                    setCheck(it.id, { value: num, ok: num === null ? null : inRange(it, num) });
                                  }}
                                  error={st?.ok === false}
                                />
                              ) : (
                                <Group gap={6} wrap="nowrap">
                                  <Button
                                    size="md"
                                    color="green"
                                    variant={st?.ok === true ? 'filled' : 'outline'}
                                    onClick={() => setCheck(it.id, { ok: st?.ok === true ? null : true })}
                                    aria-label="OK"
                                  >
                                    <IconCheck />
                                  </Button>
                                  <Button
                                    size="md"
                                    color="red"
                                    variant={st?.ok === false ? 'filled' : 'outline'}
                                    onClick={() => setCheck(it.id, { ok: st?.ok === false ? null : false })}
                                    aria-label="NOK"
                                  >
                                    <IconX />
                                  </Button>
                                </Group>
                              )}
                            </Group>
                          </Card>
                        );
                      })}
                    </SimpleGrid>
                  </Stack>
                )}

                {!blocked && (
                  <SimpleGrid cols={2}>
                    <Button
                      size="xl"
                      h={80}
                      color="green"
                      leftSection={<IconCheck size={32} />}
                      disabled={anyFailed || needsModel}
                      loading={record.isPending && record.variables === 'pass'}
                      onClick={() => record.mutate('pass')}
                      styles={{ label: { fontSize: 28 } }}
                    >
                      {t('quality.pass')}
                    </Button>
                    <Button
                      size="xl"
                      h={80}
                      color="red"
                      leftSection={<IconX size={32} />}
                      disabled={needsModel}
                      onClick={() => setFailOpen(true)}
                      styles={{ label: { fontSize: 28 } }}
                    >
                      {t('quality.fail')}
                    </Button>
                  </SimpleGrid>
                )}
              </Stack>
            </Card>
          )}
        </Stack>
      </Grid.Col>

      <Grid.Col span={{ base: 12, lg: 4 }}>
        <Stack gap="md">
          <Card withBorder padding="md">
            <Text fw={700} mb="xs">
              {t('quality.today')}
            </Text>
            <SimpleGrid cols={2} spacing="xs">
              <Stat label={t('kpi.tested')} value={s?.today.tested ?? 0} />
              <Stat label={t('kpi.fpy')} value={s?.today.fpy == null ? '—' : `${s.today.fpy}%`} />
              <Stat label={t('kpi.passedFirst')} value={s?.today.passed ?? 0} color="green" />
              <Stat label={t('kpi.failedFirst')} value={s?.today.failed ?? 0} color="red" />
              <Stat label={t('kpi.retested')} value={s?.today.retested ?? 0} />
              <Stat label={t('kpi.repairedPassed')} value={s?.today.retestPassed ?? 0} color="green" />
            </SimpleGrid>
          </Card>

          <Card withBorder padding="md">
            <Group justify="space-between" mb="xs">
              <Text fw={700}>{t('quality.retestQueue')}</Text>
              <Badge color="violet" size="lg">
                {s?.retestQueue.length ?? 0}
              </Badge>
            </Group>
            <ScrollArea.Autosize mah={260}>
              {s?.retestQueue.length ? (
                <Table>
                  <Table.Tbody>
                    {s.retestQueue.map((r: any) => (
                      <Table.Tr key={r.ticketId} style={{ cursor: 'pointer' }} onClick={() => scan.mutate(r.serial)}>
                        <Table.Td ff="monospace" fw={600}>
                          {r.serial}
                        </Table.Td>
                        <Table.Td>{n.modelCode(r.modelId)}</Table.Td>
                        <Table.Td>{n.user(r.assignedTo)}</Table.Td>
                        <Table.Td c="dimmed">{fmtMinutes(sinceMinutes(r.sentToTestAt), t)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : (
                <Text c="dimmed" size="sm">
                  {t('common.nothing')}
                </Text>
              )}
            </ScrollArea.Autosize>
          </Card>

          <Card withBorder padding="md">
            <Text fw={700} mb="xs">
              {t('quality.myRecent')}
            </Text>
            <ScrollArea.Autosize mah={360}>
              <Table>
                <Table.Tbody>
                  {(s?.recent ?? []).map((r: any) => (
                    <Table.Tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/units/${encodeURIComponent(r.serial)}`)}>
                      <Table.Td c="dimmed">{fmtTime(r.testedAt, n.lang)}</Table.Td>
                      <Table.Td ff="monospace">{r.serial}</Table.Td>
                      <Table.Td>
                        <ResultBadge result={r.result} size="sm" />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          </Card>
        </Stack>
      </Grid.Col>

      <Modal opened={failOpen} onClose={() => setFailOpen(false)} title={<Text fw={700} size="xl">{t('quality.failTitle')}</Text>} size="lg" centered>
        <Stack>
          {failedItems.length > 0 && (
            <Text c="red">✗ {failedItems.map((it) => tr(it.name, n.lang)).join(', ')}</Text>
          )}
          <Select
            size="lg"
            label={t('fields.defect')}
            required
            searchable
            data-autofocus
            value={defectId ? String(defectId) : null}
            onChange={(v) => setDefectId(v ? Number(v) : null)}
            data={categoryDefects.map((d) => ({ value: String(d.id), label: `${d.code} — ${tr(d.name, n.lang)}` }))}
            comboboxProps={{ withinPortal: true }}
          />
          <Textarea size="md" label={t('fields.notes')} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} autosize minRows={2} />
          <Button size="xl" color="red" disabled={!defectId} loading={record.isPending} onClick={() => record.mutate('fail')}>
            {t('quality.confirmFail')}
          </Button>
        </Stack>
      </Modal>
    </Grid>
  );
}

function ModeBadge({ mode, attempts }: { mode: Lookup['mode']; attempts: number }) {
  const { t } = useTranslation();
  const map = {
    first_test: { color: 'blue', label: t('quality.mode.first_test') },
    retest: { color: 'violet', label: t('quality.mode.retest', { n: attempts + 1 }) },
    already_passed: { color: 'yellow', label: t('quality.mode.already_passed') },
    in_repair: { color: 'orange', label: t('quality.mode.in_repair') },
    scrapped: { color: 'dark', label: t('quality.mode.scrapped') },
  } as const;
  return (
    <Badge size="xl" color={map[mode].color}>
      {map[mode].label}
    </Badge>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0}>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="lg">
        {value}
      </Text>
    </Stack>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={800} size="xl" c={color}>
        {value}
      </Text>
    </Stack>
  );
}
