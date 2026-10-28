export type Station = { id: number; name: string; type: 'quality' | 'repair' | 'display'; language: string };

const KEY = 'gamut.station';

export function getStation(): Station | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Station) : null;
  } catch {
    return null;
  }
}

export function setStation(st: Station | null) {
  try {
    if (st) localStorage.setItem(KEY, JSON.stringify(st));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: station must be picked again next time */
  }
}
