import { SegmentedControl } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { put } from '../lib/api';
import { useSession } from '../lib/session';

export function LanguageSwitch({ size = 'sm', persist = true }: { size?: string; persist?: boolean }) {
  const { i18n } = useTranslation();
  const { user } = useSession();
  return (
    <SegmentedControl
      size={size}
      value={i18n.language}
      onChange={(lang) => {
        i18n.changeLanguage(lang);
        if (persist && user) put('/api/me/language', { language: lang }).catch(() => undefined);
      }}
      data={[
        { value: 'fr', label: 'FR' },
        { value: 'ar', label: 'ع' },
        { value: 'en', label: 'EN' },
      ]}
    />
  );
}
