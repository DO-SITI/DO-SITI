import { useEffect, useRef, useState } from 'react';
import type { MenuItem } from '../types';
import { getRemainingRestockMs } from '../utils/format';

/**
 * Provides a 1-second ticking clock whenever any menu is in the 5-minute restock cooldown,
 * and triggers `onRestockReady` once as soon as any menu's restock timestamp elapses.
 */
export function useRestockCountdown(
  menus: MenuItem[],
  onRestockReady: () => Promise<void> | void,
): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isSyncingRef = useRef(false);
  const lastFiredSignatureRef = useRef<string>('');

  const restockingMenus = menus.filter(
    (m) => m.stock === 0 && m.isAvailable && Boolean(m.restockAvailableAt),
  );

  useEffect(() => {
    if (restockingMenus.length === 0) {
      lastFiredSignatureRef.current = '';
      return;
    }

    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [restockingMenus.length]);

  useEffect(() => {
    if (restockingMenus.length === 0 || isSyncingRef.current) return;

    const expiredIds = restockingMenus
      .filter((m) => getRemainingRestockMs(m.restockAvailableAt, nowMs) === 0)
      .map((m) => m.id)
      .sort();

    if (expiredIds.length === 0) return;

    const signature = expiredIds.join(',');
    if (lastFiredSignatureRef.current === signature) return;

    lastFiredSignatureRef.current = signature;
    isSyncingRef.current = true;
    Promise.resolve(onRestockReady()).finally(() => {
      isSyncingRef.current = false;
    });
  }, [nowMs, restockingMenus, onRestockReady]);

  return nowMs;
}
