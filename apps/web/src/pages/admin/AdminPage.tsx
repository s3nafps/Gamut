import {
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  PasswordInput,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { ROLES, tr } from '@gamut/core';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post, put } from '../../lib/api';
import { useNames } from '../../lib/catalog';
import { notifyError, notifyOk } from '../../lib/errors';

type FieldType = 'text' | 'code' | 'localized' | 'number' | 'category' | 'kind' | 'stationType' | 'language' | 'roles' | 'boolean' | 'pin' | 'pattern';
type Field = { key: string; type: FieldType; label: string; required?: boolean };
type EntityDef = { name: string; label: string; fields: Field[]; columns: Array<(row: any) => React.ReactNode>; headers: string[]; help?: string };

function useEntityDefs(): EntityDef[] {
  const { t } = useTranslation();
  const n = useNames();
  const L = (v: any) => tr(v, n.lang);
  const active: Field = { key: 'active', type: 'boolean', label: t('fields.active') };
  const cat: Field = { key: 'categoryId', type: 'category', label: t('fields.category'), required: true };
  const activeCol = (r: any) => (r.active ? <Badge color="green">{t('common.yes')}</Badge> : <Badge color="gray">{t('common.no')}</Badge>);
  return [
    {
      name: 'models',
      label: t('admin.models'),
      help: t('admin.modelsHelp'),
      fields: [cat, { key: 'code', type: 'code', label: t('fields.serialCode'), required: true }, { key: 'name', type: 'text', label: t('fields.name'), required: true }, { key: 'brand', type: 'text', label: t('fields.brand') }, active],
      headers: [t('fields.serialCode'), t('fields.name'), t('fields.brand'), t('fields.category'), t('fields.active')],
      columns: [(r) => <Code>{r.code}</Code>, (r) => r.name, (r) => r.brand, (r) => n.category(r.categoryId), activeCol],
    },
    {
      name: 'colors',
      label: t('admin.colors'),
      help: t('admin.colorsHelp'),
      fields: [{ key: 'code', type: 'code', label: t('fields.serialCode'), required: true }, { key: 'name', type: 'localized', label: t('fields.name'), required: true }, active],
      headers: [t('fields.serialCode'), t('fields.name'), t('fields.active')],
      columns: [(r) => <Code>{r.code}</Code>, (r) => L(r.name), activeCol],
    },
    {
      name: 'serialRules',
      label: t('admin.serialRules'),
      help: t('admin.serialRulesHelp'),
      fields: [
        cat,
        { key: 'label', type: 'text', label: t('fields.label'), required: true },
        { key: 'pattern', type: 'pattern', label: t('fields.pattern'), required: true },
        { key: 'example', type: 'text', label: t('fields.example') },
        { key: 'priority', type: 'number', label: t('fields.priority') },
        active,
      ],
      headers: [t('fields.label'), t('fields.pattern'), t('fields.example'), t('fields.active')],
      columns: [(r) => r.label, (r) => <Code>{r.pattern}</Code>, (r) => <Code>{r.example}</Code>, activeCol],
    },
    {
      name: 'defectCodes',
      label: t('admin.defectCodes'),
      fields: [cat, { key: 'code', type: 'code', label: t('fields.code'), required: true }, { key: 'name', type: 'localized', label: t('fields.name'), required: true }, active],
      headers: [t('fields.code'), t('fields.name'), t('fields.category'), t('fields.active')],
      columns: [(r) => <Code>{r.code}</Code>, (r) => L(r.name), (r) => n.category(r.categoryId), activeCol],
    },
    {
      name: 'checklistItems',
      label: t('admin.checklist'),
      fields: [
        cat,
        { key: 'name', type: 'localized', label: t('fields.name'), required: true },
        { key: 'kind', type: 'kind', label: t('fields.kind') },
        { key: 'min', type: 'number', label: t('fields.min') },
        { key: 'max', type: 'number', label: t('fields.max') },
        { key: 'unit', type: 'text', label: t('fields.unit') },
        { key: 'sort', type: 'number', label: t('fields.sort') },
        active,
      ],
      headers: [t('fields.sort'), t('fields.name'), t('fields.kind'), t('fields.limits'), t('fields.category'), t('fields.active')],
      columns: [
        (r) => r.sort,
        (r) => L(r.name),
        (r) => t(`admin.kind.${r.kind}`),
        (r) => (r.kind === 'measure' ? `${r.min ?? ''} – ${r.max ?? ''} ${r.unit}` : ''),
        (r) => n.category(r.categoryId),
        activeCol,
      ],
    },
    {
      name: 'components',
      label: t('admin.components'),
      fields: [cat, { key: 'name', type: 'localized', label: t('fields.name'), required: true }, active],
      headers: [t('fields.name'), t('fields.category'), t('fields.active')],
      columns: [(r) => L(r.name), (r) => n.category(r.categoryId), activeCol],
    },
    {
      name: 'actionTypes',
      label: t('admin.actionTypes'),
      fields: [{ key: 'name', type: 'localized', label: t('fields.name'), required: true }, active],
      headers: [t('fields.name'), t('fields.active')],
      columns: [(r) => L(r.name), activeCol],
    },
    {
      name: 'categories',
      label: t('admin.categories'),
      help: t('admin.categoriesHelp'),
      fields: [{ key: 'code', type: 'code', label: t('fields.code'), required: true }, { key: 'name', type: 'localized', label: t('fields.name'), required: true }, active],
      headers: [t('fields.code'), t('fields.name'), t('fields.active')],
      columns: [(r) => <Code>{r.code}</Code>, (r) => L(r.name), activeCol],
    },
    {
      name: 'users',
      label: t('admin.users'),
      fields: [
        { key: 'employeeId', type: 'text', label: t('login.employeeId'), required: true },
        { key: 'fullName', type: 'text', label: t('fields.fullName'), required: true },
        { key: 'roles', type: 'roles', label: t('fields.roles'), required: true },
        { key: 'language', type: 'language', label: t('fields.language') },
        { key: 'pin', type: 'pin', label: t('login.pin') },
        active,
      ],
      headers: [t('login.employeeId'), t('fields.fullName'), t('fields.roles'), t('fields.language'), t('fields.active')],
      columns: [(r) => <Code>{r.employeeId}</Code>, (r) => r.fullName, (r) => r.roles.map((x: string) => t(`roles.${x}`)).join(', '), (r) => r.language.toUpperCase(), activeCol],
    },
    {
      name: 'stations',
      label: t('admin.stations'),
      fields: [
        { key: 'name', type: 'text', label: t('fields.name'), required: true },
        { key: 'type', type: 'stationType', label: t('fields.type'), required: true },
        { key: 'language', type: 'language', label: t('fields.language') },
        active,
      ],
      headers: [t('fields.name'), t('fields.type'), t('fields.language'), t('fields.active')],
      columns: [(r) => r.name, (r) => t(`setup.type.${r.type}`), (r) => r.language.toUpperCase(), activeCol],
    },
  ];
}

function emptyValues(def: EntityDef) {
  const v: Record<string, any> = {};
  for (const f of def.fields) {
    if (f.type === 'localized') v[f.key] = { en: '', fr: '', ar: '' };
    else if (f.type === 'boolean') v[f.key] = true;
    else if (f.type === 'roles') v[f.key] = [];
    else if (f.type === 'number') v[f.key] = null;
    else if (f.type === 'kind') v[f.key] = 'ok';
    else if (f.type === 'language') v[f.key] = 'fr';
    else if (f.type === 'category') v[f.key] = null;
    else v[f.key] = '';
  }
  return v;
}

function PatternTester({ pattern }: { pattern: string }) {
  const { t } = useTranslation();
  const [serial, setSerial] = useState('');
  const [res, setRes] = useState<any>(null);
  useEffect(() => {
    if (!pattern || !serial) return setRes(null);
    const timer = setTimeout(() => post('/api/admin/serial-test', { pattern, serial }).then(setRes).catch(() => setRes(null)), 300);
    return () => clearTimeout(timer);
  }, [pattern, serial]);
  return (
    <Card withBorder padding="sm" bg="gray.0">
      <TextInput label={t('admin.trySerial')} value={serial} onChange={(e) => setSerial(e.currentTarget.value)} styles={{ input: { fontFamily: 'monospace' } }} />
      {res?.error && (
        <Text c="red" size="sm" mt="xs">
          {t(`errors.${res.error}`)}
        </Text>
      )}
      {res && !res.error && !res.decoded && (
        <Text c="orange" size="sm" mt="xs">
          {t('admin.noMatch')}
        </Text>
      )}
      {res?.decoded && (
        <Text size="sm" mt="xs">
          {t('fields.model')}: <Code>{res.decoded.modelCode ?? '—'}</Code> · {t('fields.color')}: <Code>{res.decoded.colorCode ?? '—'}</Code> ·{' '}
          {t('units.production')}: <Code>{res.decoded.productionYear ? `${res.decoded.productionMonth ?? '?'}/${res.decoded.productionYear}` : '—'}</Code>
        </Text>
      )}
      <Text size="xs" c="dimmed" mt="xs">
        {t('admin.patternHelp')}
      </Text>
    </Card>
  );
}

function EntityForm({ def, initial, onClose }: { def: EntityDef; initial: any | null; onClose: () => void }) {
  const { t } = useTranslation();
  const n = useNames();
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, any>>(() => (initial ? { ...emptyValues(def), ...initial, pin: '' } : emptyValues(def)));
  const set = (k: string, v: any) => setValues((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, any> = {};
      for (const f of def.fields) {
        if (f.type === 'pin' && !values.pin) continue;
        body[f.key] = values[f.key];
        if (f.type === 'number' && (values[f.key] === '' || values[f.key] === undefined)) body[f.key] = null;
        if (f.type === 'number' && ['priority', 'sort'].includes(f.key) && body[f.key] === null) body[f.key] = 0;
      }
      return initial ? put(`/api/admin/${def.name}/${initial.id}`, body) : post(`/api/admin/${def.name}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries();
      notifyOk(t('repair.saved'));
      onClose();
    },
    onError: (e) => notifyError(e, t),
  });

  return (
    <Stack>
      {def.fields.map((f) => {
        switch (f.type) {
          case 'localized':
            return (
              <Card key={f.key} withBorder padding="sm">
                <Text fw={600} size="sm" mb={4}>
                  {f.label}
                </Text>
                <SimpleGrid cols={3}>
                  <TextInput label="Français" value={values[f.key].fr ?? ''} onChange={(e) => set(f.key, { ...values[f.key], fr: e.currentTarget.value })} />
                  <TextInput label="العربية" dir="rtl" value={values[f.key].ar ?? ''} onChange={(e) => set(f.key, { ...values[f.key], ar: e.currentTarget.value })} />
                  <TextInput label="English *" value={values[f.key].en ?? ''} onChange={(e) => set(f.key, { ...values[f.key], en: e.currentTarget.value })} />
                </SimpleGrid>
              </Card>
            );
          case 'boolean':
            return <Switch key={f.key} size="md" label={f.label} checked={!!values[f.key]} onChange={(e) => set(f.key, e.currentTarget.checked)} />;
          case 'number':
            return <NumberInput key={f.key} label={f.label} value={values[f.key] ?? ''} onChange={(v) => set(f.key, typeof v === 'number' ? v : null)} decimalScale={3} />;
          case 'category':
            return (
              <Select
                key={f.key}
                label={f.label}
                required={f.required}
                value={values[f.key] ? String(values[f.key]) : null}
                onChange={(v) => set(f.key, v ? Number(v) : null)}
                data={(n.catalog?.categories ?? []).map((c) => ({ value: String(c.id), label: tr(c.name, n.lang) }))}
              />
            );
          case 'kind':
            return (
              <Select
                key={f.key}
                label={f.label}
                value={values[f.key]}
                onChange={(v) => set(f.key, v)}
                data={[
                  { value: 'ok', label: t('admin.kind.ok') },
                  { value: 'measure', label: t('admin.kind.measure') },
                ]}
              />
            );
          case 'stationType':
            return (
              <Select
                key={f.key}
                label={f.label}
                required
                value={values[f.key] || null}
                onChange={(v) => set(f.key, v)}
                data={(['quality', 'repair', 'display'] as const).map((x) => ({ value: x, label: t(`setup.type.${x}`) }))}
              />
            );
          case 'language':
            return (
              <Select
                key={f.key}
                label={f.label}
                value={values[f.key]}
                onChange={(v) => set(f.key, v)}
                data={[
                  { value: 'fr', label: 'Français' },
                  { value: 'ar', label: 'العربية' },
                  { value: 'en', label: 'English' },
                ]}
              />
            );
          case 'roles':
            return (
              <MultiSelect key={f.key} label={f.label} required value={values[f.key]} onChange={(v) => set(f.key, v)} data={ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }))} />
            );
          case 'pin':
            return (
              <PasswordInput
                key={f.key}
                label={f.label}
                description={initial ? t('admin.pinKeep') : t('admin.pinNew')}
                required={!initial}
                value={values.pin}
                onChange={(e) => set('pin', e.currentTarget.value.replace(/\D/g, '').slice(0, 8))}
              />
            );
          case 'pattern':
            return (
              <Stack key={f.key} gap="xs">
                <TextInput label={f.label} required value={values[f.key]} onChange={(e) => set(f.key, e.currentTarget.value)} styles={{ input: { fontFamily: 'monospace' } }} />
                <PatternTester pattern={values[f.key]} />
              </Stack>
            );
          default:
            return (
              <TextInput
                key={f.key}
                label={f.label}
                required={f.required}
                value={values[f.key] ?? ''}
                onChange={(e) => set(f.key, f.type === 'code' ? e.currentTarget.value.toUpperCase() : e.currentTarget.value)}
                styles={f.type === 'code' ? { input: { fontFamily: 'monospace' } } : undefined}
              />
            );
        }
      })}
      <Button size="lg" loading={save.isPending} onClick={() => save.mutate()}>
        {t('common.save')}
      </Button>
    </Stack>
  );
}

function EntityTab({ def }: { def: EntityDef }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<any | null | undefined>(undefined);
  const { data = [] } = useQuery({ queryKey: ['admin', def.name], queryFn: () => get<any[]>(`/api/admin/${def.name}`) });
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text c="dimmed" maw={800}>
          {def.help}
        </Text>
        <Button leftSection={<IconPlus />} onClick={() => setEditing(null)}>
          {t('common.add')}
        </Button>
      </Group>
      <Card withBorder padding={0}>
        <ScrollArea>
          <Table highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                {def.headers.map((h) => (
                  <Table.Th key={h}>{h}</Table.Th>
                ))}
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map((row) => (
                <Table.Tr key={row.id} style={{ opacity: row.active ? 1 : 0.5 }}>
                  {def.columns.map((col, i) => (
                    <Table.Td key={i}>{col(row)}</Table.Td>
                  ))}
                  <Table.Td>
                    <Button size="xs" variant="subtle" leftSection={<IconPencil size={14} />} onClick={() => setEditing(row)}>
                      {t('common.edit')}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Card>
      <Modal opened={editing !== undefined} onClose={() => setEditing(undefined)} title={<Text fw={700}>{def.label}</Text>} size="lg" centered>
        {editing !== undefined && <EntityForm def={def} initial={editing} onClose={() => setEditing(undefined)} />}
      </Modal>
    </Stack>
  );
}

function SettingsTab() {
  const { t } = useTranslation();
  const n = useNames();
  const qc = useQueryClient();
  const [v, setV] = useState(n.catalog?.settings);
  useEffect(() => setV(n.catalog?.settings), [n.catalog?.settings]);
  const save = useMutation({
    mutationFn: () => put('/api/admin/settings', v),
    onSuccess: () => {
      qc.invalidateQueries();
      notifyOk(t('repair.saved'));
    },
    onError: (e) => notifyError(e, t),
  });
  if (!v) return null;
  return (
    <Card withBorder padding="lg" maw={520}>
      <Stack>
        <NumberInput label={t('admin.fpyTarget')} suffix=" %" min={0} max={100} value={v.fpyTarget} onChange={(x) => setV({ ...v, fpyTarget: Number(x) || 0 })} />
        <NumberInput label={t('admin.maxRetestFails')} min={1} max={20} value={v.maxRetestFails} onChange={(x) => setV({ ...v, maxRetestFails: Number(x) || 1 })} />
        <NumberInput label={t('admin.idleLock')} min={1} max={240} value={v.idleLockMinutes} onChange={(x) => setV({ ...v, idleLockMinutes: Number(x) || 1 })} />
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      </Stack>
    </Card>
  );
}

export function AdminPage() {
  const { t } = useTranslation();
  const defs = useEntityDefs();
  return (
    <Stack gap="md">
      <Title order={2}>{t('admin.title')}</Title>
      <Alert color="blue" variant="light">
        {t('admin.noDelete')}
      </Alert>
      <Tabs defaultValue="models" keepMounted={false}>
        <Tabs.List>
          {defs.map((d) => (
            <Tabs.Tab key={d.name} value={d.name}>
              {d.label}
            </Tabs.Tab>
          ))}
          <Tabs.Tab value="settings">{t('admin.settings')}</Tabs.Tab>
        </Tabs.List>
        {defs.map((d) => (
          <Tabs.Panel key={d.name} value={d.name} pt="md">
            <EntityTab def={d} />
          </Tabs.Panel>
        ))}
        <Tabs.Panel value="settings" pt="md">
          <SettingsTab />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
