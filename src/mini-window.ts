import { t, getLanguage } from './i18n';
import { useCallback, useEffect, useRef, useState } from 'react';

type MiniTarget = { container: HTMLElement; window: Window; floating: boolean };
type PictureInPicture = { requestWindow(options: { width: number; height: number }): Promise<Window> };

/** This window renders the existing meeting state; it never owns audio or another connection. */
export function useMiniWindow() {
  const [target, setTarget] = useState<MiniTarget | null>(null);
  const [error, setError] = useState('');
  const current = useRef<MiniTarget | null>(null);
  const opening = useRef(false);
  const close = useCallback(() => { current.current?.window.close(); current.current = null; setTarget(null); }, []);
  useEffect(() => {
    const cleanup = () => current.current?.window.close();
    window.addEventListener('pagehide', cleanup);
    return () => { window.removeEventListener('pagehide', cleanup); cleanup(); };
  }, []);
  const open = async (ordinary = false) => {
    if (current.current && !current.current.window.closed) { current.current.window.focus(); return; }
    if (opening.current) return;
    opening.current = true; setError('');
    try {
      const pip = (window as Window & { documentPictureInPicture?: PictureInPicture }).documentPictureInPicture;
      const floating = !ordinary && !!pip;
      const mini = floating ? await pip!.requestWindow({ width: 420, height: 560 }) : window.open('', '_blank', 'popup,width=420,height=560');
      if (!mini) throw new Error(t("Разрешите всплывающие окна для Суфлёра и повторите запуск мини-режима."));
      mini.document.title = t("Суфлёр · мини-режим");
      const base = mini.document.createElement('base'); base.href = window.location.href; mini.document.head.append(base);
      for (const source of document.querySelectorAll('link[rel="stylesheet"], style')) {
        const copy = source.cloneNode(true) as HTMLElement;
        if (copy instanceof HTMLLinkElement) copy.href = (source as HTMLLinkElement).href;
        mini.document.head.append(copy);
      }
      mini.document.documentElement.lang = getLanguage(); mini.document.body.className = 'mini-window';
      const container = mini.document.createElement('div'); mini.document.body.append(container);
      const next = { container, window: mini, floating }; current.current = next;
      mini.addEventListener('pagehide', () => { if (current.current === next) { current.current = null; setTarget(null); } }, { once: true });
      setTarget(next);
    } catch (e) {
      setError(e instanceof Error && e.message === t('Разрешите всплывающие окна для Суфлёра и повторите запуск мини-режима.') ? e.message : t("Браузер не открыл окно поверх приложений. Попробуйте обычное окно или откройте Суфлёр в Chrome."));
    } finally { opening.current = false; }
  };
  return { target, open, close, error };
}
