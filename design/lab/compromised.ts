/**
 * "System compromised": the defeat screen. A catastrophic-failure sequence:
 * the signal tears, the screen floods red with VHS static and a rolling
 * tracking band, and the title slams in, scrambling and corrupting.
 * Self-contained (injects its own CSS) so the game can adopt it as is.
 */
export interface CompromisedOpts {
  waves: number;
  of: number;
  vector: string;
  kills: number;
  earned: number;
  onRetry: () => void;
  onMenu: () => void;
}

const CSS = `
.cmp { position: fixed; inset: 0; z-index: 1000; overflow: hidden; font-family: 'IBM Plex Mono', ui-monospace, monospace; color: #fff; background: #000; }
.cmp canvas { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
.cmp .cmp-red { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, rgba(170,0,12,0.75), rgba(60,0,4,0.92) 55%, rgba(8,0,0,0.98)); mix-blend-mode: normal; }
.cmp .cmp-scan { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(0,0,0,0.35) 0 1px, transparent 1px 3px); pointer-events: none; }
.cmp .cmp-vig { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.85)); pointer-events: none; }
.cmp .cmp-content { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.6vh; padding: 16px; }
.cmp .cmp-kicker { font-size: clamp(9px, 1.6vh, 13px); letter-spacing: 0.4em; color: #ffb3b3; opacity: 0; }
.cmp .cmp-title { position: relative; font-family: 'IBM Plex Sans Condensed', 'IBM Plex Mono', sans-serif; font-weight: 700; line-height: 0.9; text-align: center; letter-spacing: 0.06em;
  font-size: clamp(38px, 13vh, 132px); text-shadow: 0 0 18px rgba(255,255,255,0.35), 0 0 60px rgba(255,40,60,0.6); opacity: 0; }
.cmp .cmp-title .cmp-ln { display: block; position: relative; }
.cmp .cmp-title .cmp-ln::before, .cmp .cmp-title .cmp-ln::after { content: attr(data-t); position: absolute; inset: 0; text-shadow: none; }
.cmp .cmp-title .cmp-ln::before { color: #ff2a3a; transform: translate(-0.04em, 0); clip-path: inset(0 0 55% 0); mix-blend-mode: screen; animation: cmpSliceA 2.3s infinite steps(1); }
.cmp .cmp-title .cmp-ln::after { color: #3ad8ff; transform: translate(0.04em, 0); clip-path: inset(55% 0 0 0); mix-blend-mode: screen; animation: cmpSliceB 1.9s infinite steps(1); }
.cmp .cmp-details { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: clamp(9px, 1.9vh, 14px); letter-spacing: 0.18em; color: #ffd0d0; min-height: 3.2em; }
.cmp .cmp-details .cmp-err { color: #fff; }
.cmp .cmp-cursor { display: inline-block; width: 0.6em; height: 1em; background: #ffd0d0; vertical-align: -0.12em; animation: cmpBlink 0.9s steps(1) infinite; }
.cmp .cmp-stats { display: flex; gap: 8px; opacity: 0; }
.cmp .cmp-stat { padding: 6px 12px; background: rgba(10,0,0,0.6); border: 1px solid rgba(255,80,90,0.35); box-shadow: inset 0 1px 3px rgba(0,0,0,0.7); text-align: center; }
.cmp .cmp-stat b { display: block; font-size: clamp(14px, 3vh, 22px); font-family: 'IBM Plex Sans Condensed', sans-serif; letter-spacing: 0.05em; }
.cmp .cmp-stat span { font-size: clamp(7px, 1.3vh, 10px); letter-spacing: 0.2em; color: #ff9a9a; }
.cmp .cmp-actions { display: flex; gap: 10px; margin-top: 1vh; opacity: 0; }
.cmp .cmp-b { height: 38px; min-width: 130px; padding: 0 18px; font-family: inherit; font-size: 11px; letter-spacing: 0.25em; color: #fff; cursor: pointer; position: relative;
  background: linear-gradient(180deg, #2a0a0d, #170507); border: 1px solid rgba(255,90,100,0.45); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 8px rgba(0,0,0,0.6); }
.cmp .cmp-b.cmp-primary { border-color: #ff5a64; }
.cmp .cmp-b.cmp-primary::before { content: ''; position: absolute; left: 10px; right: 10px; top: -1px; height: 1px; background: linear-gradient(90deg, transparent, #ffb3b8, transparent); }
.cmp .cmp-b:hover { box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 0 18px rgba(255,60,70,0.35); }
.cmp .cmp-b:active { transform: translateY(1px); box-shadow: inset 0 2px 5px rgba(0,0,0,0.7); }
.cmp .cmp-ticker { position: absolute; left: 0; right: 0; bottom: max(10px, env(safe-area-inset-bottom)); overflow: hidden; white-space: nowrap; font-size: 10px; letter-spacing: 0.25em; color: rgba(255,170,170,0.7); }
.cmp .cmp-ticker span { display: inline-block; padding-left: 100%; animation: cmpTick 14s linear infinite; }
.cmp .cmp-corner { position: absolute; font-size: 9px; letter-spacing: 0.2em; color: rgba(255,170,170,0.55); }
.cmp .cmp-flashwhite { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
.cmp.in .cmp-kicker { animation: cmpFade 0.3s 0.75s forwards; }
.cmp.in .cmp-title { animation: cmpSlam 0.45s 0.85s cubic-bezier(0.2, 1.4, 0.4, 1) forwards; }
.cmp.in .cmp-stats { animation: cmpFade 0.4s 2.1s forwards; }
.cmp.in .cmp-actions { animation: cmpFade 0.4s 2.5s forwards; }
.cmp.in .cmp-flashwhite { animation: cmpFlash 0.7s forwards; }
@keyframes cmpFade { to { opacity: 1; } }
@keyframes cmpSlam { 0% { opacity: 0; transform: scale(1.8); filter: blur(10px); } 60% { opacity: 1; transform: scale(0.96); filter: blur(0); } 100% { opacity: 1; transform: scale(1); } }
@keyframes cmpFlash { 0% { opacity: 0; } 8% { opacity: 0.9; } 12% { opacity: 0.1; } 18% { opacity: 0.7; } 30% { opacity: 0; } 100% { opacity: 0; } }
@keyframes cmpBlink { 50% { opacity: 0; } }
@keyframes cmpTick { to { transform: translateX(-100%); } }
@keyframes cmpSliceA { 0%, 70%, 100% { clip-path: inset(0 0 55% 0); transform: translate(-0.04em, 0); } 72% { clip-path: inset(20% 0 50% 0); transform: translate(-0.14em, 0.02em); } 78% { clip-path: inset(62% 0 8% 0); transform: translate(0.1em, 0); } 84% { clip-path: inset(5% 0 80% 0); transform: translate(-0.08em, 0); } }
@keyframes cmpSliceB { 0%, 60%, 100% { clip-path: inset(55% 0 0 0); transform: translate(0.04em, 0); } 63% { clip-path: inset(35% 0 40% 0); transform: translate(0.16em, 0); } 70% { clip-path: inset(80% 0 2% 0); transform: translate(-0.1em, 0); } 76% { clip-path: inset(10% 0 70% 0); transform: translate(0.06em, 0.02em); } }
`;

const GLYPHS = '█▓▒░#%&@$*/\\<>?!01';

export function showCompromised(o: CompromisedOpts): () => void {
  if (!document.getElementById('cmp-css')) {
    const s = document.createElement('style');
    s.id = 'cmp-css';
    s.textContent = CSS;
    document.head.append(s);
  }
  const root = document.createElement('div');
  root.className = 'cmp';
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  root.innerHTML = `
    <canvas></canvas><div class="cmp-red"></div><div class="cmp-scan"></div><div class="cmp-vig"></div>
    <div class="cmp-corner" style="left:max(14px,env(safe-area-inset-left));top:12px">ERR 0xC0DE5EC · INCIDENT 26-1127</div>
    <div class="cmp-corner" style="right:max(14px,env(safe-area-inset-right));top:12px">${stamp} UTC</div>
    <div class="cmp-content">
      <div class="cmp-kicker">CRITICAL FAILURE</div>
      <div class="cmp-title"><span class="cmp-ln" data-t="SYSTEM">SYSTEM</span><span class="cmp-ln" data-t="COMPROMISED">COMPROMISED</span></div>
      <div class="cmp-details"><div class="cmp-d1"></div><div class="cmp-d2"></div></div>
      <div class="cmp-stats">
        <div class="cmp-stat"><b>${o.waves}/${o.of}</b><span>WAVES HELD</span></div>
        <div class="cmp-stat"><b>${o.kills}</b><span>PURGED</span></div>
        <div class="cmp-stat"><b>${o.earned}</b><span>BITS EARNED</span></div>
      </div>
      <div class="cmp-actions"><button class="cmp-b cmp-primary" data-a="retry">RETRY</button><button class="cmp-b" data-a="menu">MENU</button></div>
    </div>
    <div class="cmp-ticker"><span>!! CORE DC-01 OFFLINE · ALL SEGMENTS LOST · BREACH VECTOR ${o.vector} · CONTAINMENT FAILED · REBOOT REQUIRED · !! CORE DC-01 OFFLINE · ALL SEGMENTS LOST ·</span></div>
    <div class="cmp-flashwhite"></div>`;
  document.body.append(root);
  requestAnimationFrame(() => root.classList.add('in'));

  /* VHS static: a low-res noise buffer, a rolling tracking band and tear lines */
  const cv = root.querySelector('canvas')!;
  const g = cv.getContext('2d')!;
  let W = 0, H = 0, img: ImageData | null = null;
  const size = () => { W = Math.ceil(innerWidth / 3); H = Math.ceil(innerHeight / 3); cv.width = W; cv.height = H; img = g.createImageData(W, H); };
  size();
  addEventListener('resize', size);
  const t0 = performance.now();
  let raf = 0;
  const draw = (now: number) => {
    raf = requestAnimationFrame(draw);
    const t = (now - t0) / 1000;
    if (!img) return;
    const d = img.data;
    const band = ((t * 0.18) % 1.3 - 0.15) * H;
    const burst = t < 0.7 ? 1 : 0.35 + 0.15 * Math.sin(t * 7);
    for (let y = 0; y < H; y++) {
      const inBand = Math.abs(y - band) < H * 0.06;
      const rowShift = inBand ? ((Math.random() * 6) | 0) : 0;
      const rowGain = inBand ? 1.8 : 1;
      for (let x = 0; x < W; x++) {
        const i = (y * W + ((x + rowShift) % W)) * 4;
        const n = Math.random() * 255 * burst * rowGain;
        d[i] = Math.min(255, n * 1.05); d[i + 1] = n * 0.35; d[i + 2] = n * 0.38; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // tear lines
    const tears = t < 0.7 ? 10 : 2 + ((Math.random() * 3) | 0);
    for (let k = 0; k < tears; k++) {
      const y = Math.random() * H, h = 1 + Math.random() * (t < 0.7 ? 8 : 3);
      g.drawImage(cv, 0, y, W, h, (Math.random() - 0.5) * 30, y, W, h);
    }
  };
  raf = requestAnimationFrame(draw);

  /* title: scramble into place, then corrupt a letter now and then */
  const lines = [...root.querySelectorAll<HTMLElement>('.cmp-title .cmp-ln')];
  const finals = lines.map((l) => l.dataset.t!);
  const setLine = (el: HTMLElement, s: string) => { el.textContent = s; el.dataset.t = s; };
  const timers: number[] = [];
  const startScramble = 850;
  for (let step = 0; step <= 14; step++) {
    timers.push(window.setTimeout(() => {
      lines.forEach((el, li) => {
        const f = finals[li];
        setLine(el, [...f].map((ch, i) => (i < (step / 14) * f.length ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join(''));
      });
    }, startScramble + step * 45));
  }
  const corrupt = () => {
    const li = (Math.random() * lines.length) | 0;
    const f = finals[li];
    const i = (Math.random() * f.length) | 0;
    setLine(lines[li], f.slice(0, i) + GLYPHS[(Math.random() * GLYPHS.length) | 0] + f.slice(i + 1));
    timers.push(window.setTimeout(() => setLine(lines[li], f), 70 + Math.random() * 90));
    timers.push(window.setTimeout(corrupt, 300 + Math.random() * 900));
  };
  timers.push(window.setTimeout(corrupt, 1700));

  /* details type in like a terminal */
  const typeInto = (el: HTMLElement, html: string, plain: string, at: number) => {
    for (let i = 0; i <= plain.length; i++) timers.push(window.setTimeout(() => { el.innerHTML = i < plain.length ? `${plain.slice(0, i)}<span class="cmp-cursor"></span>` : html; }, at + i * 18));
  };
  typeInto(root.querySelector('.cmp-d1')!, '<span class="cmp-err">CORE · DC-01</span> · INTEGRITY 0%', 'CORE · DC-01 · INTEGRITY 0%', 1400);
  typeInto(root.querySelector('.cmp-d2')!, `BREACH VECTOR · <span class="cmp-err">${o.vector}</span>`, `BREACH VECTOR · ${o.vector}`, 1400 + 28 * 18);

  const close = () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); removeEventListener('resize', size); root.remove(); };
  root.querySelector('[data-a=retry]')!.addEventListener('click', () => { close(); o.onRetry(); });
  root.querySelector('[data-a=menu]')!.addEventListener('click', () => { close(); o.onMenu(); });
  return close;
}
