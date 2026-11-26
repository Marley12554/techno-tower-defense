/** Selected-tower panel: stats, targeting, upgrade branches with previews, sell. */
import type { Sim, Tower } from '../game/sim';
import { statsFor } from '../game/data';
import type { Targeting, TowerStats, UpgradeDef } from '../game/types';
import { iconCanvas } from '../render/sprites';
import { h, isTouch } from './dom';

export interface InspectorHooks {
  upgrade(t: Tower, id: string): void;
  sell(t: Tower): void;
  target(t: Tower, mode: Targeting): void;
  close(): void;
  preview(stats: TowerStats | null): void;
  sound(name: string): void;
}

const TARGETS: [Targeting, string][] = [['first', 'First'], ['last', 'Last'], ['strong', 'Strong'], ['close', 'Close']];
const TIER = ['Mk I', 'Mk II', 'Mk III', 'Mk IV'];

type Row = [label: string, value: (s: TowerStats) => number, fmt: (v: number) => string];

const fmt1 = (v: number) => (Math.round(v * 10) / 10).toString();
const ROWS: Record<string, Row[]> = {
  filter: [
    ['Damage', (s) => s.damage, fmt1],
    ['Rate', (s) => s.rate, (v) => `${fmt1(v)}/s`],
    ['Range', (s) => s.range, fmt1],
    ['DPS', (s) => s.damage * s.rate, fmt1],
  ],
  throttle: [
    ['Slow', (s) => s.slow, (v) => `${Math.round(v * 100)}%`],
    ['Range', (s) => s.range, fmt1],
    ['Exposed', (s) => s.amp, (v) => (v > 1 ? `+${Math.round((v - 1) * 100)}% dmg` : 'none')],
  ],
  mortar: [
    ['Damage', (s) => s.damage, fmt1],
    ['Splash', (s) => s.splash, fmt1],
    ['Range', (s) => s.range, fmt1],
    ['Reload', (s) => 1 / s.rate, (v) => `${fmt1(v)}s`],
    ['Bomblets', (s) => s.bomblets, (v) => (v ? String(v) : 'none')],
  ],
};

export class Inspector {
  readonly el: HTMLElement;
  tower: Tower | null = null;
  private previewId: string | null = null;
  private sellArmed = 0;
  private key = '';
  private affordEls: { el: HTMLElement; cost: number }[] = [];
  private recordEl: HTMLElement | null = null;
  private sellBtn: HTMLButtonElement | null = null;
  private statsEl: HTMLElement | null = null;
  private upCards = new Map<string, HTMLElement>();

  constructor(root: HTMLElement, private hooks: InspectorHooks) {
    this.el = h('div', { class: 'inspector hidden' });
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    root.append(this.el);
  }

  open(t: Tower, sim: Sim, side: 'left' | 'right', top: number, maxH: number, x: number): void {
    const wasOpen = this.tower !== null;
    this.tower = t;
    this.previewId = null;
    this.sellArmed = 0;
    this.key = '';
    this.el.classList.remove('hidden', 'left', 'right', 'in');
    this.el.classList.add(side);
    this.el.style.top = `${top}px`;
    this.el.style.maxHeight = `${maxH}px`;
    if (side === 'left') { this.el.style.left = `${x}px`; this.el.style.right = ''; }
    else { this.el.style.right = `${x}px`; this.el.style.left = ''; }
    if (!wasOpen) { void this.el.offsetWidth; }
    this.el.classList.add('in');
    this.render(sim);
  }

  close(): void {
    if (!this.tower) return;
    this.tower = null;
    this.previewId = null;
    this.hooks.preview(null);
    this.el.classList.add('hidden');
  }

  /** Call every frame: re-renders only when something structural changed. */
  update(sim: Sim, now: number): void {
    const t = this.tower;
    if (!t) return;
    if (!sim.towers.includes(t)) { this.hooks.close(); return; }
    if (this.sellArmed && now > this.sellArmed) { this.sellArmed = 0; this.key = ''; }
    const key = `${t.id}|${t.path.join(',')}|${t.targeting}|${this.sellArmed > 0}|${t.fresh}`;
    if (key !== this.key) this.render(sim);
    for (const a of this.affordEls) a.el.classList.toggle('poor', a.cost > sim.bits);
    if (this.recordEl) this.recordEl.textContent = `${t.kills} kills · ${Math.round(t.dealt)} dmg`;
    this.nowCache = now;
  }
  private nowCache = 0;

  private render(sim: Sim): void {
    const t = this.tower!;
    this.key = `${t.id}|${t.path.join(',')}|${t.targeting}|${this.sellArmed > 0}|${t.fresh}`;
    this.affordEls = [];
    const ups = sim.nextUpgrades(t);
    if (this.previewId && !ups.some((u) => u.id === this.previewId)) this.previewId = null;
    this.statsEl = h('div', { class: 'i-stats' });
    this.upCards.clear();
    this.renderStats();

    const head = h('div', { class: 'i-head' },
      iconCanvas(t.kind, 34),
      h('div', { class: 'i-title' }, h('div', { class: 'i-name' }, t.def.name), h('div', { class: 'i-tier' }, TIER[t.path.length] ?? `Mk ${t.path.length + 1}`)),
      h('button', { class: 'i-x', 'aria-label': 'Close', onclick: () => this.hooks.close() }, '×'),
    );

    const body: HTMLElement[] = [head, this.statsEl];
    this.recordEl = h('div', { class: 'i-record' });
    body.push(this.recordEl);

    if (t.def.targets) {
      const seg = h('div', { class: 'seg' });
      for (const [mode, label] of TARGETS) {
        seg.append(h('button', {
          class: t.targeting === mode ? 'on' : '',
          onclick: () => { this.hooks.target(t, mode); this.hooks.sound('click'); },
        }, label));
      }
      body.push(h('div', { class: 'i-sec' }, 'Target'), seg);
    }

    if (t.path.length) {
      const names = t.path.map((id) => t.def.upgrades.find((u) => u.id === id)!.name);
      body.push(h('div', { class: 'i-owned' }, ...names.map((n) => h('span', {}, `✓ ${n}`))));
    }

    const fork = ups.length > 1;
    if (ups.length) {
      body.push(h('div', { class: 'i-sec' }, fork ? 'Choose one branch' : 'Upgrade'));
      const list = h('div', { class: `ups${fork ? ' fork' : ''}` });
      for (const u of ups) list.append(this.upCard(sim, t, u, fork));
      body.push(list);
    } else {
      body.push(h('div', { class: 'i-max' }, 'Fully upgraded'));
    }
    // A fork already taken: say what was given up.
    const forked = t.def.upgrades.filter((u) => u.parent !== null && t.def.upgrades.filter((x) => x.parent === u.parent).length > 1);
    const taken = forked.find((u) => t.path.includes(u.id));
    if (taken) {
      const other = forked.find((u) => u.parent === taken.parent && u.id !== taken.id);
      if (other) body.push(h('div', { class: 'i-locked' }, `${other.branch} branch locked out`));
    }

    const value = sim.sellValue(t);
    const armed = this.sellArmed > 0;
    this.sellBtn = h('button', {
      class: `sell${armed ? ' armed' : ''}`,
      onclick: () => {
        if (this.sellArmed) { this.hooks.sell(t); return; }
        this.sellArmed = this.nowCache + 2.5;
        this.hooks.sound('click');
        this.render(sim);
      },
    }, armed ? `Confirm +${value}` : t.fresh ? `Refund +${value}` : `Sell +${value}`);
    body.push(this.sellBtn);
    if (t.fresh && !armed) body.push(h('div', { class: 'i-note' }, 'Full refund until the next wave starts'));

    this.el.innerHTML = '';
    this.el.append(...body);
    this.update(sim, this.nowCache);
  }

  /** Stats with the previewed upgrade's changes. Only this block re-renders on preview. */
  private renderStats(): void {
    const t = this.tower;
    if (!t || !this.statsEl) return;
    const pStats = this.previewId ? statsFor(t.kind, [...t.path, this.previewId]) : null;
    this.hooks.preview(pStats);
    this.statsEl.innerHTML = '';
    for (const [label, val, f] of ROWS[t.kind]) {
      const a = val(t.stats);
      const row = h('div', { class: 'i-row' }, h('span', { class: 'k' }, label), h('span', { class: 'v' }, f(a)));
      if (pStats) {
        const b = val(pStats);
        if (Math.abs(b - a) > 1e-9) {
          // Lower reload is better; everything else higher is better.
          const better = label === 'Reload' ? b < a : b > a;
          row.append(h('span', { class: `to ${better ? 'better' : 'worse'}` }, `→ ${f(b)}`));
        }
      }
      this.statsEl.append(row);
    }
    for (const [id, el] of this.upCards) el.classList.toggle('on', id === this.previewId);
  }

  private setPreview(id: string | null): void {
    if (this.previewId === id) return;
    this.previewId = id;
    this.renderStats();
  }

  private upCard(sim: Sim, t: Tower, u: UpgradeDef, fork: boolean): HTMLElement {
    const on = this.previewId === u.id;
    const buy = h('button', {
      class: 'buy',
      onclick: (e: Event) => {
        e.stopPropagation();
        if (u.cost > sim.bits) { this.hooks.sound('invalid'); return; }
        this.previewId = null;
        this.hooks.upgrade(t, u.id);
      },
    }, h('span', { class: 'bit-ico sm' }), String(u.cost));
    this.affordEls.push({ el: buy, cost: u.cost });
    const card = h('div', { class: `up${on ? ' on' : ''}${fork ? ' branch' : ''}` },
      u.branch && fork ? h('div', { class: 'u-branch' }, u.branch) : null,
      h('div', { class: 'u-name' }, u.name),
      h('div', { class: 'u-blurb' }, u.blurb),
      buy,
    );
    this.upCards.set(u.id, card);
    card.addEventListener('click', () => { this.setPreview(this.previewId === u.id ? null : u.id); this.hooks.sound('hover'); });
    if (!isTouch()) {
      card.addEventListener('pointerenter', () => this.setPreview(u.id));
      card.addEventListener('pointerleave', () => this.setPreview(null));
    }
    return card;
  }
}
