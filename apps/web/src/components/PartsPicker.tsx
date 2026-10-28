import { ActionIcon, Badge, Button, Group, NumberInput, Select, Stack, Text } from '@mantine/core';
import { tr } from '@gamut/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { isLowStock, useNames } from '../lib/catalog';

export type PartLine = { partId: string | null; quantity: number };

/** Spare parts from the catalog used in one repair. Stock goes down when the repair is saved. */
export function PartsPicker({ categoryId, componentId, value, onChange }: { categoryId: number; componentId: number | null; value: PartLine[]; onChange: (v: PartLine[]) => void }) {
  const { t } = useTranslation();
  const n = useNames();
  const parts = (n.catalog?.parts ?? []).filter((p) => p.active && (p.categoryId == null || p.categoryId === categoryId));
  // Parts for the chosen machine part come first.
  parts.sort((a, b) => Number(b.componentId === componentId) - Number(a.componentId === componentId) || a.partNumber.localeCompare(b.partNumber));
  const data = parts.map((p) => ({
    value: String(p.id),
    label: `${p.partNumber} — ${tr(p.name, n.lang)} (${t('parts.inStock', { count: p.stockQty })})`,
    disabled: p.stockQty <= 0,
  }));
  const set = (i: number, patch: Partial<PartLine>) => onChange(value.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">
        {t('parts.used')}
      </Text>
      {value.map((line, i) => {
        const part = parts.find((p) => String(p.id) === line.partId);
        return (
          <Group key={i} gap="xs" wrap="nowrap" align="flex-start">
            <Select style={{ flex: 1 }} searchable placeholder={t('parts.choose')} data={data} value={line.partId} onChange={(v) => set(i, { partId: v })} />
            <NumberInput w={90} min={1} max={part?.stockQty ?? 100} value={line.quantity} onChange={(v) => set(i, { quantity: Math.max(1, Number(v) || 1) })} />
            <ActionIcon size="lg" variant="subtle" color="red" mt={4} onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="remove">
              <IconTrash size={18} />
            </ActionIcon>
            {part && isLowStock(part) && (
              <Badge color="orange" mt={8}>
                {t('parts.low')}
              </Badge>
            )}
          </Group>
        );
      })}
      <Button variant="subtle" size="sm" leftSection={<IconPlus size={16} />} onClick={() => onChange([...value, { partId: null, quantity: 1 }])} style={{ alignSelf: 'flex-start' }}>
        {t('parts.addLine')}
      </Button>
    </Stack>
  );
}
