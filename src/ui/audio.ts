/**
 * Synth sound effects: short envelopes on oscillators and filtered noise, no
 * audio files. Every sound has a minimum gap so a swarm doesn't become static.
 */
type Fn = (a: AudioContext, out: AudioNode, t: number, v: number) => void;
type Spec = { gap: number; fn: Fn };

export class Sound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  noise: AudioBuffer | null = null;
  private last = new Map<string, number>();
  enabled = true;

  /** Must run inside a user gesture on iOS. */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 6;
    this.out = this.ctx.createGain();
    this.out.gain.value = 0.55;
    this.out.connect(this.comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.6;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  play(name: string, vol = 1): void {
    if (!this.enabled || !this.ctx || !this.out) return;
    const spec = SOUNDS[name];
    if (!spec) return;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < spec.gap) return;
    this.last.set(name, now);
    spec.fn(this.ctx, this.out, now + 0.005, vol);
  }
}

let shared: Sound | null = null;
export function getSound(): Sound {
  if (!shared) shared = new Sound();
  return shared;
}

function tone(a: AudioContext, out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, attack = 0.004): void {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(a: AudioContext, out: AudioNode, t: number, dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', f1?: number): void {
  const buf = shared?.noise;
  if (!buf) return;
  const s = a.createBufferSource();
  s.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 0.1);
  s.stop(t + dur + 0.03);
}

const r = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

const SOUNDS: Record<string, Spec> = {
  // UI
  click: { gap: 0.03, fn: (a, o, t) => tone(a, o, t, 'sine', 900, 600, 0.05, 0.12) },
  hover: { gap: 0.05, fn: (a, o, t) => tone(a, o, t, 'sine', 1800, 1700, 0.025, 0.03) },
  open: { gap: 0.05, fn: (a, o, t) => { tone(a, o, t, 'triangle', 500, 900, 0.09, 0.1); tone(a, o, t + 0.04, 'sine', 1400, 1500, 0.06, 0.05); } },
  close: { gap: 0.05, fn: (a, o, t) => tone(a, o, t, 'triangle', 800, 420, 0.08, 0.08) },
  // Placement
  pickup: { gap: 0.05, fn: (a, o, t) => { tone(a, o, t, 'triangle', 300, 700, 0.1, 0.12); noise(a, o, t, 0.06, 0.05, 3000, 2); } },
  snap: { gap: 0.04, fn: (a, o, t) => tone(a, o, t, 'square', 2200, 1800, 0.018, 0.025) },
  invalid: { gap: 0.15, fn: (a, o, t) => { tone(a, o, t, 'square', 140, 110, 0.16, 0.08); tone(a, o, t + 0.08, 'square', 120, 95, 0.14, 0.07); } },
  cancel: { gap: 0.08, fn: (a, o, t) => tone(a, o, t, 'sine', 600, 250, 0.12, 0.09) },
  place: {
    gap: 0.05,
    fn: (a, o, t) => {
      // Click-in, then a rising power-up chime.
      noise(a, o, t, 0.05, 0.35, 2500, 1.5);
      tone(a, o, t, 'square', 180, 90, 0.07, 0.15);
      tone(a, o, t + 0.05, 'triangle', 660, 990, 0.16, 0.12);
      tone(a, o, t + 0.12, 'sine', 1320, 1980, 0.22, 0.08);
      noise(a, o, t + 0.04, 0.18, 0.06, 6000, 3, 'highpass');
    },
  },
  sell: { gap: 0.08, fn: (a, o, t) => [1200, 900, 1500].forEach((f, k) => tone(a, o, t + k * 0.05, 'triangle', f, f * 1.02, 0.1, 0.1)) },
  upgrade: {
    gap: 0.1,
    fn: (a, o, t) => {
      [523, 784, 1046, 1568].forEach((f, k) => tone(a, o, t + k * 0.05, 'triangle', f, f, 0.18, 0.11));
      noise(a, o, t, 0.35, 0.05, 5000, 1, 'highpass');
    },
  },
  reroute: { gap: 0.2, fn: (a, o, t) => { tone(a, o, t, 'sawtooth', 220, 440, 0.22, 0.035); noise(a, o, t, 0.25, 0.04, 1200, 4, 'bandpass', 3000); } },
  coin: { gap: 0.035, fn: (a, o, t) => tone(a, o, t, 'sine', r(1900, 2300), 2600, 0.05, 0.035) },
  // Combat
  zap: { gap: 0.045, fn: (a, o, t) => tone(a, o, t, 'square', r(1500, 1800), 600, 0.04, 0.025) },
  thump: { gap: 0.1, fn: (a, o, t) => { tone(a, o, t, 'sine', 160, 60, 0.18, 0.28); noise(a, o, t, 0.1, 0.12, 600, 1); } },
  boom: { gap: 0.07, fn: (a, o, t) => { noise(a, o, t, 0.4, 0.32, 900, 0.8, 'lowpass', 150); tone(a, o, t, 'sine', 110, 40, 0.3, 0.25); } },
  pop: { gap: 0.04, fn: (a, o, t) => noise(a, o, t, 0.08, 0.12, 1800, 1.5) },
  kill: { gap: 0.04, fn: (a, o, t) => { tone(a, o, t, 'square', r(700, 1100), 120, 0.08, 0.05); noise(a, o, t, 0.05, 0.06, 4000, 3); } },
  crack: { gap: 0.1, fn: (a, o, t) => { noise(a, o, t, 0.3, 0.3, 2500, 0.8, 'bandpass', 400); tone(a, o, t, 'sawtooth', 300, 60, 0.3, 0.12); } },
  burst: { gap: 0.15, fn: (a, o, t) => { for (let k = 0; k < 5; k++) tone(a, o, t + k * 0.025, 'square', r(500, 1400), 200, 0.06, 0.04); } },
  alarm: {
    gap: 0.25,
    fn: (a, o, t) => {
      tone(a, o, t, 'sawtooth', 880, 660, 0.14, 0.12);
      tone(a, o, t + 0.15, 'sawtooth', 880, 660, 0.14, 0.1);
      noise(a, o, t, 0.2, 0.18, 300, 0.6, 'lowpass');
    },
  },
  steal: { gap: 0.2, fn: (a, o, t) => [1500, 1100, 800].forEach((f, k) => tone(a, o, t + 0.1 + k * 0.06, 'square', f, f * 0.9, 0.06, 0.05)) },
  // Waves
  wave: {
    gap: 0.5,
    fn: (a, o, t) => {
      tone(a, o, t, 'sawtooth', 110, 220, 0.5, 0.1, 0.08);
      tone(a, o, t, 'sawtooth', 165, 330, 0.5, 0.06, 0.08);
      noise(a, o, t, 0.5, 0.06, 400, 2, 'bandpass', 2500);
    },
  },
  early: { gap: 0.3, fn: (a, o, t) => [660, 880, 1320].forEach((f, k) => tone(a, o, t + k * 0.04, 'square', f, f, 0.07, 0.05)) },
  clear: { gap: 0.5, fn: (a, o, t) => [523, 659, 784, 1046].forEach((f, k) => tone(a, o, t + k * 0.07, 'triangle', f, f, 0.25, 0.12)) },
  win: {
    gap: 1,
    fn: (a, o, t) => {
      [523, 659, 784, 1046, 1318].forEach((f, k) => tone(a, o, t + k * 0.09, 'triangle', f, f, 0.35, 0.13));
      tone(a, o, t + 0.45, 'sine', 2093, 2093, 0.8, 0.06, 0.05);
    },
  },
  lose: {
    gap: 1,
    fn: (a, o, t) => {
      [392, 311, 262, 196].forEach((f, k) => tone(a, o, t + k * 0.16, 'sawtooth', f, f * 0.97, 0.35, 0.08));
      noise(a, o, t, 1.2, 0.12, 2000, 0.5, 'lowpass', 100);
    },
  },
};
