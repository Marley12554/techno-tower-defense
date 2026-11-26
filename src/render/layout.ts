/** Where the board sits on screen, in CSS pixels. The side panel is DOM; this leaves room for it. */
export interface Layout {
  w: number;
  h: number;
  dpr: number;
  /** Board origin and cell size. */
  ox: number;
  oy: number;
  cell: number;
  cols: number;
  rows: number;
  /** Width reserved on the right for the side panel (safe area included). */
  panel: number;
  safe: { t: number; r: number; b: number; l: number };
}

let probe: HTMLElement | null = null;

/** Reads env(safe-area-inset-*) through a hidden element. */
export function safeInsets(): Layout['safe'] {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;inset:0;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.append(probe);
  }
  const cs = getComputedStyle(probe);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}

/** Side panel width before the safe area. Matches the `min-height: 500px` breakpoint in styles.css. */
export function panelWidth(_w: number, h: number): number {
  return h < 500 ? 128 : 176;
}

export function computeLayout(cols: number, rows: number, dprCap = 2): Layout {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
  const safe = safeInsets();
  const panel = panelWidth(w, h) + safe.r;
  document.documentElement.style.setProperty('--pw', `${panel}px`);
  const pad = h < 500 ? 6 : 16;
  const ax = safe.l + pad, ay = safe.t + pad;
  const aw = w - panel - ax - pad, ah = h - ay - safe.b - pad;
  const cell = Math.max(8, Math.floor(Math.min(aw / cols, ah / rows)));
  const ox = Math.round(ax + (aw - cell * cols) / 2);
  const oy = Math.round(ay + (ah - cell * rows) / 2);
  return { w, h, dpr, ox, oy, cell, cols, rows, panel, safe };
}
