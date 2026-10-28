import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/600.css';
import '@fontsource/noto-sans/800.css';
import '@fontsource/noto-sans-arabic/400.css';
import '@fontsource/noto-sans-arabic/600.css';
import '@fontsource/noto-sans-arabic/800.css';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './styles.css';

import { isRtl } from '@gamut/core';
import { DirectionProvider, MantineProvider, useDirection } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import i18n, { applyDocumentLanguage } from './i18n';
import { SessionProvider } from './lib/session';
import { theme } from './theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/** Keeps the page direction (Arabic = right-to-left) in sync with the language. */
function DirectionSync() {
  const { i18n: inst } = useTranslation();
  const { setDirection } = useDirection();
  useEffect(() => {
    const apply = (lang: string) => {
      applyDocumentLanguage(lang);
      setDirection(isRtl(lang) ? 'rtl' : 'ltr');
    };
    apply(inst.language);
    inst.on('languageChanged', apply);
    return () => inst.off('languageChanged', apply);
  }, [inst, setDirection]);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <DirectionProvider initialDirection={isRtl(i18n.language) ? 'rtl' : 'ltr'}>
    <MantineProvider theme={theme}>
      <DirectionSync />
      <Notifications position="bottom-right" limit={3} />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SessionProvider>
            <App />
          </SessionProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  </DirectionProvider>,
);
