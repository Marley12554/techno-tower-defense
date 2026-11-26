type Child = Node | string | number | null | false | undefined;

/** Tiny hyperscript helper: h('div', { class: 'x', onclick: fn }, ...children). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false || v === null) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== false && c !== undefined) el.append(typeof c === 'number' ? String(c) : c);
  return el;
}

export const isTouch = () => matchMedia('(pointer: coarse)').matches;
