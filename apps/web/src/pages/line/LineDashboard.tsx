import { Box, Group, SegmentedControl, SimpleGrid, Stack, Text } from '@mantine/core';
import { tr, yieldLevel } from '@gamut/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { get } from '../../lib/api';
import { fmtMinutes, locale, sinceMinutes } from '../../lib/format';
import { useLive } from '../../lib/live';
import { getStation } from '../../lib/station';

type Dash = {
  now: string;
  target: number;
  tested: number;
  passedFirst: number;
  failedFirst: number;
  repairedPassed: number;
  scrapped: number;
  fpy: number | null;
  hourly: Array<{ hour: number; tested: number; failed: number }>;
  topDefects: Array<{ id: number; code: string; name: any; count: number }>;
  byModel: Array<{ id: number; code: string; name: string; tested: number; failed: number; fpy: number | null }>;
  inRepair: number;
  waitingParts: number;
  waitingRetest: number;
  alerts: number;
  oldestInRepairSince: string | null;
};

const BG = '#0b1220';
const PANEL = '#131d33';
const LEVEL_COLOR = { good: '#2fb344', warning: '#f59f00', bad: '#e03131', none: '#868e96' };

function Panel({ children, p = 'lg' }: { children: React.ReactNode; p?: string }) {
  return (
    <Box p={p} style={{ background: PANEL, borderRadius: 16 }}>
      {children}
    </Box>
  );
}

function Tile({ label, value, color = '#fff', sub }: { label: string; value: React.ReactNode; color?: string; sub?: string }) {
  return (
    <Panel>
      <Text c="#9aa7bd" fw={600} size="xl">
        {label}
      </Text>
      <Text fw={900} style={{ fontSize: 64, lineHeight: 1.1, color }}>
        {value}
      </Text>
      {sub && (
        <Text c="#9aa7bd" size="lg">
          {sub}
        </Text>
      )}
    </Panel>
  );
}

function HourlyChart({ data, t }: { data: Dash['hourly']; t: (k: string) => string }) {
  const max = Math.max(1, ...data.map((d) => d.tested));
  const w = 100 / Math.max(1, data.length);
  return (
    <Box>
      <svg viewBox="0 0 100 50" width="100%" height="260" preserveAspectRatio="none" style={{ direction: 'ltr' }}>
        {data.map((d, i) => {
          const h = (d.tested / max) * 44;
          const fh = (d.failed / max) * 44;
          return (
            <g key={d.hour}>
              <rect x={i * w + w * 0.15} y={46 - h} width={w * 0.7} height={h} fill="#2f6fde" rx={0.6} />
              <rect x={i * w + w * 0.15} y={46 - fh} width={w * 0.7} height={fh} fill="#e03131" rx={0.6} />
            </g>
          );
        })}
      </svg>
      <Group justify="space-between" wrap="nowrap" style={{ direction: 'ltr' }}>
        {data.map((d) => (
          <Text key={d.hour} c="#9aa7bd" size="md" ta="center" style={{ width: `${w}%` }}>
            {String(d.hour).padStart(2, '0')}h
            <br />
            <b style={{ color: '#fff' }}>{d.tested}</b>
            {d.failed > 0 && <span style={{ color: '#ff6b6b' }}> / {d.failed}</span>}
          </Text>
        ))}
      </Group>
      <Group gap="lg" mt="xs">
        <Text c="#9aa7bd">
          <span style={{ color: '#2f6fde' }}>■</span> {t('kpi.tested')}
        </Text>
        <Text c="#9aa7bd">
          <span style={{ color: '#e03131' }}>■</span> {t('kpi.failedFirst')}
        </Text>
      </Group>
    </Box>
  );
}

/** Production line big screen. Read-only, no login, refreshes by itself. */
export function LineDashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const connected = useLive();
  const station = getStation();
  const [now, setNow] = useState(new Date());
  const { data } = useQuery({ queryKey: ['line-dashboard'], queryFn: () => get<Dash>('/api/public/dashboard'), refetchInterval: 30_000 });

  useEffect(() => {
    if (station?.type === 'display' && station.language && !sessionStorage.getItem('gamut.lineLangSet')) {
      i18n.changeLanguage(station.language);
      sessionStorage.setItem('gamut.lineLangSet', '1');
    }
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, [i18n, station]);

  const level = yieldLevel(data?.fpy ?? null, data?.target ?? 95);
  const maxDefect = Math.max(1, ...(data?.topDefects ?? []).map((d) => d.count));

  return (
    <Box mih="100vh" p="lg" style={{ background: BG, color: '#fff' }}>
      <Stack gap="lg">
        <Group justify="space-between">
          <Group gap="md">
            <Text fw={900} style={{ fontSize: 40 }}>
              {t('line.title')}
            </Text>
            <Text c="#9aa7bd" style={{ fontSize: 28 }}>
              {t('line.today')}
            </Text>
            {!connected && (
              <Text c="red" fw={800} size="xl">
                ● {t('connection.lostTitle')}
              </Text>
            )}
          </Group>
          <Group gap="lg">
            <Text fw={800} style={{ fontSize: 40, fontVariantNumeric: 'tabular-nums' }}>
              {new Intl.DateTimeFormat(locale(lang), { timeStyle: 'short' }).format(now)}
            </Text>
            <SegmentedControl
              value={lang}
              onChange={(v) => i18n.changeLanguage(v)}
              data={[
                { value: 'fr', label: 'FR' },
                { value: 'ar', label: 'ع' },
                { value: 'en', label: 'EN' },
              ]}
            />
            {station?.type !== 'display' && (
              <Link to="/" style={{ color: '#9aa7bd' }}>
                ✕
              </Link>
            )}
          </Group>
        </Group>

        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="lg">
          <Panel>
            <Text c="#9aa7bd" fw={600} size="xl">
              {t('kpi.fpy')}
            </Text>
            <Text fw={900} style={{ fontSize: 88, lineHeight: 1, color: LEVEL_COLOR[level] }}>
              {data?.fpy == null ? '—' : `${data.fpy}%`}
            </Text>
            <Text c="#9aa7bd" size="xl">
              {t('line.target', { value: data?.target ?? '—' })}
            </Text>
          </Panel>
          <Tile label={t('kpi.tested')} value={data?.tested ?? 0} />
          <Tile label={t('kpi.passedFirst')} value={data?.passedFirst ?? 0} color="#2fb344" />
          <Tile label={t('kpi.failedFirst')} value={data?.failedFirst ?? 0} color="#ff6b6b" />
          <Tile
            label={t('kpi.inRepair')}
            value={data?.inRepair ?? 0}
            color="#f59f00"
            sub={data?.oldestInRepairSince ? t('line.oldest', { time: fmtMinutes(sinceMinutes(data.oldestInRepairSince), t) }) : undefined}
          />
          <Tile label={t('kpi.waitingRetest')} value={data?.waitingRetest ?? 0} color="#b197fc" />
          <Tile label={t('kpi.repairedPassed')} value={data?.repairedPassed ?? 0} color="#2fb344" />
          <Tile
            label={t('kpi.scrapped')}
            value={data?.scrapped ?? 0}
            sub={data?.alerts ? t('line.alerts', { count: data.alerts }) : undefined}
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
          <Panel>
            <Text fw={800} size="xl" mb="md">
              {t('line.byHour')}
            </Text>
            <HourlyChart data={data?.hourly ?? []} t={t} />
          </Panel>
          <Panel>
            <Text fw={800} size="xl" mb="md">
              {t('line.topDefects')}
            </Text>
            <Stack gap="sm">
              {(data?.topDefects ?? []).length === 0 && (
                <Text c="#9aa7bd" size="xl">
                  {t('line.noDefects')}
                </Text>
              )}
              {(data?.topDefects ?? []).map((d) => (
                <Box key={d.id}>
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="xl" fw={600}>
                      <span style={{ color: '#9aa7bd', fontFamily: 'monospace' }}>{d.code}</span> {tr(d.name, lang)}
                    </Text>
                    <Text size="xl" fw={900}>
                      {d.count}
                    </Text>
                  </Group>
                  <Box h={10} mt={4} style={{ background: '#1f2b47', borderRadius: 6 }}>
                    <Box h={10} style={{ width: `${(d.count / maxDefect) * 100}%`, background: '#e03131', borderRadius: 6 }} />
                  </Box>
                </Box>
              ))}
            </Stack>

            {(data?.byModel ?? []).length > 0 && (
              <>
                <Text fw={800} size="xl" mt="xl" mb="sm">
                  {t('line.byModel')}
                </Text>
                <Stack gap={6}>
                  {data!.byModel.slice(0, 6).map((m) => (
                    <Group key={m.id} justify="space-between" wrap="nowrap">
                      <Text size="lg">
                        <b>{m.code}</b> <span style={{ color: '#9aa7bd' }}>{m.name}</span>
                      </Text>
                      <Text size="lg" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {m.tested} · <span style={{ color: '#ff6b6b' }}>{m.failed}</span> ·{' '}
                        <span style={{ color: LEVEL_COLOR[yieldLevel(m.fpy, data!.target)] }}>{m.fpy == null ? '—' : `${m.fpy}%`}</span>
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </>
            )}
          </Panel>
        </SimpleGrid>
      </Stack>
    </Box>
  );
}
