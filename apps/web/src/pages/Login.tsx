import { Button, Card, Center, Group, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconLogin } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { errorText } from '../lib/errors';
import { useSession } from '../lib/session';
import { getStation } from '../lib/station';

export function Login() {
  const { t } = useTranslation();
  const { login } = useSession();
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const station = getStation();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await login(employeeId.trim(), pin);
    } catch (e) {
      setError(errorText(e, t));
      setPin('');
      pinRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Center mih="100vh" p="md">
      <Card withBorder shadow="md" radius="lg" padding="xl" w={460} maw="100%">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Stack gap="lg">
            <Group justify="space-between">
              <Title order={2} c="blue">
                Gamut
              </Title>
              <LanguageSwitch persist={false} />
            </Group>
            {station && (
              <Text c="dimmed" size="lg">
                {station.name}
              </Text>
            )}
            <TextInput
              size="xl"
              label={t('login.employeeId')}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.currentTarget.value)}
              onKeyDown={(e) => {
                // Badge scanners send Enter after the ID: jump to the PIN.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  pinRef.current?.focus();
                }
              }}
              autoFocus
              autoComplete="off"
            />
            <PasswordInput
              ref={pinRef}
              size="xl"
              label={t('login.pin')}
              value={pin}
              onChange={(e) => setPin(e.currentTarget.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
            />
            {error && <Text c="red">{error}</Text>}
            <Button type="submit" size="xl" loading={busy} leftSection={<IconLogin />} disabled={!employeeId || pin.length < 4}>
              {t('login.submit')}
            </Button>
          </Stack>
        </form>
      </Card>
    </Center>
  );
}
