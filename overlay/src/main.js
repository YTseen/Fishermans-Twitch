import { Stage } from './scene.js';
import { playCatch } from './catch.js';
import { showCard, hideCard } from './ui.js';
import { audio } from './audio.js';

const params = new URLSearchParams(location.search);
const WS_PORT = params.get('port') || '7333';
if (params.has('mute')) audio.muted = true;
if (params.get('side') === 'left') document.getElementById('card').classList.add('left');

const stage = new Stage(document.getElementById('stage'));
stage.start();

// --- review gallery: ?gallery ------------------------------------------
if (params.has('gallery')) {
  const { startGallery } = await import('./gallery.js');
  startGallery(stage, WS_PORT);
} else {
  runOverlay();
}

// --- live overlay -----------------------------------------------------------
function runOverlay() {
  const queue = [];
  let playing = false;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function enqueue(payload) {
    queue.push(payload);
    if (!playing) next();
  }

  async function next() {
    const c = queue.shift();
    if (!c) {
      playing = false;
      return;
    }
    playing = true;

    audio.resume();
    await playCatch(stage, c, { onReveal: () => showCard(c) });

    hideCard();
    await wait(650);
    next();
  }

  const offline = document.getElementById('offline');
  let ws;
  function connect() {
    ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
    ws.addEventListener('open', () => offline.classList.add('hidden'));
    ws.addEventListener('close', () => {
      offline.classList.remove('hidden');
      setTimeout(connect, 2000);
    });
    ws.addEventListener('error', () => ws.close());
    ws.addEventListener('message', (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === 'catch') enqueue(msg.catch);
    });
  }
  connect();

  // manual test: keys 1-5 / 0 in a browser tab
  addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '5') enqueue(DEMO[+e.key]);
    if (e.key === '0') enqueue(DEMO.junk);
  });
}

const mk = (o) => ({ supporter: 'TestAngler', junk: false, emissive: 0, ...o });
const DEMO = {
  1: mk({ species: 'Bluegill', speciesId: 'bluegill', shape: 'panfish', tint: '#3f7a4a', lengthIn: 8.4, weightLb: 0.6, rarity: 'COMMON', tier: 1, detail: '150 bits', kind: 'bits', sceneMs: 8000 }),
  2: mk({ species: 'Largemouth Bass', speciesId: 'largemouth-bass', shape: 'torpedo', tint: '#3f6b3a', lengthIn: 19.2, weightLb: 4.6, rarity: 'UNCOMMON', tier: 2, detail: 'a sub', kind: 'sub', sceneMs: 9000 }),
  3: mk({ species: 'Muskellunge', speciesId: 'muskellunge', shape: 'eel', tint: '#6a7a4a', lengthIn: 44.0, weightLb: 26, rarity: 'RARE', tier: 3, detail: '$35.00', kind: 'donation', sceneMs: 10000 }),
  4: mk({ species: 'Channel Catfish', speciesId: 'channel-catfish', shape: 'catfish', tint: '#6a6a6a', lengthIn: 30.0, weightLb: 12, rarity: 'EPIC', tier: 4, detail: '5 gift subs', kind: 'giftsub', sceneMs: 12000 }),
  5: mk({ species: 'A Tuna. In the lake.', speciesId: 'brindle-bruiser-tuna', shape: 'torpedo', tint: '#3a5a7a', lengthIn: 90, weightLb: 240, rarity: 'MYTHIC', tier: 5, detail: '$150.00', kind: 'donation', sceneMs: 15000 }),
  junk: mk({ species: 'An Old Boot', speciesId: 'old-boot', shape: 'junk', tint: '#3a2a1a', lengthIn: 12, weightLb: 2, rarity: 'JUNK', tier: 1, detail: '200 bits', kind: 'bits', junk: true, sceneMs: 8000 }),
};
