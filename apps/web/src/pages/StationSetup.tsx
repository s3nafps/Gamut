import { Button, Card, Center, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconChartBar, IconClipboardCheck, IconTool } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { get } from '../lib/api';
import { setStation, type Station } from '../lib/station';

const ICONS = { quality: IconClipboardCheck, repair: IconTool, display: IconChartBar };

/** One-time setup on each PC: which station is this? */
export function StationSetup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({ queryKey: ['public-stations'], queryFn: () => get<Station[]>('/api/public/stations') });

  return (
    <Center mih="100vh" p="xl">
      <Stack w={900} maw="100%" gap="lg">
        <Group justify="space-between">
          <Title order={1}>{t('setup.title')}</Title>
          <LanguageSwitch persist={false} />
        </Group>
        <Text size="lg" c="dimmed">
          {t('setup.text')}
        </Text>
        {isLoading && <Loader />}
        {error && <Text c="red">{t('errors.network')}</Text>}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {data?.map((st) => {
            const Icon = ICONS[st.type];
            return (
              <Card key={st.id} withBorder padding="lg" radius="md">
                <Stack align="center" gap="sm">
                  <Icon size={48} />
                  <Text fw={700} size="xl">
                    {st.name}
                  </Text>
                  <Text c="dimmed">{t(`setup.type.${st.type}`)}</Text>
                  <Button
                    fullWidth
                    size="lg"
                    onClick={() => {
                      setStation(st);
                      navigate(st.type === 'display' ? '/line' : '/', { replace: true });
                    }}
                  >
                    {t('setup.choose')}
                  </Button>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      </Stack>
    </Center>
  );
}
