import { tr } from '@gamut/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { get } from './api';
import type { Catalog } from './types';

export function useCatalog() {
  return useQuery({ queryKey: ['catalog'], queryFn: () => get<Catalog>('/api/catalog'), staleTime: 60_000 });
}

/** Name helpers that follow the current language. */
export function useNames() {
  const { data: c } = useCatalog();
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const find = <T extends { id: number }>(list: T[] | undefined, id: number | null | undefined) =>
    id == null ? undefined : list?.find((x) => x.id === id);
  return {
    lang,
    catalog: c,
    model: (id: number | null | undefined) => {
      const m = find(c?.models, id);
      return m ? `${m.code} · ${m.name}` : '—';
    },
    modelCode: (id: number | null | undefined) => find(c?.models, id)?.code ?? '—',
    color: (id: number | null | undefined) => tr(find(c?.colors, id)?.name, lang) || '—',
    category: (id: number | null | undefined) => tr(find(c?.categories, id)?.name, lang) || '—',
    defect: (id: number | null | undefined) => {
      const d = find(c?.defectCodes, id);
      return d ? `${d.code} — ${tr(d.name, lang)}` : '—';
    },
    component: (id: number | null | undefined) => tr(find(c?.components, id)?.name, lang) || '—',
    action: (id: number | null | undefined) => tr(find(c?.actionTypes, id)?.name, lang) || '—',
    check: (id: number | null | undefined) => tr(find(c?.checklistItems, id)?.name, lang) || '—',
    user: (id: number | null | undefined) => find(c?.users, id)?.fullName ?? '—',
    station: (id: number | null | undefined) => find(c?.stations, id)?.name ?? '—',
  };
}
