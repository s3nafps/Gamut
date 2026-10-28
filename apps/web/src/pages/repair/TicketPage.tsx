import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { tr } from '@gamut/core';
import { IconAlertTriangle, IconArrowLeft, IconHandGrab, IconPackage, IconPlayerPlay, IconSend, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TicketStatusBadge } from '../../components/StatusBadge';
import { UnitTimeline } from '../../components/UnitTimeline';
import { get, post } from '../../lib/api';
import { useNames } from '../../lib/catalog';
import { notifyError, notifyOk } from '../../lib/errors';
import { fmtDateTime } from '../../lib/format';
import { useSession } from '../../lib/session';
import { getStation } from '../../lib/station';
import type { Diagnosis, EventRow, RepairAction, Test, Ticket, Unit } from '../../lib/types';

type Detail = {
  ticket: Ticket;
  unit: Unit;
  tests: Test[];
  actions: RepairAction[];
  diagnoses: Diagnosis[];
  events: EventRow[];
  otherTickets: Ticket[];
  otherActions: RepairAction[];
};

export function TicketPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const n = useNames();
  const c = n.catalog;
  const { user, can } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const station = getStation();
  const { data, isLoading } = useQuery({ queryKey: ['ticket', id], queryFn: () => get<Detail>(`/api/tickets/${id}`) });

  const [diag, setDiag] = useState<{ defectCodeId: string | null; notes: string }>({ defectCodeId: null, notes: '' });
  const [act, setAct] = useState<{ componentId: string | null; actionTypeId: string | null; description: string; parts: string; durationMin: number | '' }>({
    componentId: null,
    actionTypeId: null,
    description: '',
    parts: '',
    durationMin: '',
  });
  const [confirmSend, setConfirmSend] = useState(false);
  const [scrapOpen, setScrapOpen] = useState(false);
  const [scrapReason, setScrapReason] = useState('');

  const run = (fn: () => Promise<unknown>, okMsg?: string, after?: () => void) => ({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries();
      if (okMsg) notifyOk(okMsg);
      after?.();
    },
    onError: (e: unknown) => notifyError(e, t),
  });

  const claim = useMutation(run(() => post(`/api/tickets/${id}/claim`)));
  const parts = useMutation({ ...run(() => Promise.resolve()), mutationFn: (waiting: boolean) => post(`/api/tickets/${id}/parts`, { waiting }) });
  const addDiag = useMutation(
    run(
      () => post(`/api/tickets/${id}/diagnoses`, { defectCodeId: Number(diag.defectCodeId), notes: diag.notes }),
      t('repair.saved'),
      () => setDiag({ defectCodeId: null, notes: '' }),
    ),
  );
  const addAct = useMutation(
    run(
      () =>
        post(`/api/tickets/${id}/actions`, {
          componentId: Number(act.componentId),
          actionTypeId: Number(act.actionTypeId),
          description: act.description,
          parts: act.parts,
          durationMin: act.durationMin === '' ? null : act.durationMin,
          stationId: station?.id ?? null,
        }),
      t('repair.saved'),
      () => setAct({ componentId: null, actionTypeId: null, description: '', parts: '', durationMin: '' }),
    ),
  );
  const send = useMutation(run(() => post(`/api/tickets/${id}/send-to-test`), t('repair.sentMsg'), () => navigate('/repair')));
  const assign = useMutation({ ...run(() => Promise.resolve()), mutationFn: (userId: number) => post(`/api/tickets/${id}/assign`, { userId }) });
  const scrap = useMutation(run(() => post(`/api/units/${data?.unit.id}/scrap`, { reason: scrapReason }), t('repair.scrappedMsg'), () => navigate('/repair')));

  if (isLoading || !data || !c) return <Text>{t('common.loading')}</Text>;
  const { ticket, unit } = data;
  const categoryId = unit.categoryId;
  const mineOrSupervisor = ticket.assignedTo === user?.id || can('supervise');
  const workable = ['in_repair', 'waiting_parts'].includes(ticket.status) && mineOrSupervisor && can('repair');
  const fails = data.tests.filter((x) => x.ticketId === ticket.id && x.result === 'fail');
  const lastFail = fails[fails.length - 1];

  const defects = c.defectCodes.filter((d) => d.active && d.categoryId === categoryId).map((d) => ({ value: String(d.id), label: `${d.code} — ${tr(d.name, n.lang)}` }));
  const components = c.components.filter((x) => x.active && x.categoryId === categoryId).map((x) => ({ value: String(x.id), label: tr(x.name, n.lang) }));
  const actionTypes = c.actionTypes.filter((x) => x.active).map((x) => ({ value: String(x.id), label: tr(x.name, n.lang) }));
  const repairmen = c.users.filter((u) => u.active && (u.roles.includes('repairman') || u.roles.includes('supervisor'))).map((u) => ({ value: String(u.id), label: u.fullName }));

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Button component={Link} to="/repair" variant="subtle" leftSection={<IconArrowLeft className="flip-rtl" />}>
          {t('common.back')}
        </Button>
        <Button component={Link} to={`/units/${encodeURIComponent(unit.serial)}`} variant="light">
          {t('repair.fullHistory')}
        </Button>
      </Group>

      <Card withBorder padding="lg">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Text ff="monospace" fw={800} size="28px">
              {unit.serial}
            </Text>
            <Text size="lg">
              {n.model(unit.modelId)} · {n.color(unit.colorId)}
            </Text>
            <Text c="dimmed">
              {ticket.number} · {t('repair.openedAt', { date: fmtDateTime(ticket.openedAt, n.lang) })}
            </Text>
          </Stack>
          <Stack align="flex-end" gap="xs">
            <TicketStatusBadge status={ticket.status} size="xl" />
            <Text>{t('repair.assignedTo', { name: n.user(ticket.assignedTo) })}</Text>
            {ticket.retestFails > 0 && <Badge color="red" size="lg">{t('repair.retestFails', { count: ticket.retestFails })}</Badge>}
          </Stack>
        </Group>
        <Group mt="md">
          {ticket.status === 'waiting_repair' && can('repair') && (
            <Button size="lg" leftSection={<IconHandGrab />} loading={claim.isPending} onClick={() => claim.mutate()}>
              {t('repair.claim')}
            </Button>
          )}
          {workable && ticket.status === 'in_repair' && (
            <Button size="lg" color="yellow" variant="light" leftSection={<IconPackage />} onClick={() => parts.mutate(true)}>
              {t('repair.waitParts')}
            </Button>
          )}
          {workable && ticket.status === 'waiting_parts' && (
            <Button size="lg" variant="light" leftSection={<IconPlayerPlay />} onClick={() => parts.mutate(false)}>
              {t('repair.resume')}
            </Button>
          )}
          {workable && ticket.status === 'in_repair' && (
            <Button size="lg" color="violet" leftSection={<IconSend />} disabled={data.actions.length === 0} onClick={() => setConfirmSend(true)}>
              {t('repair.sendToTest')}
            </Button>
          )}
          {can('supervise') && ['waiting_repair', 'in_repair', 'waiting_parts'].includes(ticket.status) && (
            <Select
              size="md"
              w={240}
              placeholder={t('repair.assign')}
              data={repairmen}
              value={null}
              onChange={(v) => v && assign.mutate(Number(v))}
            />
          )}
          {can('supervise') && !['closed', 'scrapped'].includes(ticket.status) && (
            <Button size="md" color="dark" variant="outline" leftSection={<IconTrash />} onClick={() => setScrapOpen(true)}>
              {t('repair.scrap')}
            </Button>
          )}
        </Group>
        {workable && data.actions.length === 0 && (
          <Text size="sm" c="dimmed" mt="xs">
            {t('repair.needAction')}
          </Text>
        )}
      </Card>

      {ticket.alert && (
        <Alert color="red" variant="filled" icon={<IconAlertTriangle />}>
          {t('repair.alertText', { count: ticket.retestFails })}
        </Alert>
      )}
      {data.otherTickets.length > 0 && (
        <Alert color="orange" icon={<IconAlertTriangle />} title={t('repair.repeatTitle')}>
          {t('repair.repeatText', { count: data.otherTickets.length })}
        </Alert>
      )}

      <Grid>
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Stack gap="md">
            {lastFail && (
              <Card withBorder padding="md" style={{ borderColor: 'var(--mantine-color-red-6)' }}>
                <Text fw={800} size="lg" c="red" mb="xs">
                  {t('repair.testFindings')}
                </Text>
                <Text fw={700} size="lg">
                  {n.defect(lastFail.defectCodeId)}
                </Text>
                {lastFail.checks.filter((x) => !x.ok).length > 0 && (
                  <Text c="red">✗ {lastFail.checks.filter((x) => !x.ok).map((x) => n.check(x.itemId)).join(', ')}</Text>
                )}
                {lastFail.notes && <Text>“{lastFail.notes}”</Text>}
                <Text size="sm" c="dimmed" mt={4}>
                  {t('timeline.by', { name: n.user(lastFail.testedBy) })} · {fmtDateTime(lastFail.testedAt, n.lang)}
                </Text>
              </Card>
            )}

            {workable && (
              <Card withBorder padding="md">
                <Text fw={800} size="lg" mb="xs">
                  {t('repair.addAction')}
                </Text>
                <Stack gap="sm">
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <Select size="lg" label={t('fields.component')} searchable data={components} value={act.componentId} onChange={(v) => setAct({ ...act, componentId: v })} />
                    <Select size="lg" label={t('fields.actionType')} data={actionTypes} value={act.actionTypeId} onChange={(v) => setAct({ ...act, actionTypeId: v })} />
                  </SimpleGrid>
                  <Textarea size="md" label={t('fields.description')} autosize minRows={2} value={act.description} onChange={(e) => setAct({ ...act, description: e.currentTarget.value })} />
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <TextInput size="md" label={t('repair.parts')} placeholder={t('repair.partsHint')} value={act.parts} onChange={(e) => setAct({ ...act, parts: e.currentTarget.value })} />
                    <NumberInput size="md" label={t('fields.durationMin')} min={0} max={1440} value={act.durationMin} onChange={(v) => setAct({ ...act, durationMin: typeof v === 'number' ? v : '' })} />
                  </SimpleGrid>
                  <Button size="lg" disabled={!act.componentId || !act.actionTypeId} loading={addAct.isPending} onClick={() => addAct.mutate()}>
                    {t('repair.saveAction')}
                  </Button>
                </Stack>
              </Card>
            )}

            {workable && (
              <Card withBorder padding="md">
                <Text fw={800} size="lg" mb="xs">
                  {t('repair.addDiagnosis')}
                </Text>
                <Stack gap="sm">
                  <Select size="lg" label={t('repair.faultFound')} searchable data={defects} value={diag.defectCodeId} onChange={(v) => setDiag({ ...diag, defectCodeId: v })} />
                  <Textarea size="md" label={t('fields.notes')} autosize minRows={1} value={diag.notes} onChange={(e) => setDiag({ ...diag, notes: e.currentTarget.value })} />
                  <Button size="md" variant="light" disabled={!diag.defectCodeId} loading={addDiag.isPending} onClick={() => addDiag.mutate()}>
                    {t('repair.saveDiagnosis')}
                  </Button>
                </Stack>
              </Card>
            )}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Card withBorder padding="md">
            <Title order={4} mb="sm">
              {t('repair.thisRepair')}
            </Title>
            <UnitTimeline
              tests={data.tests.filter((x) => x.ticketId === ticket.id)}
              actions={data.actions}
              diagnoses={data.diagnoses}
              events={data.events}
              tickets={[ticket, ...data.otherTickets]}
            />
          </Card>
        </Grid.Col>
      </Grid>

      <Modal opened={confirmSend} onClose={() => setConfirmSend(false)} title={<Text fw={700}>{t('repair.sendToTest')}</Text>} centered>
        <Stack>
          <Text>{t('repair.sendConfirm', { serial: unit.serial })}</Text>
          <Button size="lg" color="violet" loading={send.isPending} onClick={() => send.mutate()}>
            {t('common.confirm')}
          </Button>
        </Stack>
      </Modal>
      <Modal opened={scrapOpen} onClose={() => setScrapOpen(false)} title={<Text fw={700}>{t('repair.scrap')}</Text>} centered>
        <Stack>
          <Textarea label={t('repair.scrapReason')} value={scrapReason} onChange={(e) => setScrapReason(e.currentTarget.value)} autosize minRows={2} />
          <Button color="dark" disabled={scrapReason.trim().length < 3} loading={scrap.isPending} onClick={() => scrap.mutate()}>
            {t('common.confirm')}
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
