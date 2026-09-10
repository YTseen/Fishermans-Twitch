import { audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const card = $('card');

const RARITY_LEVEL = { COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, MYTHIC: 5, JUNK: 1 };
const heroName = $('hero-name');
const heroSub = $('hero-sub');
const heroIcon = $('hero-icon');
const heroAmount = $('hero-amount');
const prizeSpecies = $('prize-species');
const prizeSize = $('prize-size');
const prizeRarity = $('prize-rarity');

const ICONS = {
  bits: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l7 6-7 14-7-14 7-6zm0 3.2L8.1 8.6 12 17l3.9-8.4L12 5.2z"/></svg>',
  money: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2v2.2a5 5 0 0 1 0 9.6V19h3v2H8v-2h3v-3.2a5 5 0 0 1 0-9.6V2h2zm-1 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>',
  sub: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 3h16l-2 13H6L4 3zm3.5 15h9L18 21H6l1.5-3z"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 8h18v3H3V8zm1 5h16v8H4v-8zm7-9a3 3 0 0 1 3 3H9a3 3 0 0 1 2-3zm0 4h2v13h-2V8z"/></svg>',
};

// what the hero sub-line says for each contribution type
const KIND = {
  bits: { cls: 'bits', icon: 'bits', text: (c) => `${digits(c.detail)} BITS` },
  donation: { cls: 'money', icon: 'money', text: (c) => `${c.detail} TIP` },
  sub: { cls: 'sub', icon: 'sub', text: (c) => stripArticle(c.detail).toUpperCase() },
  giftsub: { cls: 'sub', icon: 'gift', text: (c) => `GIFTED ×${digits(c.detail) || 1}` },
};
const digits = (s) => (String(s).match(/\d+/) || [''])[0];
const stripArticle = (s) => String(s).replace(/^an?\s+/i, '');
const nameWithArticle = (n) => (/^(a |an |the )/i.test(n) ? n : (/^[aeiou]/i.test(n) ? 'an ' : 'a ') + n);

function fmtLen(cm) {
  return cm >= 100 ? +(cm / 100).toFixed(2) + ' m' : Math.round(cm) + ' cm';
}
function fmtWeight(kg) {
  if (kg >= 1000) return +(kg / 1000).toFixed(1) + ' t';
  if (kg < 1) return Math.max(1, Math.round(kg * 1000)) + ' g';
  return +kg.toFixed(kg < 10 ? 1 : 0) + ' kg';
}

const SLOT_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789_@$';

// slot-machine text reveal: shuffle characters, lock in left-to-right, punch on land
function slotReveal(el, finalRaw, { instant = false, level = 1, silent = false } = {}) {
  const target = String(finalRaw).toUpperCase();
  clearInterval(el._slot);
  if (instant) {
    el.textContent = target;
    return;
  }
  const width = Math.max(target.length, 4);
  const total = 22;
  let frame = 0;
  el._slot = setInterval(() => {
    frame++;
    const locked = Math.floor((frame / total) * width);
    let s = '';
    for (let i = 0; i < width; i++) {
      if (i < locked) s += i < target.length ? target[i] : '';
      else if (i < target.length || Math.random() < 0.5) s += SLOT_CH[(Math.random() * SLOT_CH.length) | 0];
      else s += ' ';
    }
    el.textContent = s;
    if (!silent && frame % 2 === 0) audio.slotTick();
    if (frame >= total) {
      clearInterval(el._slot);
      el.textContent = target;
      el.classList.remove('hit');
      void el.offsetWidth;
      el.classList.add('hit');
      heroSub.classList.remove('hit');
      void heroSub.offsetWidth;
      heroSub.classList.add('hit');
      if (!silent) audio.jackpot(level);
    }
  }, 42);
}

let countTimer = 0;

/**
 * mode 'alert'  : hero = supporter name (slot) + contribution; prize = the fish
 * mode 'gallery': hero = species name (slot) + tier;           prize = size + rarity
 */
export function showCard(c, { instant = false, mode = 'alert' } = {}) {
  const rar = (c.rarity || 'COMMON').toLowerCase();
  for (const k of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'junk']) card.classList.remove('r-' + k);
  card.classList.add('r-' + rar);
  prizeRarity.textContent = c.rarity || 'COMMON';

  const cm = (c.lengthIn || 0) * 2.54;
  const kg = (c.weightLb || 0) * 0.453592;
  const sizeText = c.junk ? '' : `${fmtLen(cm)}  ·  ${fmtWeight(kg)}`;

  const level = RARITY_LEVEL[c.rarity] || 1;

  if (mode === 'gallery') {
    prizeSpecies.textContent = c.junk ? 'JUNK ITEM' : `TIER ${c.tier || '—'}`;
    prizeSize.textContent = sizeText;
    heroIcon.innerHTML = '';
    heroSub.className = '';
    heroAmount.textContent = c.detail || '';
    slotReveal(heroName, c.species, { instant, silent: true });
  } else {
    const kind = KIND[c.kind] || KIND.bits;
    heroIcon.innerHTML = ICONS[kind.icon];
    heroSub.className = kind.cls;
    heroAmount.textContent = kind.text(c);
    prizeSpecies.textContent = (c.junk ? c.species : nameWithArticle(c.species)).toUpperCase();
    prizeSize.textContent = sizeText;
    slotReveal(heroName, c.supporter || 'SOMEONE', { instant, level });
  }

  setTimeout(() => card.classList.add('show'), 20);
}

export function hideCard() {
  card.classList.remove('show');
}
