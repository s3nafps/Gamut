import { Badge, Button, Card, Group, Modal, SimpleGrid, Stack, Text, Textarea, Title } from '@mantine/core';
import { IconArrowLeft, IconPrinter, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PhotoGallery } from '../../components/Photos';
import { TicketStatusBadge, UnitStatusBadge } from '../../components/StatusBadge';
import { UnitTimeline } from '../../components/UnitTimeline';
import { get, post } from '../../lib/api';
import { useNames } from '../../lib/catalog';
import { errorText, notifyError } from '../../lib/errors';
import { fmtDateTime } from '../../lib/format';
import { useSession } from '../../lib/session';
import type { UnitHistory } from '../../lib/types';

export function UnitPage() {
  const { serial = '' } = useParams();
  const { t } = useTranslation();
  const n = useNames();
  const { can } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [scrapOpen, setScrapOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { data, error, isLoading } = useQuery({ queryKey: ['unit', serial], queryFn: () => get<UnitHistory>(`/api/units/${encodeURIComponent(serial)}/history`) });
  const scrap = useMutation({
    mutationFn: () => post(`/api/units/${data!.unit.id}/scrap`, { reason }),
    onSuccess: () => {
      setScrapOpen(false);
      qc.invalidateQueries();
    },
    onError: (e) => notifyError(e, t),
  });

  if (isLoading) return <Text>{t('common.loading')}</Text>;
  if (error || !data) return <Text c="red">{errorText(error, t)}</Text>;
  const { unit } = data;
  const repairMinutes = data.actions.reduce((sum, a) => sum + (a.durationMin ?? 0), 0);

  return (
    <Stack gap="md">
      <Group justify="space-between" className="no-print">
        <Button variant="subtle" leftSection={<IconArrowLeft className="flip-rtl" />} onClick={() => navigate(-1)}>
          {t('common.back')}
        </Button>
        <Button variant="light" leftSection={<IconPrinter size={18} />} onClick={() => window.print()}>
          {t('common.print')}
        </Button>
      </Group>
      <Card withBorder padding="lg">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Text ff="monospace" fw={800} size="28px">
              {unit.serial}
            </Text>
            <Text size="lg">
              {n.category(unit.categoryId)} · {n.model(unit.modelId)} · {n.color(unit.colorId)}
            </Text>
          </Stack>
          <Stack align="flex-end" gap="xs">
            <UnitStatusBadge status={unit.status} size="xl" />
            {unit.firstPass !== null && (
              <Badge color={unit.firstPass ? 'green' : 'orange'} variant="light" size="lg">
                {unit.firstPass ? t('units.firstPassYes') : t('units.firstPassNo')}
              </Badge>
            )}
          </Stack>
        </Group>
        <SimpleGrid cols={{ base: 2, md: 5 }} mt="md">
          <Info label={t('units.firstScan')} value={fmtDateTime(unit.createdAt, n.lang)} />
          <Info label={t('units.released')} value={fmtDateTime(unit.releasedAt, n.lang)} />
          <Info label={t('units.production')} value={unit.productionYear ? `${String(unit.productionMonth ?? '').padStart(2, '0')}/${unit.productionYear}` : '—'} />
          <Info label={t('units.tests')} value={String(data.tests.length)} />
          <Info label={t('units.repairTime')} value={t('time.minutes', { count: repairMinutes })} />
        </SimpleGrid>
        {can('supervise') && unit.status !== 'scrapped' && (
          <Button mt="md" color="dark" variant="outline" leftSection={<IconTrash />} onClick={() => setScrapOpen(true)} className="no-print">
            {t('repair.scrap')}
          </Button>
        )}
      </Card>

      {data.tickets.length > 0 && (
        <Card withBorder padding="md">
          <Title order={4} mb="sm">
            {t('units.repairs')}
          </Title>
          <Stack gap="xs">
            {data.tickets.map((tk) => (
              <Group key={tk.id} justify="space-between">
                <Group gap="sm">
                  <Text component={Link} to={`/repair/ticket/${tk.id}`} fw={700} c="blue">
                    {tk.number}
                  </Text>
                  <TicketStatusBadge status={tk.status} size="md" />
                  {tk.retestFails > 0 && <Badge color="red">{t('repair.retestFails', { count: tk.retestFails })}</Badge>}
                </Group>
                <Text c="dimmed">
                  {n.user(tk.assignedTo)} · {fmtDateTime(tk.openedAt, n.lang)}
                </Text>
              </Group>
            ))}
          </Stack>
        </Card>
      )}

      {data.photos.length > 0 && (
        <Card withBorder padding="md">
          <Title order={4} mb="sm">
            {t('photos.title')}
          </Title>
          <PhotoGallery photos={data.photos} />
        </Card>
      )}

      <Card withBorder padding="md">
        <Title order={4} mb="sm">
          {t('units.history')}
        </Title>
        <UnitTimeline tests={data.tests} actions={data.actions} diagnoses={data.diagnoses} events={data.events} tickets={data.tickets} />
      </Card>

      <Modal opened={scrapOpen} onClose={() => setScrapOpen(false)} title={<Text fw={700}>{t('repair.scrap')}</Text>} centered>
        <Stack>
          <Textarea label={t('repair.scrapReason')} value={reason} onChange={(e) => setReason(e.currentTarget.value)} autosize minRows={2} />
          <Button color="dark" disabled={reason.trim().length < 3} loading={scrap.isPending} onClick={() => scrap.mutate()}>
            {t('common.confirm')}
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0}>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={600}>{value}</Text>
    </Stack>
  );
}
