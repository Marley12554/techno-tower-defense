/** Screens: title, map briefing, pause, results. The canvas behind them is always live. */
import type { Sim } from '../game/sim';
import { LEVELS } from '../game/levels';
import { MALWARE } from '../game/data';
import type { LevelData, MalwareKind } from '../game/types';
import { Renderer } from '../render/renderer';
import { iconCanvas } from '../render/sprites';
import { loadSave, writeSave, type SaveData } from '../meta/save';
import { Play } from './play';
import { getSound } from './audio';
import { h, isTouch } from './dom';

const stars = (n: number) => h('span', { class: 'stars' }, ...[0, 1, 2].map((k) => h('i', { class: k < n ? 'on' : '' })));

export class App {
  private save: SaveData;
  private renderer: Renderer;
  private play: Play | null = null;
  private level: LevelData = LEVELS[0];

  constructor(canvas: HTMLCanvasElement, private ui: HTMLElement, private hud: HTMLElement) {
    this.save = loadSave();
    this.renderer = new Renderer(canvas);
    const snd = getSound();
    snd.enabled = this.save.sound;
    window.addEventListener('pointerdown', () => snd.unlock(), { capture: true });
    // Pause when the phone is turned to portrait mid-game.
    matchMedia('(orientation: portrait)').addEventListener('change', (e) => {
      if (e.matches && this.play && !this.play.paused && this.ui.classList.contains('hidden')) this.pause();
    });
    this.title();
  }

  private persist(): void { writeSave(this.save); }
  private click(): void { getSound().play('click'); }

  private show(...nodes: HTMLElement[]): void {
    this.ui.innerHTML = '';
    this.ui.append(...nodes);
    this.ui.classList.toggle('hidden', nodes.length === 0);
    document.body.classList.toggle('overlay-open', nodes.length > 0);
  }

  /** Quick scanline wipe over a screen change. */
  private wipe(then: () => void): void {
    const w = h('div', { class: 'wipe' });
    document.body.append(w);
    setTimeout(then, 180);
    setTimeout(() => w.remove(), 520);
  }

  private stopPlay(): void {
    this.play?.dispose();
    this.play = null;
  }

  private demo(): void {
    this.stopPlay();
    this.play = new Play(this.renderer, this.hud, this.level, null, null, true);
  }

  private btn(label: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = h('button', { class: `btn ${cls}`, onclick: () => { this.click(); fn(); } }, label);
    b.addEventListener('pointerenter', () => { if (!isTouch()) getSound().play('hover'); });
    return b;
  }

  private soundToggle(): HTMLButtonElement {
    const label = () => `Sound ${this.save.sound ? 'on' : 'off'}`;
    const b = this.btn(label(), 'ghost small', () => {
      this.save.sound = !this.save.sound;
      getSound().enabled = this.save.sound;
      b.textContent = label();
      this.persist();
    });
    return b;
  }

  /* ---------------------------------------------------------------- title */

  title(): void {
    this.demo();
    this.show(h('div', { class: 'screen title' },
      h('div', { class: 'logo', 'data-text': 'TECHNO' },
        h('span', { class: 'l1', 'data-text': 'TECHNO' }, 'TECHNO'),
        h('span', { class: 'l2' }, 'TOWER DEFENSE')),
      h('p', { class: 'tag' }, 'Malware is inbound. Defend the Core.'),
      h('div', { class: 'row' },
        this.btn('Play', 'primary big', () => { this.goFullscreen(); this.wipe(() => this.brief(this.level)); })),
      h('div', { class: 'row' }, this.soundToggle()),
      h('div', { class: 'foot' }, 'No ads · No timers · No paywalls'),
    ));
  }

  /** Phones lose a lot of height to browser chrome in landscape; ask for fullscreen where allowed. */
  private goFullscreen(): void {
    if (!isTouch()) return;
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      const p = el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.();
      if (p && 'then' in p) {
        (p as Promise<void>).then(() => {
          const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
          o?.lock?.('landscape').catch(() => {});
        }).catch(() => {});
      }
    } catch { /* not supported (iOS Safari) */ }
  }

  /* ---------------------------------------------------------------- brief */

  private brief(level: LevelData): void {
    this.level = level;
    const kinds = [...new Set(level.waves.flatMap((w) => w.groups.map((g) => g.type)))] as MalwareKind[];
    const best = this.save.stars[level.id] ?? 0;
    this.show(h('div', { class: 'screen overlay' },
      h('div', { class: 'card brief-card' },
        h('div', { class: 'col' },
          h('div', { class: 'eyebrow' }, `Sector ${level.sector}`),
          h('h2', {}, level.name),
          h('div', { class: 'facts' },
            h('span', {}, h('b', {}, String(level.waves.length)), ' waves'),
            h('span', {}, h('b', {}, String(level.integrity)), ' integrity'),
            h('span', {}, h('b', {}, String(level.startBits)), ' bits')),
          h('div', { class: 'eyebrow' }, 'Known threats'),
          h('div', { class: 'threats' }, ...kinds.map((k) => h('div', { class: 'threat' }, iconCanvas(k, 26), h('span', {}, MALWARE[k].name)))),
          h('div', { class: 'best' }, 'Best ', stars(best)),
        ),
        h('div', { class: 'col' },
          h('div', { class: 'eyebrow' }, 'Briefing'),
          h('ul', { class: 'howto' },
            h('li', {}, 'Drag defenses onto the grid. Malware paths around them, so walls make the route longer.'),
            h('li', {}, "You can't seal the route completely. A blocked spot shows red."),
            h('li', {}, 'Tap a defense to upgrade, retarget or sell it. Selling is a full refund until the next wave.'),
          ),
          h('div', { class: 'row end' },
            this.btn('Back', 'ghost', () => this.wipe(() => this.title())),
            this.btn('Deploy', 'primary', () => this.wipe(() => this.start(level)))),
        ),
      ),
    ));
  }

  /* ----------------------------------------------------------------- play */

  private start(level: LevelData): void {
    this.stopPlay();
    this.show();
    this.play = new Play(this.renderer, this.hud, level, {
      onEnd: (sim) => this.results(sim),
      onPause: () => this.pause(),
      persist: () => this.persist(),
    }, this.save);
  }

  private pause(): void {
    const p = this.play;
    if (!p) return;
    p.setPaused(true);
    this.show(h('div', { class: 'screen overlay' },
      h('div', { class: 'card narrow' },
        h('div', { class: 'eyebrow' }, `Sector ${this.level.sector} · wave ${p.sim.waveIndex}/${p.sim.waveCount}`),
        h('h2', {}, 'Paused'),
        this.btn('Resume', 'primary', () => { this.show(); p.setPaused(false); }),
        this.btn('Restart', 'ghost', () => this.wipe(() => this.start(this.level))),
        this.soundToggle(),
        this.btn('Quit to menu', 'ghost', () => this.wipe(() => this.title())),
      ),
    ));
  }

  private results(sim: Sim): void {
    const win = sim.result === 'win';
    const n = sim.stars();
    if (win && n > (this.save.stars[sim.level.id] ?? 0)) { this.save.stars[sim.level.id] = n; this.persist(); }
    const stat = (k: string, v: string) => h('div', { class: 'stat-cell' }, h('b', {}, v), h('span', {}, k));
    this.show(h('div', { class: `screen overlay result ${win ? 'win' : 'lose'}` },
      h('div', { class: 'card narrow' },
        h('div', { class: 'eyebrow' }, `Sector ${sim.level.sector} · ${sim.level.name}`),
        h('h2', { class: 'big-title' }, win ? 'Core secured' : 'Core breached'),
        win ? stars(n) : h('div', { class: 'reached' }, `Held until wave ${sim.waveIndex} of ${sim.waveCount}`),
        h('div', { class: 'stat-grid' },
          stat('integrity', `${sim.integrity}/${sim.maxIntegrity}`),
          stat('malware purged', String(sim.kills)),
          stat('leaked', String(sim.leaked)),
          stat('bits earned', String(sim.earned)),
        ),
        win && n < 3 ? h('div', { class: 'hint' }, `Finish with ${sim.level.stars[0]} integrity for 3 stars.`) : null,
        h('div', { class: 'row' },
          this.btn('Menu', 'ghost', () => this.wipe(() => this.title())),
          this.btn(win ? 'Play again' : 'Retry', 'primary', () => this.wipe(() => this.start(this.level)))),
      ),
    ));
  }
}
