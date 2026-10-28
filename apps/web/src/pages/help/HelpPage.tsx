import { Card, List, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconChartBar, IconClipboardCheck, IconSettings, IconTool, IconUserShield } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../lib/session';

const SECTIONS = [
  { key: 'tester', icon: IconClipboardCheck, color: 'blue', steps: 7, show: (can: (p: any) => boolean) => can('test') },
  { key: 'repairman', icon: IconTool, color: 'orange', steps: 7, show: (can: (p: any) => boolean) => can('repair') },
  { key: 'supervisor', icon: IconUserShield, color: 'grape', steps: 6, show: (can: (p: any) => boolean) => can('supervise') },
  { key: 'admin', icon: IconSettings, color: 'dark', steps: 6, show: (can: (p: any) => boolean) => can('admin') },
  { key: 'line', icon: IconChartBar, color: 'teal', steps: 3, show: () => true },
] as const;

/** Short how-to for each role, in the person's language. */
export function HelpPage() {
  const { t } = useTranslation();
  const { can } = useSession();
  return (
    <Stack gap="md">
      <Title order={2}>{t('help.title')}</Title>
      <Text c="dimmed">{t('help.intro')}</Text>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        {SECTIONS.filter((s) => s.show(can)).map((s) => (
          <Card key={s.key} withBorder padding="lg">
            <Stack gap="sm">
              <Title order={3}>
                <ThemeIcon color={s.color} size="lg" radius="md" me="sm" style={{ verticalAlign: 'middle' }}>
                  <s.icon size={20} />
                </ThemeIcon>
                {t(`help.${s.key}.title`)}
              </Title>
              <List type="ordered" spacing="xs" size="md">
                {Array.from({ length: s.steps }, (_, i) => (
                  <List.Item key={i}>{t(`help.${s.key}.s${i + 1}`)}</List.Item>
                ))}
              </List>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
      <Card withBorder padding="lg">
        <Title order={4} mb="xs">
          {t('help.rulesTitle')}
        </Title>
        <List spacing="xs">
          {[1, 2, 3, 4, 5].map((i) => (
            <List.Item key={i}>{t(`help.rules.r${i}`)}</List.Item>
          ))}
        </List>
      </Card>
    </Stack>
  );
}
