import { Card, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { UnitStatusBadge } from '../../components/StatusBadge';
import { get } from '../../lib/api';
import { useNames } from '../../lib/catalog';
import { fmtDateTime } from '../../lib/format';
import type { Unit } from '../../lib/types';

export function UnitsPage() {
  const { t } = useTranslation();
  const n = useNames();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debounced] = useDebouncedValue(q, 250);
  const { data = [] } = useQuery({ queryKey: ['units', debounced], queryFn: () => get<Unit[]>(`/api/units?q=${encodeURIComponent(debounced)}`) });

  return (
    <Stack gap="md">
      <Title order={2}>{t('units.title')}</Title>
      <TextInput
        size="xl"
        autoFocus
        leftSection={<IconSearch />}
        placeholder={t('units.search')}
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && data.length === 1) navigate(`/units/${encodeURIComponent(data[0].serial)}`);
        }}
        styles={{ input: { fontFamily: 'monospace' } }}
      />
      <Card withBorder padding={0}>
        <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('fields.serial')}</Table.Th>
              <Table.Th>{t('fields.model')}</Table.Th>
              <Table.Th>{t('fields.color')}</Table.Th>
              <Table.Th>{t('fields.status')}</Table.Th>
              <Table.Th>{t('units.firstScan')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((u) => (
              <Table.Tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/units/${encodeURIComponent(u.serial)}`)}>
                <Table.Td ff="monospace" fw={700}>
                  {u.serial}
                </Table.Td>
                <Table.Td>{n.model(u.modelId)}</Table.Td>
                <Table.Td>{n.color(u.colorId)}</Table.Td>
                <Table.Td>
                  <UnitStatusBadge status={u.status} size="md" />
                </Table.Td>
                <Table.Td c="dimmed">{fmtDateTime(u.createdAt, n.lang)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {data.length === 0 && (
          <Text c="dimmed" p="md">
            {t('common.nothing')}
          </Text>
        )}
      </Card>
    </Stack>
  );
}
