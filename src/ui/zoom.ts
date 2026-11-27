/**
 * iOS Safari ignores `user-scalable=no`, so a double-tap can still zoom the page,
 * and because the game blocks pinch gestures the player can't zoom back out.
 * Block the zoom gestures, and if a zoom slips through anyway, snap it back.
 */
export function guardZoom(): void {
  const stop = (e: Event) => e.preventDefault();
  // Safari's pinch events (iOS and macOS trackpads).
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, stop, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
  // A second tap within 350 ms is what iOS reads as double-tap-to-zoom. Cancelling its
  // touchend only drops the synthetic click; the game itself runs on pointer events.
  // Buttons are skipped: they already opt out of double-tap zoom with touch-action.
  let last = 0;
  document.addEventListener('touchend', (e) => {
    const now = performance.now();
    const t = e.target as Element | null;
    if (now - last < 350 && !t?.closest?.('button, input, select, textarea, a')) e.preventDefault();
    last = now;
  }, { passive: false });
  // Ctrl/Cmd + wheel is the desktop trackpad pinch.
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

  const vv = window.visualViewport;
  if (!vv) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name=viewport]');
  vv.addEventListener('resize', () => {
    if (vv.scale <= 1.01 || !meta) return;
    // Rewriting the viewport tag makes iOS re-apply initial-scale=1.
    const base = meta.content;
    meta.content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    setTimeout(() => { meta.content = base; }, 300);
  });
}
