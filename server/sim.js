import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import WebSocket from 'ws';

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8'));

const NAMES = [
  'JadeFan23', 'reelbigfish', 'BassGod', 'lurker_pete', 'xX_Angler_Xx',
  'CarpDiem', 'nightcrawler', 'SplashZone', 'TackleBox', 'GoneFishin',
];

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) {
      const key = k.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) a[key] = true;
      else {
        a[key] = next;
        i++;
      }
    }
  }
  return a;
}

function buildEvent(a) {
  const user = a.user || NAMES[Math.floor(Math.random() * NAMES.length)];
  const tier = String((Number(a.tier) || 1) * 1000);

  if (a.bits != null) return { type: 'cheer', user, bits: Number(a.bits) || 100 };
  if (a.donation != null)
    return {
      type: 'donation',
      user,
      amount: Number(a.donation) || 5,
      currency: a.currency || 'USD',
    };
  if (a.giftsub != null)
    return { type: 'giftsub', user, tier, total: Number(a.giftsub) || 1 };
  if (a.sub != null)
    return { type: 'sub', user, tier: String((Number(a.sub) || 1) * 1000) };
  if (a.resub != null)
    return {
      type: 'resub',
      user,
      tier,
      months: Number(a.resub) || 2,
    };
  return null;
}

const args = parseArgs(process.argv.slice(2));
const event = buildEvent(args);

if (!event) {
  console.log(`Usage:
  npm run sim -- --bits 250
  npm run sim -- --donation 40
  npm run sim -- --sub 3            (tier 1/2/3)
  npm run sim -- --resub 12 --tier 2
  npm run sim -- --giftsub 5 --tier 1
  optional: --user SomeName --currency EUR`);
  process.exit(1);
}

const url = `ws://127.0.0.1:${config.wsPort}`;
const ws = new WebSocket(url);

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'sim', event }));
  console.log(`[sim] -> ${url}`, event);
  setTimeout(() => ws.close(), 250);
});
ws.on('error', (e) => {
  console.error(`[sim] could not reach ${url} — is \`npm start\` running?`);
  console.error('      ' + e.message);
  process.exit(1);
});
