import { Alert, Button, Modal, PasswordInput, Stack, Text } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { put } from '../lib/api';
import { errorText, notifyOk } from '../lib/errors';
import { useSession } from '../lib/session';

export function ChangePinModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { clearWeakPin } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8);

  const save = async () => {
    setError(null);
    if (next !== again) return setError(t('pin.mismatch'));
    setBusy(true);
    try {
      await put('/api/me/pin', { currentPin: current, newPin: next });
      clearWeakPin();
      notifyOk(t('pin.changed'));
      setCurrent('');
      setNext('');
      setAgain('');
      onClose();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700}>{t('pin.title')}</Text>} centered>
      <Stack>
        <PasswordInput label={t('pin.current')} value={current} onChange={(e) => setCurrent(digits(e.currentTarget.value))} inputMode="numeric" data-autofocus />
        <PasswordInput label={t('pin.new')} description={t('pin.rules')} value={next} onChange={(e) => setNext(digits(e.currentTarget.value))} inputMode="numeric" />
        <PasswordInput label={t('pin.again')} value={again} onChange={(e) => setAgain(digits(e.currentTarget.value))} inputMode="numeric" />
        {error && <Text c="red">{error}</Text>}
        <Button size="lg" loading={busy} disabled={current.length < 4 || next.length < 4} onClick={save}>
          {t('common.save')}
        </Button>
      </Stack>
    </Modal>
  );
}

export function WeakPinBanner({ onChange }: { onChange: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert color="orange" variant="filled" icon={<IconLock />} mb="md" title={t('pin.weakTitle')}>
      {t('pin.weakText')}{' '}
      <Button size="xs" variant="white" color="orange" ml="sm" onClick={onChange}>
        {t('pin.title')}
      </Button>
    </Alert>
  );
}
