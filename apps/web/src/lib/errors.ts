import { notifications } from '@mantine/notifications';
import type { TFunction } from 'i18next';
import { ApiError } from './api';

export function errorText(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`;
    const text = t(key, { ...(err.details ?? {}) });
    return text === key ? t('errors.server_error') : text;
  }
  return t('errors.server_error');
}

export function notifyError(err: unknown, t: TFunction) {
  notifications.show({ color: 'red', title: t('common.error'), message: errorText(err, t), autoClose: 6000 });
}

export function notifyOk(message: string) {
  notifications.show({ color: 'green', message, autoClose: 2500 });
}
