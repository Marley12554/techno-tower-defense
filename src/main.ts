import './ui/styles.css';
import { App } from './ui/app';
import { guardZoom } from './ui/zoom';

guardZoom();

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const hud = document.getElementById('hud') as HTMLElement;
// Wait briefly for the display font so canvas text doesn't flash in a fallback.
let started = false;
const start = () => { if (!started) { started = true; new App(canvas, ui, hud); } };
if (document.fonts?.load) {
  Promise.all([document.fonts.load('700 16px "Chakra Petch"'), document.fonts.load('700 16px "JetBrains Mono"')]).then(start, start);
  setTimeout(start, 1500);
} else start();
