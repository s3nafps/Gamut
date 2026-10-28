import { can, type Permission } from '@gamut/core';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { get, getToken, post, setToken, setUnauthorizedHandler } from './api';
import type { User } from './types';

type SessionCtx = {
  user: User | null;
  /** Signed in with a guessable PIN (e.g. 1234): ask to change it. */
  weakPin: boolean;
  clearWeakPin: () => void;
  ready: boolean;
  login: (employeeId: string, pin: string) => Promise<User>;
  logout: () => void;
  can: (p: Permission) => boolean;
};

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [weakPin, setWeakPin] = useState(() => sessionStorage.getItem('gamut.weakPin') === '1');
  const clearWeakPin = useCallback(() => {
    sessionStorage.removeItem('gamut.weakPin');
    setWeakPin(false);
  }, []);
  const qc = useQueryClient();
  const { i18n } = useTranslation();

  const logout = useCallback(() => {
    if (getToken()) post('/api/logout').catch(() => undefined);
    setToken(null);
    setUser(null);
    sessionStorage.removeItem('gamut.weakPin');
    setWeakPin(false);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
      qc.clear();
    });
    if (!getToken()) return setReady(true);
    get<User>('/api/me')
      .then((u) => {
        setUser(u);
        i18n.changeLanguage(u.language);
      })
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, [qc, i18n]);

  const login = useCallback(
    async (employeeId: string, pin: string) => {
      const res = await post<{ token: string; user: User; weakPin: boolean }>('/api/login', { employeeId, pin });
      setToken(res.token);
      setUser(res.user);
      if (res.weakPin) sessionStorage.setItem('gamut.weakPin', '1');
      setWeakPin(res.weakPin);
      i18n.changeLanguage(res.user.language);
      return res.user;
    },
    [i18n],
  );

  const value = useMemo<SessionCtx>(
    () => ({ user, ready, weakPin, clearWeakPin, login, logout, can: (p) => !!user && can(user.roles, p) }),
    [user, ready, weakPin, clearWeakPin, login, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('SessionProvider missing');
  return v;
}

/** Signs the user out after a period without mouse / keyboard / scanner activity. */
export function useIdleLock(minutes: number | undefined) {
  const { user, logout } = useSession();
  const last = useRef(Date.now());
  useEffect(() => {
    if (!user || !minutes) return;
    const bump = () => (last.current = Date.now());
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'wheel'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - last.current > minutes * 60_000) logout();
    }, 15_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(timer);
    };
  }, [user, minutes, logout]);
}
