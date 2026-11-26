/** Side panel, banners, coach marks and threat briefs. DOM over the canvas. */
import type { Sim } from '../game/sim';
import { MALWARE, TOWERS, TOWER_ORDER } from '../game/data';
import type { MalwareKind, TowerKind } from '../game/types';
import { iconCanvas } from '../render/sprites';
import { h, isTouch } from './dom';

export const SHORT: Record<TowerKind, string> = { filter: 'Filter', throttle: 'Throttle', mortar: 'Mortar' };

export const COUNTER: Record<MalwareKind, string> = {
  worm: 'Counter: Sandbox Mortar splash on a long, packed route.',
  spyware: 'Counter: Throttle fields with Packet Filters inside them. Mortar shells land behind it.',
  trojan: 'Counter: heavy damage early, with splash waiting past the kill point for the worms inside.',
};

export interface HudHooks {
  pause(): void;
  speed(): void;
  startWave(): void;
  cardDown(kind: TowerKind, e: PointerEvent, el: HTMLElement): void;
}

export class Hud {
  readonly panel: HTMLElement;
  private bitsVal: HTMLElement;
  private bitsBox: HTMLElement;
  private integVal: HTMLElement;
  private integBar: HTMLElement;
  private integBox: HTMLElement;
  readonly cards = new Map<TowerKind, HTMLElement>();
  private waveLabel: HTMLElement;
  private chips: HTMLElement;
  private go: HTMLButtonElement;
  private goText: HTMLElement;
  private goSub: HTMLElement;
  private goFill: HTMLElement;
  private speedBtn: HTMLButtonElement;
  private bannerEl: HTMLElement;
  private coachEl: HTMLElement;
  private briefEl: HTMLElement;
  private shownBits = -1;
  private targetBits = 0;
  private chipsFor = -1;
  private lastState = '';
  private lastInteg = -1;

  constructor(private root: HTMLElement, sim: Sim, hooks: HudHooks) {
    root.innerHTML = '';
    const pauseBtn = h('button', { class: 'icon-btn', 'aria-label': 'Pause', onclick: () => hooks.pause() },
      h('span', { class: 'pause-ico' }, h('i'), h('i')));
    this.speedBtn = h('button', { class: 'icon-btn speed', 'aria-label': 'Speed', onclick: () => hooks.speed() }, '1×');
    this.bitsVal = h('span', { class: 'val' }, '0');
    this.bitsBox = h('div', { class: 'stat bits', title: 'Bits: spend them on defenses' }, h('span', { class: 'ico bit-ico' }), this.bitsVal);
    this.integVal = h('span', { class: 'val' }, '0');
    this.integBar = h('i');
    this.integBox = h('div', { class: 'stat integ', title: 'Core integrity' },
      h('span', { class: 'ico core-ico' }), this.integVal, h('div', { class: 'bar' }, this.integBar));

    const cardsBox = h('div', { class: 'cards' });
    TOWER_ORDER.forEach((kind, k) => {
      const def = TOWERS[kind];
      const card = h('button', { class: 'card', 'data-kind': kind, 'aria-label': `${def.name}, ${def.cost} bits` },
        iconCanvas(kind, 30),
        h('span', { class: 'meta' }, h('span', { class: 'nm' }, SHORT[kind]), h('span', { class: 'cost' }, h('span', { class: 'bit-ico sm' }), String(def.cost))),
        isTouch() ? null : h('kbd', {}, String(k + 1)),
        h('span', { class: 'tip' }, h('b', {}, def.name), def.blurb, h('em', {}, `Strong: ${def.strong}`), h('em', { class: 'weak' }, `Weak: ${def.weak}`)),
      );
      card.addEventListener('pointerdown', (e) => hooks.cardDown(kind, e, card));
      card.addEventListener('contextmenu', (e) => e.preventDefault());
      this.cards.set(kind, card);
      cardsBox.append(card);
    });

    this.waveLabel = h('div', { class: 'wlabel' });
    this.chips = h('div', { class: 'chips' });
    this.goText = h('span', { class: 'go-t' });
    this.goSub = h('span', { class: 'go-s' });
    this.goFill = h('i', { class: 'go-fill' });
    this.go = h('button', { class: 'go', onclick: () => hooks.startWave() }, this.goFill, this.goText, this.goSub);

    this.panel = h('div', { class: 'panel' },
      h('div', { class: 'p-row' }, pauseBtn, this.speedBtn),
      h('div', { class: 'stats' }, this.bitsBox, this.integBox),
      cardsBox,
      h('div', { class: 'wave' }, this.waveLabel, this.chips, this.go),
    );
    this.bannerEl = h('div', { class: 'banner' });
    this.coachEl = h('div', { class: 'coach hidden' });
    this.briefEl = h('div', { class: 'brief hidden' });
    root.append(this.panel, this.bannerEl, this.coachEl, this.briefEl);
    this.shownBits = sim.bits;
    this.bitsVal.textContent = String(sim.bits);
  }

  /** Center of the bits icon on screen, for flying tokens. */
  counterPos(): [number, number] {
    const r = this.bitsBox.querySelector('.ico')!.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  bump(): void {
    this.bitsBox.classList.remove('bump');
    void this.bitsBox.offsetWidth;
    this.bitsBox.classList.add('bump');
  }

  setArmed(kind: TowerKind | null): void {
    for (const [k, el] of this.cards) el.classList.toggle('armed', k === kind);
  }

  setSpeed(n: number): void {
    this.speedBtn.textContent = `${n}×`;
    this.speedBtn.classList.toggle('on', n > 1);
  }

  update(sim: Sim, dt: number): void {
    // Bits roll toward the real value instead of jumping.
    this.targetBits = sim.bits;
    if (this.shownBits !== this.targetBits) {
      const d = this.targetBits - this.shownBits;
      const stepv = Math.sign(d) * Math.max(1, Math.abs(d) * Math.min(1, dt * 12));
      this.shownBits = Math.abs(stepv) >= Math.abs(d) ? this.targetBits : Math.round(this.shownBits + stepv);
      this.bitsVal.textContent = String(this.shownBits);
      if (d < 0) this.bitsBox.classList.add('spend');
    } else this.bitsBox.classList.remove('spend');

    if (sim.integrity !== this.lastInteg) {
      if (this.lastInteg > sim.integrity) {
        this.integBox.classList.remove('hit');
        void this.integBox.offsetWidth;
        this.integBox.classList.add('hit');
      }
      this.lastInteg = sim.integrity;
      this.integVal.textContent = String(sim.integrity);
      const f = sim.integrity / sim.maxIntegrity;
      this.integBar.style.width = `${f * 100}%`;
      this.integBox.classList.toggle('low', f <= 0.35);
    }

    for (const [kind, el] of this.cards) el.classList.toggle('poor', TOWERS[kind].cost > sim.bits);

    if (this.chipsFor !== sim.waveIndex) this.renderPreview(sim);

    let state: string;
    if (sim.result) state = 'done';
    else if (sim.canStartWave()) state = sim.buildPhase ? 'start' : `early${sim.earlyBonus()}`;
    else if (sim.waveIndex < sim.waveCount) state = 'incoming';
    else state = 'final';
    if (state !== this.lastState) {
      this.lastState = state;
      this.go.className = 'go';
      this.go.disabled = false;
      if (state === 'start') {
        this.go.classList.add('ready');
        this.goText.textContent = sim.waveIndex === 0 ? 'Start' : `Wave ${sim.waveIndex + 1}`;
        this.goSub.textContent = isTouch() ? '' : 'Space';
      } else if (state.startsWith('early')) {
        this.go.classList.add('early');
        this.goText.textContent = 'Call early';
        this.goSub.textContent = `+${sim.earlyBonus()} bits`;
      } else if (state === 'incoming') {
        this.go.disabled = true;
        this.go.classList.add('busy');
        this.goText.textContent = 'Incoming';
        this.goSub.textContent = '';
      } else {
        this.go.disabled = true;
        this.goText.textContent = state === 'final' ? 'Final wave' : '—';
        this.goSub.textContent = '';
      }
    }
    if (state === 'incoming') this.goFill.style.width = `${(1 - sim.spawnProgress()) * 100}%`;
    else this.goFill.style.width = '0%';
  }

  private renderPreview(sim: Sim): void {
    this.chipsFor = sim.waveIndex;
    this.chips.innerHTML = '';
    if (sim.waveIndex >= sim.waveCount) {
      this.waveLabel.textContent = `Wave ${sim.waveCount}/${sim.waveCount}`;
      this.chips.append(h('span', { class: 'hold' }, 'Hold the line'));
      return;
    }
    this.waveLabel.innerHTML = '';
    this.waveLabel.append('Next ', h('b', {}, `${sim.waveIndex + 1}`), `/${sim.waveCount}`);
    const counts = new Map<MalwareKind, number>();
    for (const g of sim.level.waves[sim.waveIndex].groups) counts.set(g.type, (counts.get(g.type) ?? 0) + g.count);
    for (const [kind, n] of counts) {
      const isNew = this.isNew(sim, kind);
      const chip = h('button', { class: `chip${isNew ? ' new' : ''}`, title: MALWARE[kind].name, onclick: () => this.showBrief(kind, false) },
        iconCanvas(kind, 18), `×${n}`, isNew ? h('span', { class: 'new-tag' }, 'NEW') : null);
      this.chips.append(chip);
    }
  }

  /** First wave this kind appears in on this map. */
  private isNew(sim: Sim, kind: MalwareKind): boolean {
    for (let w = 0; w < sim.waveIndex; w++) if (sim.level.waves[w].groups.some((g) => g.type === kind)) return false;
    return true;
  }

  /** Kinds in the next wave that haven't appeared earlier on this map. */
  newThreats(sim: Sim): MalwareKind[] {
    if (sim.waveIndex >= sim.waveCount) return [];
    const kinds = [...new Set(sim.level.waves[sim.waveIndex].groups.map((g) => g.type))];
    return kinds.filter((k) => this.isNew(sim, k));
  }

  showBrief(kind: MalwareKind, auto: boolean): void {
    const d = MALWARE[kind];
    this.briefEl.innerHTML = '';
    this.briefEl.append(
      iconCanvas(kind, 40),
      h('div', { class: 'b-body' },
        h('div', { class: 'b-tag' }, auto ? 'New threat' : 'Threat intel'),
        h('div', { class: 'b-name' }, d.name),
        h('div', { class: 'b-text' }, d.blurb),
        h('div', { class: 'b-counter' }, COUNTER[kind]),
      ),
      h('button', { class: 'b-x', 'aria-label': 'Dismiss', onclick: () => this.hideBrief() }, '×'),
    );
    this.briefEl.classList.remove('hidden');
    this.briefEl.classList.remove('in');
    void this.briefEl.offsetWidth;
    this.briefEl.classList.add('in');
  }

  hideBrief(): void { this.briefEl.classList.add('hidden'); }

  banner(title: string, sub: string, tone: 'wave' | 'clear' | 'final' | 'bad' = 'wave'): void {
    const el = h('div', { class: `bn ${tone}` }, h('div', { class: 'bn-t' }, title), sub ? h('div', { class: 'bn-s' }, sub) : null);
    this.bannerEl.innerHTML = '';
    this.bannerEl.append(el);
  }

  /** Points a hint at an element. Pass null to hide. */
  coach(text: string | null, target?: HTMLElement, side: 'left' | 'up' = 'left'): void {
    if (!text || !target) { this.coachEl.classList.add('hidden'); return; }
    const r = target.getBoundingClientRect();
    this.coachEl.className = `coach ${side}`;
    this.coachEl.textContent = text;
    if (side === 'left') {
      this.coachEl.style.left = '';
      this.coachEl.style.right = `${window.innerWidth - r.left + 12}px`;
      this.coachEl.style.top = `${r.top + r.height / 2}px`;
    }
  }

  get goButton(): HTMLElement { return this.go; }

  dispose(): void { this.root.innerHTML = ''; }
}
