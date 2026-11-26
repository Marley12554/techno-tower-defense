/**
 * Headless tuning: plays each level with a few bot builds and seeds.
 *   npm run tune -- [levelId] [seeds]
 * The bot is a yardstick, not a player. Big integrity margins mean the map is slack.
 */
import { Sim } from '../src/game/sim';
import { Bot, DEFAULT_BOT, playOut, type BotOptions } from '../src/game/bot';
import { LEVELS } from '../src/game/levels';

const only = process.argv[2];
const seeds = Number(process.argv[3] ?? 4);

const builds: Record<string, BotOptions> = {
  'maze+cluster': DEFAULT_BOT,
  'maze+long': { ...DEFAULT_BOT, mortarBranch: 'mb1' },
  'no maze': { ...DEFAULT_BOT, maze: 0 },
  'filters only': { ...DEFAULT_BOT, order: ['filter', 'filter', 'up'] },
  'early calls': { ...DEFAULT_BOT, early: true },
};

console.log('level  build          wins  integ  wave  bits  kills  earned  towers');
for (const l of LEVELS) {
  if (only && l.id !== only) continue;
  for (const [name, opt] of Object.entries(builds)) {
    const rs = Array.from({ length: seeds }, (_, k) => playOut(new Sim(l, k + 1), new Bot(opt)));
    const wins = rs.filter((r) => r.result === 'win').length;
    const avg = (f: (s: Sim) => number) => (rs.reduce((a, s) => a + f(s), 0) / rs.length).toFixed(0);
    console.log(
      `${l.id.padEnd(6)} ${name.padEnd(14)} ${wins}/${seeds}  ${avg((s) => s.integrity).padStart(5)}  ${avg((s) => s.waveIndex).padStart(4)}  ${avg((s) => s.bits).padStart(4)}  ${avg((s) => s.kills).padStart(5)}  ${avg((s) => s.earned).padStart(6)}  ${rs[0].towers.map((t) => t.kind[0] + t.path.length).join(' ')}`,
    );
  }
}
