import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/**
 * Listens to the server's live channel. Whenever anything changes on any PC,
 * all screens refetch their data. Also reports whether the server is reachable.
 */
export function useLive() {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    let es: EventSource | null = null;
    let downTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const open = () => {
      es = new EventSource('/api/live');
      es.onopen = () => {
        if (downTimer) clearTimeout(downTimer);
        downTimer = null;
        setConnected(true);
        qc.invalidateQueries();
      };
      es.addEventListener('changed', () => qc.invalidateQueries());
      es.onerror = () => {
        // Brief blips are normal; only show the banner after 4 s.
        if (!downTimer) downTimer = setTimeout(() => !closed && setConnected(false), 4000);
      };
    };
    open();
    return () => {
      closed = true;
      if (downTimer) clearTimeout(downTimer);
      es?.close();
    };
  }, [qc]);

  return connected;
}
