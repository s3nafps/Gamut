import { ActionIcon, TextInput } from '@mantine/core';
import { IconBarcode, IconArrowRight } from '@tabler/icons-react';
import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = { onScan: (serial: string) => void; placeholder?: string; disabled?: boolean; size?: string };

/**
 * USB barcode scanners type the serial and press Enter, so a focused text box is enough.
 */
export const ScanInput = forwardRef<HTMLInputElement, Props>(function ScanInput({ onScan, placeholder, disabled, size = 'xl' }, ref) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onScan(v);
    setValue('');
  };
  return (
    <TextInput
      ref={ref}
      size={size}
      autoFocus
      disabled={disabled}
      value={value}
      onChange={(e) => setValue(e.currentTarget.value)}
      onKeyDown={(e) => e.key === 'Enter' && submit()}
      placeholder={placeholder ?? t('scan.placeholder')}
      leftSection={<IconBarcode size={28} />}
      rightSection={
        <ActionIcon size="xl" variant="filled" onClick={submit} aria-label={t('scan.go')}>
          <IconArrowRight className="flip-rtl" />
        </ActionIcon>
      }
      rightSectionWidth={56}
      styles={{ input: { fontFamily: 'monospace', letterSpacing: 1 } }}
      autoComplete="off"
      spellCheck={false}
    />
  );
});
