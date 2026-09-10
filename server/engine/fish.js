import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mulberry32, hashString, pickWeighted, clamp } from './rng.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(here, '..', 'data', name), 'utf8'));

export const TIERS = load('tiers.json');
export const SPECIES = load('species.json');

const RARITY_ORDER = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
const RARITY = [
  { at: 0.97, name: 'MYTHIC' },
  { at: 0.88, name: 'LEGENDARY' },
  { at: 0.72, name: 'EPIC' },
  { at: 0.48, name: 'RARE' },
  { at: 0.2, name: 'UNCOMMON' },
  { at: 0, name: 'COMMON' },
];
const bump = (name, by) =>
  RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, Math.max(0, RARITY_ORDER.indexOf(name) + by))];

function tierFor(value) {
  return (
    TIERS.find((t) => value >= t.min && (t.max == null || value < t.max)) ||
    TIERS[TIERS.length - 1]
  );
}

// Bell-ish 0..1, mean nudged toward `bias` (how deep the amount sits in its band).
function sizeRoll(rand, bias) {
  const bell = (rand() + rand() + rand()) / 3;
  const v = bell * 0.62 + bias * 0.38 + (rand() - 0.5) * 0.08;
  return clamp(v, 0, 1);
}

/**
 * norm: output of normalize() -> { kind, value, supporter, detail, currency? }
 * returns the full catch payload the overlay renders.
 */
export function rollCatch(norm, config) {
  const seed = hashString(
    `${norm.supporter}|${norm.kind}|${norm.value}|${Date.now()}|${Math.random()}`,
  );
  const rand = mulberry32(seed);

  const tier = tierFor(norm.value);
  const tierIdx = TIERS.indexOf(tier);
  const nextTier = TIERS[tierIdx + 1];

  // Occasionally the line pulls something from one tier up.
  let sourceTier = tier;
  let luckyBleed = false;
  if (nextTier && rand() < (config.bleedChance ?? 0.08)) {
    sourceTier = nextTier;
    luckyBleed = true;
  }

  let speciesId;
  let junk = false;
  if (rand() < (config.junkChance ?? 0.06) && config.junk?.length) {
    junk = true;
    luckyBleed = false;
    speciesId = pickWeighted(
      rand,
      config.junk.map((id) => ({ item: id, weight: 1 })),
    );
  } else {
    speciesId = pickWeighted(
      rand,
      sourceTier.pool.map((p) => ({ item: p.id, weight: p.weight })),
    );
  }

  const sp = SPECIES[speciesId] || SPECIES._fallback;

  const span = ((tier.max ?? tier.min * 2) || 1) - tier.min;
  const bias = span > 0 ? clamp((norm.value - tier.min) / span, 0, 1) : 0.6;
  const roll = sizeRoll(rand, bias);

  const [lo, hi] = sp.lengthRange;
  const lengthIn = +(lo + (hi - lo) * roll).toFixed(1);
  const weightLb = +(sp.maxWeight * Math.pow(lengthIn / hi, 3)).toFixed(
    weightLbDecimals(sp.maxWeight),
  );

  let rarity = RARITY.find((r) => roll >= r.at).name;
  if (junk) {
    rarity = speciesId === 'treasure-chest' ? 'LEGENDARY' : 'JUNK';
  } else {
    // the amount sets a floor; a big roll can still climb above it
    const floor = tier.rarityFloor || 'COMMON';
    if (RARITY_ORDER.indexOf(rarity) < RARITY_ORDER.indexOf(floor)) rarity = floor;
    if (luckyBleed) rarity = bump(rarity, 1);
  }

  return {
    id: seed.toString(36),
    supporter: norm.supporter,
    kind: norm.kind,
    detail: norm.detail,
    value: +norm.value.toFixed(2),
    tier: tier.n,
    species: sp.name,
    speciesId,
    model: speciesId,
    shape: sp.shape || 'torpedo',
    tint: sp.tint || '#7a8a7a',
    emissive: sp.emissive || 0,
    junk,
    lengthIn,
    weightLb,
    rarity,
    luckyBleed,
    sceneMs: tier.sceneMs ?? config.defaultSceneMs ?? 9000,
    seed,
  };
}

function weightLbDecimals(maxWeight) {
  return maxWeight < 5 ? 2 : maxWeight < 100 ? 1 : 0;
}
