import { presentFish } from './catch.js';
import { showCard } from './ui.js';

const RARITY_BY_TIER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

// Turn a catalogue entry into a catch payload the renderer + card understand.
function toCatch(sp, idx, total) {
  const [lo, hi] = sp.lengthRange;
  const lengthIn = +(lo + (hi - lo) * 0.6).toFixed(1);
  const weightLb = +(sp.maxWeight * Math.pow(lengthIn / hi, 3)).toFixed(1);
  return {
    species: sp.name,
    speciesId: sp.id,
    shape: sp.shape,
    tint: sp.tint,
    emissive: sp.emissive || 0,
    junk: !!sp.junk,
    lengthIn,
    weightLb,
    rarity: sp.junk ? 'JUNK' : RARITY_BY_TIER[(sp.tier || 1) - 1] || 'COMMON',
    tier: sp.tier || 1,
    supporter: `${idx + 1} of ${total}`,
    kind: 'bits',
    detail: sp.tier ? `TIER ${sp.tier}` : 'JUNK',
  };
}

export async function startGallery(stage, wsPort) {
  const bar = document.getElementById('gallery-bar');
  const nameEl = document.getElementById('g-name');
  const idxEl = document.getElementById('g-idx');
  const playBtn = document.getElementById('g-play');
  bar.hidden = false;
  document.getElementById('offline').hidden = true;

  let list;
  try {
    const cat = await fetch(`http://127.0.0.1:${wsPort}/catalogue.json`).then((r) => r.json());
    list = [...cat.species, ...cat.junk];
  } catch {
    nameEl.textContent = 'catalogue unreachable — run `npm start`';
    return;
  }
  if (!list.length) {
    nameEl.textContent = 'catalogue empty';
    return;
  }

  let i = 0;
  let playing = true;
  let timer = 0;

  const render = () => {
    const sp = list[i];
    const c = toCatch(sp, i, list.length);
    presentFish(stage, c);
    showCard(c, { instant: false, mode: 'gallery' });
    idxEl.textContent = `${i + 1} / ${list.length}`;
    nameEl.textContent = sp.name;
  };

  const step = (d) => {
    i = (i + d + list.length) % list.length;
    render();
    arm();
  };

  const arm = () => {
    clearInterval(timer);
    if (playing) timer = setInterval(() => step(1), 3200);
  };

  document.getElementById('g-prev').onclick = () => step(-1);
  document.getElementById('g-next').onclick = () => step(1);
  playBtn.onclick = () => {
    playing = !playing;
    playBtn.textContent = playing ? '❚❚' : '▶';
    arm();
  };
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === ' ') {
      e.preventDefault();
      playBtn.click();
    }
  });

  render();
  arm();
}
