import { ActionIcon, Alert, AppShell, Badge, Button, Group, Menu, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconBox,
  IconChartBar,
  IconFileAnalytics,
  IconHelp,
  IconHistory,
  IconLock,
  IconChevronDown,
  IconClipboardCheck,
  IconDeviceDesktop,
  IconLogout,
  IconSearch,
  IconSettings,
  IconTool,
  IconUser,
  IconWifiOff,
} from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router-dom';
import { useCatalog } from '../lib/catalog';
import { useLive } from '../lib/live';
import { useIdleLock, useSession } from '../lib/session';
import { getStation } from '../lib/station';
import { ChangePinModal, WeakPinBanner } from './ChangePin';
import { LanguageSwitch } from './LanguageSwitch';

function NavButton({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  // Smaller screens (e.g. 1366 px): icons only, the name shows on hover.
  const wide = useMediaQuery('(min-width: 1500px)', true);
  return (
    <NavLink to={to} style={{ textDecoration: 'none' }} aria-label={label}>
      {({ isActive }) =>
        wide ? (
          <Button variant={isActive ? 'filled' : 'subtle'} color={isActive ? 'blue' : 'gray'} leftSection={icon} size="md" px="sm">
            {label}
          </Button>
        ) : (
          <Tooltip label={label}>
            <ActionIcon variant={isActive ? 'filled' : 'subtle'} color={isActive ? 'blue' : 'gray'} size={42}>
              {icon}
            </ActionIcon>
          </Tooltip>
        )
      }
    </NavLink>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, logout, can, weakPin } = useSession();
  const [pinOpen, setPinOpen] = useState(false);
  const connected = useLive();
  const { data: catalog } = useCatalog();
  useIdleLock(catalog?.settings.idleLockMinutes);
  const station = getStation();
  const navigate = useNavigate();

  return (
    <AppShell header={{ height: 64 }} padding="md">
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Text fw={800} size="xl" c="blue">
              Gamut
            </Text>
            {station && (
              <Badge size="lg" variant="light" leftSection={<IconDeviceDesktop size={14} />} style={{ flexShrink: 0 }}>
                {station.name}
              </Badge>
            )}
            <Group gap={4} ml="md" wrap="nowrap">
              {can('test') && <NavButton to="/quality" icon={<IconClipboardCheck size={20} />} label={t('nav.quality')} />}
              {can('repair') && <NavButton to="/repair" icon={<IconTool size={20} />} label={t('nav.repair')} />}
              <NavButton to="/units" icon={<IconSearch size={20} />} label={t('nav.units')} />
              {(can('repair') || can('supervise')) && <NavButton to="/parts" icon={<IconBox size={20} />} label={t('nav.parts')} />}
              {can('supervise') && <NavButton to="/reports" icon={<IconFileAnalytics size={20} />} label={t('nav.reports')} />}
              {can('supervise') && <NavButton to="/line" icon={<IconChartBar size={20} />} label={t('nav.line')} />}
              {can('admin') && <NavButton to="/admin" icon={<IconSettings size={20} />} label={t('nav.admin')} />}
            </Group>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <LanguageSwitch />
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <UnstyledButton>
                  <Group gap={6} wrap="nowrap">
                    <IconUser size={20} />
                    <Text fw={600}>{user?.fullName}</Text>
                    <IconChevronDown size={16} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconUser size={16} />} onClick={() => navigate(`/people/${user?.id}`)}>
                  {t('nav.myActivity')}
                </Menu.Item>
                <Menu.Item leftSection={<IconLock size={16} />} onClick={() => setPinOpen(true)}>
                  {t('pin.title')}
                </Menu.Item>
                <Menu.Item leftSection={<IconHelp size={16} />} onClick={() => navigate('/help')}>
                  {t('nav.help')}
                </Menu.Item>
                {can('supervise') && (
                  <Menu.Item leftSection={<IconHistory size={16} />} onClick={() => navigate('/audit')}>
                    {t('nav.audit')}
                  </Menu.Item>
                )}
                {can('admin') && (
                  <Menu.Item leftSection={<IconDeviceDesktop size={16} />} onClick={() => navigate('/setup')}>
                    {t('nav.changeStation')}
                  </Menu.Item>
                )}
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={logout}>
                  {t('nav.logout')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        {weakPin && <WeakPinBanner onChange={() => setPinOpen(true)} />}
        {!connected && (
          <Alert color="red" variant="filled" icon={<IconWifiOff />} mb="md" title={t('connection.lostTitle')}>
            {t('connection.lostText')}
          </Alert>
        )}
        {children}
        <ChangePinModal opened={pinOpen} onClose={() => setPinOpen(false)} />
      </AppShell.Main>
    </AppShell>
  );
}
