import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { psxMaterial } from './scene.js';

// ---------------------------------------------------------------------------
// Procedural fish. Bodies are lofted from a per-family profile curve (smooth,
// well formed); the retro look comes from the low-res target + posterise in
// scene.js, not from wrecked geometry. Colours are all vertex-painted — no
// texture assets. Each build returns a Group with:
//   userData.mouth  : Vector3 (local) where a hand grips the lower lip
//   userData.grip   : 'lip' | 'cradle' | 'hug' | 'none'
//   userData.bodyLen: world length of the built mesh (before catch scaling)
// ---------------------------------------------------------------------------

const BODY_LEN = 3.4;
const RINGS = 30;
const RAD = 16;

let MANIFEST = null;
const gltf = new GLTFLoader();

export async function buildCatchObject(c) {
  // optional real model override
  try {
    MANIFEST ??= await fetch('models/models.json').then((r) => (r.ok ? r.json() : {}));
    const entry = MANIFEST[c.speciesId];
    if (entry?.file) {
      const g = await gltf.loadAsync(`models/${entry.file}`);
      fitModel(g.scene, entry);
      g.scene.userData = { mouth: new THREE.Vector3(0, BODY_LEN * 0.5, 0), grip: 'lip', bodyLen: BODY_LEN };
      return g.scene;
    }
  } catch (e) {
    console.warn('[fish] model load failed, procedural:', e.message);
  }

  if (c.junk) return buildJunk(c);
  if (c.shape === 'squid') return buildSquid(c);
  if (c.shape === 'crab') return buildCrab(c);
  if (c.shape === 'shrimp' || c.shape === 'crayfish') return buildShrimp(c);
  return buildFish(resolveSpec(c));
}

// ---------------------------------------------------------------------------
// Family specs
// ---------------------------------------------------------------------------

// profile: [t, halfHeight, halfWidth] nose(0) -> tail base(1), fraction of length
const P = {
  bass: [[0, .01, .008], [.03, .045, .03], [.07, .078, .05], [.12, .108, .063], [.17, .132, .071], [.26, .152, .078], [.38, .153, .077], [.52, .139, .069], [.66, .107, .052], [.78, .072, .035], [.88, .042, .02], [.94, .026, .012], [1, .018, .008]],
  disc: [[0, .022, .014], [.04, .1, .034], [.1, .2, .052], [.18, .28, .06], [.3, .305, .062], [.42, .295, .06], [.56, .235, .052], [.7, .15, .038], [.82, .075, .022], [.91, .04, .014], [1, .024, .01]],
  perch: [[0, .014, .012], [.05, .06, .036], [.12, .1, .056], [.22, .14, .066], [.32, .152, .07], [.46, .14, .064], [.6, .108, .05], [.74, .072, .034], [.85, .044, .02], [.93, .028, .013], [1, .02, .009]],
  slim: [[0, .016, .014], [.05, .055, .04], [.12, .09, .062], [.22, .112, .072], [.35, .12, .074], [.5, .115, .07], [.64, .098, .058], [.77, .07, .04], [.87, .045, .024], [.94, .03, .015], [1, .022, .01]],
  pike: [[0, .012, .012], [.06, .045, .03], [.14, .07, .05], [.26, .088, .06], [.4, .092, .06], [.54, .09, .057], [.68, .08, .05], [.8, .06, .036], [.89, .04, .022], [.95, .028, .013], [1, .02, .009]],
  gar: [[0, .006, .006], [.06, .026, .024], [.16, .05, .046], [.3, .058, .053], [.45, .06, .055], [.6, .058, .052], [.74, .05, .044], [.85, .04, .033], [.93, .028, .02], [1, .014, .01]],
  sturgeon: [[0, .006, .006], [.06, .04, .038], [.14, .075, .072], [.24, .1, .09], [.34, .106, .092], [.48, .096, .078], [.62, .075, .056], [.76, .052, .036], [.86, .036, .022], [.93, .024, .013], [1, .012, .007]],
  catfish: [[0, .03, .045], [.05, .07, .09], [.12, .1, .115], [.22, .115, .115], [.35, .115, .1], [.5, .105, .082], [.64, .086, .06], [.77, .062, .04], [.87, .042, .024], [.94, .028, .014], [1, .02, .009]],
  carp: [[0, .014, .012], [.04, .06, .04], [.1, .12, .072], [.2, .18, .092], [.32, .215, .102], [.46, .21, .1], [.6, .17, .084], [.74, .115, .056], [.85, .066, .03], [.93, .038, .016], [1, .022, .009]],
  billfish: [[0, .006, .006], [.12, .02, .02], [.2, .07, .055], [.3, .108, .078], [.42, .12, .08], [.56, .108, .07], [.7, .085, .052], [.82, .058, .033], [.9, .038, .02], [.96, .024, .012], [1, .016, .008]],
  angler: [[0, .02, .016], [.05, .13, .1], [.13, .2, .16], [.24, .225, .175], [.36, .2, .15], [.5, .15, .1], [.64, .09, .055], [.78, .05, .03], [.9, .03, .016], [1, .018, .01]],
};

const FAMILY = {
  bass: {
    profile: P.bass, bellyBias: 0.12,
    colors: { back: 0x33421f, mid: 0x8f9b5c, belly: 0xe7e2c4, line: 0x2b3417, fin: 0x5c6636, blotch: 0x232c14 },
    pattern: 'bass', mouth: 'large', eye: 0.03, iris: 0xb39a3a,
    fins: { dorsal: [[0.29, 0.7, 0.095, 'bass']], anal: [0.66, 0.82, 0.06], caudal: 'forked', pectoral: true, pelvic: true },
    grip: 'lip',
    variants: {
      smallmouth: { pattern: 'smallmouth', iris: 0xb2402c, colors: { back: 0x4a3f28, mid: 0xa9946a, belly: 0xe9e2cf, line: 0x574a2e, fin: 0x6b5a3c, blotch: 0x4a3f28 } },
      golden: { shiny: true, pattern: 'plain' },
      boss: { pattern: 'bass', colors: { back: 0x232f18, mid: 0x596b3c, belly: 0xb9c398, line: 0x18220e, fin: 0x38472a, blotch: 0x121a0a } },
    },
  },
  sunfish: {
    profile: P.disc, bellyBias: 0.05, lengthScale: 0.78, arch: 2.0,
    colors: { back: 0x2f5a4a, mid: 0x6f9f7c, belly: 0xe0a24a, line: 0x24413a, fin: 0x2c4a45, blotch: 0x17302b },
    pattern: 'sunfish', mouth: 'small', eye: 0.034, iris: 0x8a2f22,
    fins: { dorsal: [[0.22, 0.62, 0.12, 'spiny']], anal: [0.58, 0.8, 0.1], caudal: 'rounded', pectoral: true, pelvic: true },
    grip: 'lip',
    variants: {
      pumpkinseed: { pattern: 'pumpkinseed', colors: { back: 0x3a5a3a, mid: 0x7fae5f, belly: 0xe6a838, line: 0x2f4a2f, fin: 0x3a5a3a, blotch: 0xc23a2a } },
      crappie: { lengthScale: 0.94, pattern: 'crappie', iris: 0x33413c, colors: { back: 0x3a4a44, mid: 0x9aa6a0, belly: 0xe8ece6, line: 0x2c3a34, fin: 0x4a5a52, blotch: 0x23302a } },
      goldfish: { pattern: 'plain', shiny: true, colors: { back: 0xc85a1e, mid: 0xf08a2a, belly: 0xffd9a0, line: 0xa8480e, fin: 0xe07a24, blotch: 0xb0500e } },
    },
  },
  perch: {
    profile: P.perch, bellyBias: 0.08,
    colors: { back: 0x5a6a2a, mid: 0xc9b24a, belly: 0xf0e6c0, line: 0x4a5522, fin: 0xc85a2a, blotch: 0x2f3a16 },
    pattern: 'perch', mouth: 'small', eye: 0.03, iris: 0xc7a83a,
    fins: { dorsal: [[0.27, 0.44, 0.11, 'flag'], [0.5, 0.66, 0.055, 'soft']], anal: [0.66, 0.8, 0.05], caudal: 'forked', pectoral: true, pelvic: true },
    grip: 'lip',
    variants: {
      whiteperch: { pattern: 'plain', shiny: true, colors: { back: 0x4a5560, mid: 0xb7c0c4, belly: 0xf1f2ee, line: 0x3d4750, fin: 0x8a9296, blotch: 0x37414a } },
      walleye: { profile: P.slim, lengthScale: 1.12, pattern: 'walleye', eye: 0.036, iris: 0xd8dcc8, colors: { back: 0x5a5028, mid: 0xc0ac6a, belly: 0xf1ead0, line: 0x4a4020, fin: 0xd8cf9e, blotch: 0x342d14 } },
      sauger: { profile: P.slim, lengthScale: 1.08, pattern: 'walleye', eye: 0.034, iris: 0xcaba7a },
    },
  },
  trout: {
    profile: P.slim, bellyBias: 0.16,
    colors: { back: 0x4a5560, mid: 0xcdd2cf, belly: 0xf2efe6, line: 0xc9788a, fin: 0x8a8f92, blotch: 0x3a4048 },
    pattern: 'rainbow', mouth: 'small', eye: 0.026, iris: 0x6a6250, shiny: true,
    fins: { dorsal: [[0.34, 0.5, 0.055, 'soft']], adipose: 0.82, anal: [0.68, 0.82, 0.05], caudal: 'truncate', pectoral: true, pelvic: true },
    grip: 'cradle',
    variants: {
      brown: { pattern: 'brown', line: 0x8a6a3a, colors: { back: 0x5a4a2e, mid: 0xc2a86a, belly: 0xf0e6c8, line: 0x8a6a3a, fin: 0x8a7048, blotch: 0x3a2c18 } },
      brook: { pattern: 'brook', colors: { back: 0x3a4a3a, mid: 0x8a7a5a, belly: 0xd88a5a, line: 0x2f3a2f, fin: 0xc23a2a, blotch: 0xe8e0c0 } },
      lake: { pattern: 'lake', colors: { back: 0x3a4a4a, mid: 0x8a9a96, belly: 0xdadfd8, line: 0x33413f, fin: 0x6a7a76, blotch: 0xdadfd0 } },
      cutthroat: { pattern: 'rainbow', colors: { back: 0x5a5a3a, mid: 0xc2b27a, belly: 0xe8b06a, line: 0xc23a2a, fin: 0x9a8a5a, blotch: 0x3a3a24 } },
    },
  },
  salmon: {
    profile: P.slim, bellyBias: 0.18, lengthScale: 1.1,
    colors: { back: 0x3a4a52, mid: 0xc8ccc9, belly: 0xeceae2, line: 0x9a6a6a, fin: 0x8a8f8c, blotch: 0x2f3a40 },
    pattern: 'salmon', mouth: 'small', eye: 0.024, iris: 0x5a5248, shiny: true,
    fins: { dorsal: [[0.34, 0.5, 0.055, 'soft']], adipose: 0.82, anal: [0.68, 0.82, 0.05], caudal: 'truncate', pectoral: true, pelvic: true },
    grip: 'cradle',
    variants: {
      king: { kype: true, pattern: 'salmon', colors: { back: 0x2f3a44, mid: 0xa8adaa, belly: 0xdcdad2, line: 0x7a5a5a, fin: 0x5a6a66, blotch: 0x26313a } },
      coho: { pattern: 'salmon', colors: { back: 0x2a5a66, mid: 0xc0ccc8, belly: 0xecebe4, line: 0x9a6a72, fin: 0x7a8a88, blotch: 0x244048 } },
    },
  },
  pike: {
    profile: P.pike, bellyBias: 0.1, lengthScale: 1.14,
    colors: { back: 0x3f5230, mid: 0x8a9a5b, belly: 0xeae4c8, line: 0x33421f, fin: 0x7a5a36, blotch: 0xd8d29a },
    pattern: 'pike', mouth: 'duckbill', eye: 0.022, iris: 0xc2a24a,
    fins: { dorsal: [[0.74, 0.9, 0.06, 'soft']], anal: [0.76, 0.9, 0.055], caudal: 'forked', pectoral: true, pelvic: true },
    grip: 'lip',
    variants: {
      pickerel: { pattern: 'pickerel', lengthScale: 1.1, colors: { back: 0x4a5a34, mid: 0x9aa863, belly: 0xece6c4, line: 0x3a4626, fin: 0x8a6a3c, blotch: 0x2f3a1e } },
      musky: { pattern: 'musky', lengthScale: 1.18, colors: { back: 0x5a5330, mid: 0xb4a86a, belly: 0xece6cc, line: 0x4a4326, fin: 0x8a5a36, blotch: 0x3a3520 } },
    },
  },
  gar: {
    profile: P.gar, bellyBias: 0.06, lengthScale: 1.55,
    colors: { back: 0x3a4630, mid: 0x8a8a68, belly: 0xd8d0a8, line: 0x2f3a26, fin: 0x5a5a3c, blotch: 0x24301c },
    pattern: 'gar', mouth: 'toothy', eye: 0.02, iris: 0xb0a058, beak: 0.3,
    fins: { dorsal: [[0.82, 0.95, 0.05, 'soft']], anal: [0.82, 0.95, 0.045], caudal: 'rounded', pectoral: true, pelvic: true },
    grip: 'hug',
  },
  sturgeon: {
    profile: P.sturgeon, bellyBias: 0.04, lengthScale: 1.25,
    colors: { back: 0x50554e, mid: 0x8a8d84, belly: 0xd2cfc0, line: 0x44483f, fin: 0x62655c, blotch: 0x3a3d36 },
    pattern: 'sturgeon', mouth: 'sucker', eye: 0.014, iris: 0x2a2a26, scutes: true, ventralBarbels: 4,
    fins: { dorsal: [[0.72, 0.88, 0.06, 'soft']], anal: [0.74, 0.86, 0.05], caudal: 'heterocercal', pectoral: true, pelvic: true },
    grip: 'hug',
  },
  catfish: {
    profile: P.catfish, bellyBias: 0.05,
    colors: { back: 0x4b4a44, mid: 0x8a887c, belly: 0xd9d4c2, line: 0x40403a, fin: 0x55534a, blotch: 0x33332e },
    pattern: 'catfish', mouth: 'wide', eye: 0.017, iris: 0x2a2a26, smooth: true, barbels: 8,
    fins: { dorsal: [[0.24, 0.34, 0.055, 'soft']], adipose: 0.72, anal: [0.5, 0.78, 0.06], caudal: 'forked', pectoral: true, pelvic: true },
    grip: 'cradle',
    variants: {
      flathead: { pattern: 'catfish', flathead: true, colors: { back: 0x5a5030, mid: 0x9a8a5a, belly: 0xd8cf9e, line: 0x4a4228, fin: 0x6a5e3c, blotch: 0x3a3420 }, fins: { dorsal: [[0.24, 0.34, 0.055, 'soft']], adipose: 0.72, anal: [0.5, 0.78, 0.06], caudal: 'rounded', pectoral: true, pelvic: true } },
      bullhead: { pattern: 'catfish', colors: { back: 0x35322a, mid: 0x6a6656, belly: 0xc8c2ae, line: 0x2e2b24, fin: 0x44423a, blotch: 0x26241e }, fins: { dorsal: [[0.24, 0.34, 0.055, 'soft']], adipose: 0.72, anal: [0.5, 0.78, 0.06], caudal: 'truncate', pectoral: true, pelvic: true } },
      blue: { pattern: 'catfish', colors: { back: 0x4a5560, mid: 0x9aa4ac, belly: 0xdde2e2, line: 0x414b54, fin: 0x69737a, blotch: 0x37414a } },
    },
  },
  carp: {
    profile: P.carp, bellyBias: 0.1, arch: 1.6,
    colors: { back: 0x5a4a22, mid: 0xb89a52, belly: 0xe8d8a8, line: 0x4a3c1a, fin: 0x8a6a3a, blotch: 0x3a2f16 },
    pattern: 'carp', mouth: 'sucker', eye: 0.02, iris: 0x8a6a2a, barbels: 2, scaleNet: true,
    fins: { dorsal: [[0.3, 0.66, 0.07, 'lowlong']], anal: [0.72, 0.86, 0.055], caudal: 'forked', pectoral: true, pelvic: true },
    grip: 'cradle',
    variants: {
      drum: { pattern: 'plain', shiny: true, mouth: 'small', barbels: 0, scaleNet: false, lengthScale: 0.98, iris: 0x8a8a7a, colors: { back: 0x4a5058, mid: 0xaab0b2, belly: 0xe6e8e2, line: 0x40464e, fin: 0x767c7e, blotch: 0x3a4048 } },
      sucker: { profile: P.slim, pattern: 'plain', shiny: true, mouth: 'sucker', barbels: 0, scaleNet: false, lengthScale: 1.08, colors: { back: 0x4a4238, mid: 0xa89a86, belly: 0xe4ddca, line: 0x40382e, fin: 0x8a7a64, blotch: 0x3a332a } },
    },
  },
  minnow: {
    profile: P.slim, bellyBias: 0.14, lengthScale: 0.92,
    colors: { back: 0x5a5a4a, mid: 0xc2c2b0, belly: 0xecebe0, line: 0x4a4a3c, fin: 0x9a9a86, blotch: 0x3a3a30 },
    pattern: 'minnow', mouth: 'small', eye: 0.03, iris: 0x4a4a3a, shiny: true,
    fins: { dorsal: [[0.4, 0.56, 0.05, 'soft']], anal: [0.66, 0.8, 0.045], caudal: 'forked', pectoral: true, pelvic: true },
    grip: 'cradle',
    variants: {
      goldshiner: { colors: { back: 0x8a7028, mid: 0xd8be5a, belly: 0xf2e6a8, line: 0x7a6020, fin: 0xc0a848, blotch: 0x5a4818 } },
      chub: { lengthScale: 1.0, colors: { back: 0x4a4a3e, mid: 0x9a9482, belly: 0xdcd6c4, line: 0x3a3a30, fin: 0x7a7462, blotch: 0x2e2e26 } },
    },
  },
  stripedbass: {
    profile: P.slim, bellyBias: 0.14, lengthScale: 1.12,
    colors: { back: 0x3a4650, mid: 0xc2c6c6, belly: 0xecece4, line: 0x2f3a42, fin: 0x8a9092, blotch: 0x1f2830 },
    pattern: 'stripes', mouth: 'large', eye: 0.024, iris: 0x9a9a86, shiny: true,
    fins: { dorsal: [[0.28, 0.42, 0.09, 'flag'], [0.48, 0.64, 0.055, 'soft']], anal: [0.66, 0.8, 0.05], caudal: 'forked', pectoral: true, pelvic: true },
    grip: 'lip',
  },
  bowfin: {
    profile: P.pike, bellyBias: 0.1, lengthScale: 1.3,
    colors: { back: 0x3a4630, mid: 0x74795a, belly: 0xc8c4a0, line: 0x2f3826, fin: 0x4a7a5a, blotch: 0x24301e },
    pattern: 'bowfin', mouth: 'wide', eye: 0.018, iris: 0xb08a3a,
    fins: { dorsal: [[0.28, 0.94, 0.045, 'lowlong']], anal: [0.7, 0.9, 0.04], caudal: 'rounded', pectoral: true, pelvic: true },
    grip: 'hug',
  },
  billfish: {
    profile: P.billfish, bellyBias: 0.14, bill: 0.34, lengthScale: 1.12,
    colors: { back: 0x1c3b6b, mid: 0x6f93c0, belly: 0xeef2f5, line: 0x2f6ab0, fin: 0x24427a, blotch: 0x14294a },
    pattern: 'billfish', mouth: 'beak', eye: 0.02, iris: 0x101418, shiny: true,
    fins: { dorsal: [[0.22, 0.5, 0.16, 'sail']], anal: [0.66, 0.8, 0.05], caudal: 'crescent', pectoral: true, pelvic: true },
    grip: 'hug',
  },
  angler: {
    profile: P.angler, bellyBias: 0.22, lengthScale: 0.95,
    colors: { back: 0x3c374e, mid: 0x60586f, belly: 0x7a7088, line: 0x252030, fin: 0x423c50, blotch: 0x201b2c },
    pattern: 'angler', mouth: 'maw', eye: 0.016, iris: 0x3a3048, lure: true, smooth: true,
    fins: { dorsal: [[0.34, 0.55, 0.045, 'soft']], anal: [0.6, 0.78, 0.04], caudal: 'rounded', pectoral: true, pelvic: false },
    grip: 'none',
  },
  oddball: {
    profile: P.pike, bellyBias: 0.12, lengthScale: 1.25,
    colors: { back: 0x4a4038, mid: 0x8a7a6a, belly: 0xc8bca8, line: 0x3a322c, fin: 0x9a3a3a, blotch: 0x2e2620 },
    pattern: 'plain', mouth: 'wide', eye: 0.02, iris: 0x2a2a20, gills: true, legs: true,
    fins: { dorsal: [[0.35, 0.95, 0.028, 'lowlong']], anal: [0.6, 0.95, 0.025], caudal: 'point', pectoral: false, pelvic: false },
    grip: 'hug',
    variants: {
      coelacanth: { legs: false, gills: false, lengthScale: 1.0, mouth: 'large', pattern: 'coelacanth', colors: { back: 0x2f3a4a, mid: 0x5a6a80, belly: 0x9aa8ba, line: 0x28313f, fin: 0x445064, blotch: 0xdadfe4 } },
      serpent: {
        legs: false, gills: false, lengthScale: 1.7, mouth: 'toothy', beak: 0.1, pattern: 'pike', iris: 0xd8b03a,
        colors: { back: 0x2a4028, mid: 0x5a7a3a, belly: 0xbec98a, line: 0x203018, fin: 0x3a5228, blotch: 0xd0d494 },
        fins: { dorsal: [[0.12, 0.96, 0.05, 'lowlong']], anal: [0.6, 0.95, 0.03], caudal: 'point', pectoral: false, pelvic: false },
      },
    },
  },
};

// full species -> { family, variant? }
const SPECIES_MAP = {
  'largemouth-bass': { family: 'bass' }, 'largemouth-bass-small': { family: 'bass' },
  'trophy-largemouth': { family: 'bass' }, 'golden-largemouth': { family: 'bass', variant: 'golden' },
  'old-ironjaw': { family: 'bass', variant: 'boss' },
  'smallmouth-bass': { family: 'bass', variant: 'smallmouth' }, 'smallmouth-bass-small': { family: 'bass', variant: 'smallmouth' },
  'spotted-bass': { family: 'bass', variant: 'smallmouth' },

  bluegill: { family: 'sunfish' }, 'green-sunfish': { family: 'sunfish' }, 'redear-sunfish': { family: 'sunfish' },
  warmouth: { family: 'sunfish' }, 'rock-bass': { family: 'sunfish' }, 'sunfish-hybrid': { family: 'sunfish' },
  pumpkinseed: { family: 'sunfish', variant: 'pumpkinseed' },
  'black-crappie': { family: 'sunfish', variant: 'crappie' }, 'white-crappie': { family: 'sunfish', variant: 'crappie' },
  goldfish: { family: 'sunfish', variant: 'goldfish' },

  'yellow-perch': { family: 'perch' }, 'white-perch': { family: 'perch', variant: 'whiteperch' },
  walleye: { family: 'perch', variant: 'walleye' }, sauger: { family: 'perch', variant: 'sauger' },

  'rainbow-trout-small': { family: 'trout' }, 'brook-trout': { family: 'trout', variant: 'brook' },
  'brown-trout': { family: 'trout', variant: 'brown' }, 'brown-trout-small': { family: 'trout', variant: 'brown' },
  'lake-trout-small': { family: 'trout', variant: 'lake' },
  'coho-salmon': { family: 'salmon', variant: 'coho' }, 'king-salmon': { family: 'salmon', variant: 'king' },

  'northern-pike': { family: 'pike' }, 'chain-pickerel': { family: 'pike', variant: 'pickerel' },
  'chain-pickerel-small': { family: 'pike', variant: 'pickerel' },
  muskellunge: { family: 'pike', variant: 'musky' }, 'giant-muskie': { family: 'pike', variant: 'musky' },
  'neon-mutant-muskie': { family: 'pike', variant: 'musky' },

  'longnose-gar': { family: 'gar' }, 'alligator-gar': { family: 'gar' },
  'lake-sturgeon-small': { family: 'sturgeon' }, 'white-sturgeon': { family: 'sturgeon' },

  'brown-bullhead': { family: 'catfish', variant: 'bullhead' }, 'yellow-bullhead': { family: 'catfish', variant: 'bullhead' },
  'channel-catfish-small': { family: 'catfish' }, 'channel-catfish': { family: 'catfish' },
  'flathead-catfish-small': { family: 'catfish', variant: 'flathead' }, 'flathead-catfish': { family: 'catfish', variant: 'flathead' },
  'blue-catfish': { family: 'catfish', variant: 'blue' }, 'monster-blue-catfish': { family: 'catfish', variant: 'blue' },
  'lake-titan-catfish': { family: 'catfish', variant: 'blue' },

  'common-carp-small': { family: 'carp' }, 'common-carp': { family: 'carp' },
  'freshwater-drum-small': { family: 'carp', variant: 'drum' }, 'freshwater-drum': { family: 'carp', variant: 'drum' },
  'white-sucker': { family: 'carp', variant: 'sucker' },

  'creek-chub': { family: 'minnow', variant: 'chub' }, fallfish: { family: 'minnow', variant: 'chub' },
  'golden-shiner': { family: 'minnow', variant: 'goldshiner' }, 'common-shiner': { family: 'minnow' },

  'striped-bass': { family: 'stripedbass' }, 'striped-bass-small': { family: 'stripedbass' },

  'bowfin-small': { family: 'bowfin' },
  'brindle-bruiser-tuna': { family: 'billfish' },
  'abyssal-angler': { family: 'angler' },
  'bog-serpent': { family: 'oddball', variant: 'serpent' },

  mudpuppy: { family: 'oddball' },
  coelacanth: { family: 'oddball', variant: 'coelacanth' },
};

const SHAPE_FALLBACK = { torpedo: 'bass', panfish: 'sunfish', eel: 'pike', catfish: 'catfish' };

function resolveSpec(c) {
  const m = SPECIES_MAP[c.speciesId] || { family: SHAPE_FALLBACK[c.shape] || 'bass' };
  const fam = FAMILY[m.family] || FAMILY.bass;
  const v = (m.variant && fam.variants?.[m.variant]) || {};
  const colors = { ...fam.colors, ...(v.colors || {}) };
  return {
    ...fam, ...v, colors,
    tint: c.tint,
    emissive: (c.emissive || 0) * (v.emissiveBoost ? 1.4 : 1),
    speciesId: c.speciesId,
  };
}

// ---------------------------------------------------------------------------
// value noise
// ---------------------------------------------------------------------------
function hash1(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash1(i) * (1 - u) + hash1(i + 1) * u;
}
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash1(xi + yi * 57), b = hash1(xi + 1 + yi * 57);
  const cc = hash1(xi + (yi + 1) * 57), d = hash1(xi + 1 + (yi + 1) * 57);
  return (a * (1 - u) + b * u) * (1 - v) + (cc * (1 - u) + d * u) * v;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerpC = (a, b, t) => a.clone().lerp(b, clamp01(t));

// ---------------------------------------------------------------------------
// body
// ---------------------------------------------------------------------------
// profile heights/widths are stored as a fraction of body length; return them
// already scaled to world units so every call site stays in one space.
function sampleProfile(profile, t) {
  let h, w;
  for (let i = 0; i < profile.length - 1; i++) {
    const [t0, h0, w0] = profile[i];
    const [t1, h1, w1] = profile[i + 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0 || 1);
      h = h0 + (h1 - h0) * k;
      w = w0 + (w1 - w0) * k;
      break;
    }
  }
  if (h === undefined) {
    const last = profile[profile.length - 1];
    h = last[1];
    w = last[2];
  }
  return [h * BODY_LEN, w * BODY_LEN];
}

function buildFish(spec) {
  const grp = new THREE.Group();
  const L = BODY_LEN;
  const cols = { ...spec.colors };

  const C = {
    back: new THREE.Color(cols.back),
    mid: new THREE.Color(cols.mid),
    belly: new THREE.Color(cols.belly),
    line: new THREE.Color(cols.line),
    blotch: new THREE.Color(cols.blotch),
  };
  if (spec.tint) {
    const tc = new THREE.Color(spec.tint);
    C.mid.lerp(tc, 0.5);
    C.back.lerp(tc, 0.42);
    C.belly.lerp(tc, 0.12);
  }

  const positions = [];
  const colors = [];
  const indices = [];
  const spineY = (t) => Math.sin(t * Math.PI) * 0.03 - 0.02;

  const ringIndex = [];
  for (let i = 0; i < RINGS; i++) {
    const t = i / (RINGS - 1);
    const [hh, hw] = sampleProfile(spec.profile, t);
    const cx = (t - 0.5) * L;
    const cy = spineY(t);
    ringIndex.push(positions.length / 3);

    for (let j = 0; j < RAD; j++) {
      const a = (j / RAD) * Math.PI * 2;
      const sy = Math.sin(a);
      const sz = Math.cos(a);
      // belly fuller than back
      const yScale = sy < 0 ? 1 + spec.bellyBias : 1;
      const y = cy + sy * hh * yScale;
      const z = sz * hw;
      positions.push(cx, y, z);

      // ---- colour ----
      const up = clamp01(sy * 0.5 + 0.5); // 0 belly .. 1 back
      let col = up < 0.5 ? lerpC(C.belly, C.mid, up * 2) : lerpC(C.mid, C.back, (up - 0.5) * 2);

      // lateral line
      if (Math.abs(sy) < 0.14 && t > 0.06 && t < 0.96) col = lerpC(col, C.line, 0.45 * (1 - Math.abs(sy) / 0.14));
      // operculum crease
      if (t > 0.14 && t < 0.17) col = col.clone().multiplyScalar(0.78);
      // jaw / mouth line along the lower front of the head
      if (t < 0.16 && sy < 0.15 && sy > -0.55) {
        const jaw = (1 - t / 0.16) * (1 - Math.abs(sy + 0.2) / 0.5);
        if (jaw > 0.15) col = lerpC(col, new THREE.Color(0x14100a), jaw * 0.8);
      }

      col = applyPattern(spec.pattern, t, sy, a, col, C, spec);
      colors.push(col.r, col.g, col.b);
    }
  }

  // stitch rings
  for (let i = 0; i < RINGS - 1; i++) {
    const r0 = ringIndex[i], r1 = ringIndex[i + 1];
    for (let j = 0; j < RAD; j++) {
      const jn = (j + 1) % RAD;
      indices.push(r0 + j, r1 + j, r0 + jn);
      indices.push(r0 + jn, r1 + j, r1 + jn);
    }
  }
  // nose cap
  const noseC = positions.length / 3;
  positions.push(-L * 0.5 - 0.02, spineY(0), 0);
  colors.push(C.mid.r, C.mid.g, C.mid.b);
  for (let j = 0; j < RAD; j++) indices.push(noseC, ringIndex[0] + ((j + 1) % RAD), ringIndex[0] + j);
  // tail cap
  const tailC = positions.length / 3;
  positions.push(L * 0.5, spineY(1), 0);
  colors.push(C.back.r, C.back.g, C.back.b);
  const rl = ringIndex[RINGS - 1];
  for (let j = 0; j < RAD; j++) indices.push(tailC, rl + j, rl + ((j + 1) % RAD));

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const bodyMat = psxMaterial({
    vertexColors: true,
    roughness: spec.smooth ? 0.42 : spec.shiny ? 0.5 : 0.72,
    metalness: spec.shiny ? 0.16 : 0.04,
    emissive: spec.emissive ? new THREE.Color(spec.tint || 0xffffff) : 0x000000,
    emissiveIntensity: spec.emissive || 0,
  });
  const body = new THREE.Mesh(geo, bodyMat);
  grp.add(body);

  addFins(grp, spec, C);
  addEyes(grp, spec, L);
  if (spec.bill) addBill(grp, spec, L);
  if (spec.beak) addBeak(grp, spec, L);
  if (spec.barbels || spec.ventralBarbels) addBarbels(grp, spec, L);
  addMouth(grp, spec, L);
  if (spec.scutes) addScutes(grp, spec, L);
  if (spec.kype) addKype(grp, spec, L);
  if (spec.gills) addGills(grp, spec, L);
  if (spec.legs) addLegs(grp, spec, L);
  if (spec.lure) addLure(grp, spec, L);

  // geometry built nose-at-minus-X; flip so forward is +X downstream
  grp.rotation.y = Math.PI;
  // stubby (panfish) vs stretched (eel, billfish) without re-threading L
  if (spec.lengthScale) grp.scale.x = spec.lengthScale;

  grp.userData = {
    grip: spec.grip,
    bodyLen: L,
    // nose/lower-lip, in the group's own local space (pre the Y-flip below the
    // geometry was built nose-at-minus-X, so the mouth point is there too)
    mouth: new THREE.Vector3(-L * 0.5 + 0.05, spineY(0) - 0.03, 0),
  };
  return grp;
}

const _tmp = new THREE.Color();
const CC = (hex) => _tmp.setHex(hex);

// discrete round spots on a jittered grid — returns 0 (outside) .. 1 (spot centre)
function spots(t, up, cols, size) {
  const gx = t * cols;
  const gy = up * cols * 0.55;
  const cx = Math.floor(gx);
  const cy = Math.floor(gy);
  let best = 0;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      const ix = cx + dx;
      const iy = cy + dy;
      const jx = ix + 0.25 + hash1(ix * 3.1 + iy * 7.7) * 0.5;
      const jy = iy + 0.25 + hash1(ix * 5.3 + iy * 2.9) * 0.5;
      const d = Math.sqrt(((gx - jx) / size) ** 2 + ((gy - jy) / size) ** 2);
      if (d < 1) best = Math.max(best, 1 - d);
    }
  return best;
}

function applyPattern(kind, t, sy, a, col, C, spec) {
  const up = sy * 0.5 + 0.5; // 0 belly .. 1 back
  const flank = 1 - Math.abs(sy); // 1 at the lateral line
  const dim = (k) => col.clone().multiplyScalar(k);

  switch (kind) {
    case 'bass':
      if (Math.abs(sy) < 0.4 && t > 0.12 && t < 0.9) {
        const f = noise1(t * 8 + 3.2);
        if (f > 0.52) col = lerpC(col, C.blotch, (f - 0.52) * 2.1 * (1 - Math.abs(sy) / 0.4));
      }
      if (up > 0.55 && noise2(t * 26, (a / Math.PI) * 6) > 0.62) col = dim(0.9);
      return col;

    case 'smallmouth':
      if (up > 0.14 && Math.abs(Math.sin((t - 0.05) * Math.PI * 9)) > 0.5)
        col = lerpC(col, C.blotch, 0.35 * clamp01((up - 0.14) / 0.6));
      if (noise2(t * 22, up * 9) > 0.66) col = dim(0.9);
      return col;

    case 'sunfish':
      if (up > 0.25 && Math.sin(t * Math.PI * 8) > 0.4) col = dim(0.86);
      if (t > 0.12 && t < 0.2 && up > 0.55 && up < 0.82) col = lerpC(col, C.blotch, 0.85); // ear flap
      if (t < 0.4 && up < 0.42) col = lerpC(col, CC(0xd9863a), (0.42 - up) * (0.4 - t) * 3.5); // breast
      return col;

    case 'pumpkinseed':
      if (up > 0.2 && up < 0.88 && noise2(t * 22, up * 10) > 0.6) col = lerpC(col, CC(0xe07a2a), 0.55);
      if (t > 0.12 && t < 0.19 && up > 0.55 && up < 0.8) col = lerpC(col, CC(0xc63421), 0.9); // red ear spot
      if (t < 0.4 && up < 0.4) col = lerpC(col, CC(0xe6a838), (0.4 - up) * 2);
      return col;

    case 'crappie': {
      const d = noise2(t * 14, up * 7) + noise2(t * 30, up * 15) * 0.5;
      if (d > 0.9 - up * 0.22) col = lerpC(col, C.blotch, 0.55);
      return col;
    }

    case 'perch': {
      // 7 crisp dark bars from the back down past the flank
      const b = ((t - 0.05) * 7) % 1;
      if (b > 0 && b < 0.44 && up > 0.08) col = lerpC(col, C.blotch, 0.8 * clamp01((up - 0.08) / 0.55));
      return col;
    }

    case 'walleye':
      if (up > 0.25) {
        const m = noise2(t * 5.5, up * 2.5);
        if (m > 0.62) col = lerpC(col, C.blotch, 0.5); // broad dark saddles
      }
      if (t > 0.88 && sy < -0.2) col = lerpC(col, CC(0xf0ece0), 0.7); // white lower-tail tip
      return col;

    case 'rainbow': {
      if (flank > 0.78 && t > 0.05) col = lerpC(col, CC(0xd06a80), 0.6 * (flank - 0.78) * 4.5);
      const s = spots(t, up, 46, 0.42);
      if (s > 0.15 && up > 0.28) col = lerpC(col, CC(0x101014), s * 0.85);
      return col;
    }

    case 'brown': {
      const dark = spots(t, up, 20, 0.5);
      if (dark > 0.2 && up > 0.4) col = lerpC(col, C.blotch, dark * 0.75);
      const red = spots(t + 3.4, up, 16, 0.55);
      if (red > 0.35 && up > 0.15 && up < 0.62) {
        col = lerpC(col, CC(0xf0e6c0), (red - 0.35) * 0.8); // pale halo
        if (red > 0.6) col = lerpC(col, CC(0xc23a2a), (red - 0.6) * 2);
      }
      return col;
    }

    case 'brook': {
      if (up > 0.55) {
        const v = Math.sin(t * 44 + Math.sin(t * 11) * 3.5);
        if (v > 0.25) col = lerpC(col, C.blotch, 0.55); // pale vermiculation
      }
      const red = spots(t, up, 18, 0.42);
      if (red > 0.3 && up > 0.18 && up < 0.58) {
        col = lerpC(col, CC(0x6a86c8), (red - 0.3) * 0.5); // blue halo
        if (red > 0.55) col = lerpC(col, CC(0xdc3a3a), (red - 0.55) * 2.4);
      }
      if (up < 0.3) col = lerpC(col, CC(0xd8703a), (0.3 - up) * 1.6);
      return col;
    }

    case 'lake': {
      const s = spots(t, up, 26, 0.55);
      if (s > 0.12) col = lerpC(col, CC(0xdfe4d8), s * 0.7);
      return col;
    }

    case 'salmon': {
      const s = spots(t, up, 44, 0.4);
      if (s > 0.2 && (up > 0.42 || t > 0.86)) col = lerpC(col, CC(0x101014), s * 0.8);
      return col;
    }

    case 'pike': {
      // rows of pale bean-shaped spots on dark green
      const s = spots(t, up, 15, 0.6);
      if (s > 0.14 && up > 0.12) col = lerpC(col, C.blotch, s * 0.85);
      return col;
    }

    case 'pickerel': {
      const cx = Math.sin(t * Math.PI * 15);
      const cy = Math.sin(up * Math.PI * 4.5 + t * 22);
      if (Math.abs(cx * cy) > 0.5 && up > 0.12) col = lerpC(col, C.blotch, 0.55);
      return col;
    }

    case 'musky': {
      // dark vertical bars/blotches on a light body
      if (up > 0.18) {
        const bar = Math.abs(Math.sin((t - 0.04) * Math.PI * 10));
        if (bar > 0.5) col = lerpC(col, C.blotch, (bar - 0.5) * 1.4 * clamp01((up - 0.18) / 0.5));
      }
      return col;
    }

    case 'gar': {
      const s = spots(t, up, 22, 0.55);
      if (s > 0.2 && t > 0.35) col = lerpC(col, C.blotch, s * 0.9);
      return col;
    }

    case 'sturgeon':
      return dim(0.95 + noise2(t * 5, up * 2.5) * 0.1);

    case 'catfish':
      return dim(0.9 + noise2(t * 10, up * 4) * 0.2);

    case 'angler': {
      col = dim(0.82 + noise2(t * 7, up * 4) * 0.4); // lumpy dark skin
      const w = spots(t, up, 11, 0.5);
      if (w > 0.35) col = lerpC(col, CC(0x8f86a4), (w - 0.35) * 0.55); // pale skin nodules
      return col;
    }

    case 'carp': {
      // overlapping diamond scales
      const row = Math.floor(t * 30);
      const sx = t * 30;
      const sy = (up + (row % 2) * 0.5) * 15;
      const ex = Math.abs((sx % 1) - 0.5);
      const ey = Math.abs((sy % 1) - 0.5);
      if (ex > 0.36 || ey > 0.36) col = dim(0.78);
      else if (ex < 0.14 && ey < 0.14) col = lerpC(col, CC(0xffffff), 0.14);
      return col;
    }

    case 'minnow':
      if (flank > 0.86 && t > 0.1) col = lerpC(col, C.blotch, 0.5 * (flank - 0.86) * 7);
      if (up > 0.55) col = lerpC(col, C.back, 0.3);
      return col;

    case 'stripes': {
      const band = Math.sin(up * Math.PI * 13 - 1.1);
      if (band > 0.5 && up > 0.12 && up < 0.92 && t > 0.14) col = lerpC(col, C.blotch, (band - 0.5) * 1.9);
      return col;
    }

    case 'bowfin': {
      col = dim(0.9 + noise2(t * 8, up * 4) * 0.2);
      const d = Math.hypot((t - 0.9) * 6, (up - 0.72) * 4.2);
      if (d < 0.45) col = CC(0x0a0a08).clone();
      else if (d < 0.75) col = lerpC(col, CC(0xd88a3a), 0.75);
      return col;
    }

    case 'billfish':
      if (up > 0.4 && Math.sin(t * Math.PI * 14) > 0.4) col = lerpC(col, CC(0x9fc0e6), 0.3);
      return col;

    case 'coelacanth':
      if (noise2(t * 10 + 2, up * 6) > 0.62) col = lerpC(col, CC(0xdfe4e8), 0.6);
      return col;

    default:
      return col;
  }
}

// ---------------------------------------------------------------------------
// fins
// ---------------------------------------------------------------------------
function finMaterial(color, emissive, ei) {
  return psxMaterial({
    color,
    emissive: emissive || 0x000000,
    emissiveIntensity: ei || 0,
    transparent: true,
    opacity: 0.94,
    side: THREE.DoubleSide,
    roughness: 0.6,
  });
}

function addFins(grp, spec, C) {
  const L = BODY_LEN;
  const finCol = new THREE.Color(spec.colors.fin).lerp(new THREE.Color(0xffffff), 0.18);
  if (spec.tint) finCol.lerp(new THREE.Color(spec.tint), 0.25);
  const mat = finMaterial(finCol, spec.emissive ? spec.tint : 0, spec.emissive * 0.6);

  const f = spec.fins;

  for (const d of f.dorsal || []) grp.add(ridgeFin(spec, d, +1, mat));
  if (f.anal) grp.add(ridgeFin(spec, [...f.anal, 'soft'], -1, mat));
  if (f.adipose) {
    const [hh] = sampleProfile(spec.profile, f.adipose);
    const nub = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 5), mat);
    nub.position.set((f.adipose - 0.5) * L, hh + 0.03, 0);
    nub.rotation.z = -0.3;
    grp.add(nub);
  }
  grp.add(caudalFin(spec, f.caudal, mat));

  if (f.pectoral) {
    for (const s of [1, -1]) {
      const pec = flatFin(0.5, 0.34, mat);
      const [hh, hw] = sampleProfile(spec.profile, 0.24);
      pec.position.set((0.24 - 0.5) * L, -hh * 0.15, s * hw * 0.92);
      pec.rotation.set(0.3, s * 0.5, s * -0.5);
      grp.add(pec);
    }
  }
  if (f.pelvic) {
    for (const s of [1, -1]) {
      const pv = flatFin(0.4, 0.26, mat);
      const [hh, hw] = sampleProfile(spec.profile, 0.38);
      pv.position.set((0.38 - 0.5) * L, -hh * (1 + spec.bellyBias) * 0.82, s * hw * 0.55);
      pv.rotation.set(-0.5, s * 0.3, s * 0.4);
      grp.add(pv);
    }
  }
}

// a fin that runs along the top (dir +1) or bottom (dir -1) of the body
function ridgeFin(spec, def, dir, mat) {
  const [t0, t1, height, style] = def;
  const L = BODY_LEN;
  const H = height * L;
  const seg = 20;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = t0 + ((t1 - t0) * i) / seg;
    const lt = i / seg;
    const [hh] = sampleProfile(spec.profile, t);
    const baseY = dir * hh * (dir < 0 ? 1 + spec.bellyBias : 1) * 0.98;
    const cx = (t - 0.5) * L;

    let h;
    if (style === 'bass') {
      // spiny front (zigzag), notch, rounded soft rear
      if (lt < 0.52) h = H * (0.55 + 0.45 * Math.abs(Math.sin(lt * 20))) * (0.45 + lt);
      else if (lt < 0.6) h = H * 0.22;
      else h = H * Math.sin(((lt - 0.6) / 0.4) * Math.PI) * 1.15;
    } else if (style === 'spiny') {
      h = H * (lt < 0.5 ? 0.5 + lt : Math.sin((1 - lt) * 3));
    } else if (style === 'flag') {
      // tall triangular first dorsal, peak near the front
      h = H * (lt < 0.28 ? 0.3 + lt * 2.5 : Math.max(0.08, (1 - lt) * 1.25));
    } else if (style === 'lowlong') {
      h = H * (0.55 + 0.45 * Math.sin(Math.max(0.05, lt) * Math.PI));
    } else if (style === 'sail') {
      h = H * Math.sin(lt * Math.PI) * 1.1;
    } else if (style === 'ribbon') {
      h = H * (0.6 + 0.4 * Math.sin(lt * Math.PI));
    } else {
      h = H * Math.sin(Math.max(0.05, lt * Math.PI));
    }

    const rake = (dir > 0 ? -0.18 : -0.12) * lt;
    pos.push(cx, baseY, 0);
    pos.push(cx + rake, baseY + dir * h, 0);
  }
  for (let i = 0; i < seg; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

function caudalFin(spec, style, mat) {
  const L = BODY_LEN;
  const [hh] = sampleProfile(spec.profile, 0.7);
  const s = hh * 0.9 + 0.015 * L;
  const span = 0.12 * L; // fin length
  let o;
  if (style === 'forked') o = [[0, 0], [span * 0.6, s * 1.7], [span, s * 1.0], [span * 0.55, 0], [span, -s * 1.0], [span * 0.6, -s * 1.7]];
  else if (style === 'crescent') o = [[0, 0], [span, s * 2.6], [span * 1.4, s * 1.1], [span * 0.5, 0], [span * 1.4, -s * 1.1], [span, -s * 2.6]];
  else if (style === 'rounded') o = [[0, 0], [span * 0.5, s * 1.3], [span * 0.95, s * 0.8], [span * 1.05, 0], [span * 0.95, -s * 0.8], [span * 0.5, -s * 1.3]];
  else if (style === 'point') o = [[0, 0], [span * 0.5, s * 0.5], [span * 1.6, 0], [span * 0.5, -s * 0.5]];
  else if (style === 'heterocercal')
    o = [[0, -s * 0.2], [span * 0.7, s * 2.6], [span * 1.7, s * 1.9], [span * 1.9, s * 0.7], [span * 0.6, -s * 0.1], [span * 1.0, -s * 1.0], [span * 0.75, -s * 1.35]];
  else o = [[0, s * 1.25], [span, s * 1.15], [span, -s * 1.15], [0, -s * 1.25]]; // truncate

  const shape = new THREE.Shape();
  shape.moveTo(o[0][0], o[0][1]);
  for (let i = 1; i < o.length; i++) shape.lineTo(o[i][0], o[i][1]);
  shape.closePath();
  const fin = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
  fin.position.set(L * 0.5 - 0.06, -0.02, 0); // tuck into the peduncle
  return fin;
}

function flatFin(len, wid, mat) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(-len * 0.5, wid, -len, wid * 0.2);
  shape.quadraticCurveTo(-len * 0.7, -wid * 0.3, 0, 0);
  return new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
}

function addEyes(grp, spec, L) {
  const [hh, hw] = sampleProfile(spec.profile, 0.1);
  const R = spec.eye * L;
  for (const s of [1, -1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(R, 10, 8), psxMaterial({ color: 0xf3f1e6, roughness: 0.5 }));
    white.position.set((0.1 - 0.5) * L, hh * 0.42, s * hw * 0.8);
    grp.add(white);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(R * 0.64, 8, 6), psxMaterial({ color: spec.iris, roughness: 0.4 }));
    iris.position.set((0.1 - 0.5) * L - 0.01, hh * 0.42, s * (hw * 0.8 + R * 0.5));
    grp.add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(R * 0.32, 6, 5), psxMaterial({ color: 0x050505, roughness: 0.3 }));
    pupil.position.set((0.1 - 0.5) * L - 0.015, hh * 0.42, s * (hw * 0.8 + R * 0.72));
    grp.add(pupil);
  }
}

function addBill(grp, spec, L) {
  const len = spec.bill * L;
  const bill = new THREE.Mesh(
    new THREE.ConeGeometry(0.06, len, 6),
    psxMaterial({ color: 0x11202f, roughness: 0.6 }),
  );
  bill.rotation.z = -Math.PI / 2;
  bill.position.set(-L * 0.5 - len / 2, -0.02, 0);
  grp.add(bill);
}

function addBarbels(grp, spec, L) {
  const col = new THREE.Color(spec.colors.mid).multiplyScalar(0.7);
  const mat = psxMaterial({ color: col, roughness: 0.75 });
  const [hh, hw] = sampleProfile(spec.profile, 0.06);
  const nose = -L * 0.5;

  if (spec.ventralBarbels) {
    // a transverse row of short barbels under the snout (sturgeon)
    for (let k = 0; k < spec.ventralBarbels; k++) {
      const s = (k - (spec.ventralBarbels - 1) / 2) / spec.ventralBarbels;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.4, 4), mat);
      b.geometry.translate(0, -0.2, 0);
      b.position.set(nose + hh * 1.2, -hh * 0.7, s * hw * 1.5);
      b.rotation.x = 0.2;
      grp.add(b);
    }
    return;
  }

  for (let k = 0; k < spec.barbels; k++) {
    const s = k % 2 ? 1 : -1;
    const upper = spec.barbels <= 2 ? false : k < 2;
    const len = upper ? 0.9 : spec.barbels <= 2 ? 0.6 : 0.55;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.04, len, 4), mat);
    b.geometry.translate(0, -len / 2, 0);
    b.position.set(nose - 0.05, hh * (upper ? 0.35 : -0.25), s * hw * 0.6);
    b.rotation.z = (upper ? 0.4 : 0.75) + (Math.random() - 0.5) * 0.25;
    b.rotation.y = s * 0.7;
    grp.add(b);
  }
}

function addBeak(grp, spec, L) {
  const len = spec.beak * L;
  const [hh, hw] = sampleProfile(spec.profile, 0.02);
  const jawMat = psxMaterial({ color: new THREE.Color(spec.colors.mid).multiplyScalar(0.78), roughness: 0.7 });
  const nose = -L * 0.5;
  for (const [dy, sc] of [[hh * 0.28, 1], [-hh * 0.28, 0.85]]) {
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(len, hh * 0.5 * sc, hw * 1.2), jawMat);
    jaw.position.set(nose - len / 2, dy, 0);
    grp.add(jaw);
  }
  const tm = psxMaterial({ color: 0xece6d0, roughness: 0.4 });
  for (let k = 0; k < 9; k++) {
    const x = nose - len * (0.12 + k * 0.095);
    for (const s of [1, -1]) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.06, 3), tm);
      tooth.rotation.x = Math.PI;
      tooth.position.set(x, -hh * 0.02, s * hw * 0.35);
      grp.add(tooth);
    }
  }
}

function addScutes(grp, spec, L) {
  const mat = psxMaterial({ color: 0xcecab6, roughness: 0.4, emissive: 0x2a2820, emissiveIntensity: 0.3 });
  const rows = [
    [Math.PI / 2, 13, 0.09],
    [0.75, 10, 0.06],
    [-0.75, 10, 0.06],
  ];
  for (const [ang, n, r] of rows) {
    for (let k = 0; k < n; k++) {
      const t = 0.12 + (0.8 * k) / (n - 1);
      const [hh, hw] = sampleProfile(spec.profile, t);
      const sc = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.8, 4), mat);
      sc.position.set((t - 0.5) * L, Math.sin(ang) * hh, Math.cos(ang) * hw);
      sc.rotation.set(Math.random() * 0.3, 0, Math.PI / 2 - ang);
      grp.add(sc);
    }
  }
}

function addKype(grp, spec, L) {
  const [hh, hw] = sampleProfile(spec.profile, 0.04);
  const hook = new THREE.Mesh(
    new THREE.ConeGeometry(hw * 0.55, hh * 2.4, 6),
    psxMaterial({ color: 0x3a2c28, roughness: 0.7 }),
  );
  hook.rotation.z = 0.55;
  hook.position.set(-L * 0.5 + hh * 0.4, -hh * 0.95, 0);
  grp.add(hook);
}

function addGills(grp, spec, L) {
  const mat = psxMaterial({ color: 0xc03a3a, roughness: 0.85 });
  const [hh, hw] = sampleProfile(spec.profile, 0.16);
  for (const s of [1, -1])
    for (let k = 0; k < 3; k++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2 + k * 0.03, 4), mat);
      tuft.position.set((0.16 - 0.5) * L, hh * (0.55 - k * 0.32), s * hw);
      tuft.rotation.z = s * (0.6 + k * 0.25);
      grp.add(tuft);
    }
}

function addLegs(grp, spec, L) {
  const mat = psxMaterial({ color: 0x8a7a6a, roughness: 0.85 });
  for (const [t, s] of [[0.24, 1], [0.24, -1], [0.56, 1], [0.56, -1]]) {
    const [hh, hw] = sampleProfile(spec.profile, t);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.05, 0.42, 5), mat);
    leg.geometry.translate(0, -0.21, 0);
    leg.position.set((t - 0.5) * L, -hh * 0.5, s * hw * 0.85);
    leg.rotation.z = s * -0.5;
    grp.add(leg);
  }
}

function addMouth(grp, spec, L) {
  const [hh, hw] = sampleProfile(spec.profile, 0.05);
  const m = spec.mouth;
  const dark = psxMaterial({ color: 0x1a0f0d, roughness: 0.95 });

  if (m === 'sucker') {
    // small down-turned mouth on the underside of the snout
    const ring = new THREE.Mesh(new THREE.TorusGeometry(hh * 0.5, hh * 0.18, 5, 9), psxMaterial({ color: new THREE.Color(spec.colors.belly).multiplyScalar(0.7), roughness: 0.8 }));
    ring.rotation.x = 0.9;
    ring.position.set(-L * 0.5 + hh * 1.1, -hh * 0.75, 0);
    grp.add(ring);
    return;
  }

  if (m === 'maw') {
    // huge gaping cavity ringed with needle teeth (anglerfish)
    const [hd, wd] = sampleProfile(spec.profile, 0.13);
    const cav = new THREE.Mesh(new THREE.SphereGeometry(hd * 1.15, 10, 8), psxMaterial({ color: 0x090508, roughness: 1 }));
    cav.position.set(-L * 0.5 + hd * 0.55, -hd * 0.1, 0);
    cav.scale.set(1.15, 1, 0.9);
    grp.add(cav);
    const tm = psxMaterial({ color: 0xdcd6c0, roughness: 0.4 });
    for (let k = 0; k < 13; k++) {
      const ang = (k / 13) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.018 * L, 0.14 * L, 3), tm);
      tooth.position.set(-L * 0.5 + hd * 0.85, Math.sin(ang) * hd - hd * 0.1, Math.cos(ang) * wd);
      tooth.lookAt(new THREE.Vector3(-L * 0.7, tooth.position.y * 1.4, tooth.position.z * 1.4));
      grp.add(tooth);
    }
    return;
  }

  const big = m === 'large';
  // recessed gape just inside the snout
  const inner = new THREE.Mesh(new THREE.ConeGeometry(hh * (big ? 0.95 : 0.8), hh * (big ? 1.7 : 1.4), 7), dark);
  inner.rotation.z = -Math.PI / 2;
  inner.position.set(-L * 0.5 + hh * 0.7, -hh * 0.12, 0);
  inner.scale.set(1, 1, m === 'duckbill' ? 1.1 : 0.85);
  grp.add(inner);

  if (m === 'duckbill') {
    // flatten the top of the snout with a dark plate
    const plate = new THREE.Mesh(new THREE.BoxGeometry(hh * 3, hh * 0.15, hw * 1.6), psxMaterial({ color: new THREE.Color(spec.colors.back).multiplyScalar(0.8), roughness: 0.7 }));
    plate.position.set(-L * 0.5 + hh * 1.4, hh * 0.35, 0);
    grp.add(plate);
  }

  // jaw line — a thin dark seam from the snout back toward the eye
  const seamLen = (big ? 0.18 : 0.12) * L;
  const seam = new THREE.Mesh(
    new THREE.CylinderGeometry(hh * 0.06, hh * 0.06, seamLen, 4),
    dark,
  );
  seam.rotation.z = Math.PI / 2 - 0.18;
  for (const sgn of [1, -1]) {
    const c = seam.clone();
    c.position.set(-L * 0.5 + seamLen * 0.5, -hh * 0.28, sgn * hw * 0.5);
    grp.add(c);
  }
}

function addLure(grp, spec, L) {
  const [hh] = sampleProfile(spec.profile, 0.18);
  // arches up off the forehead and dangles forward, toward the camera
  const bx = -L * 0.5 + hh * 0.9;
  const stalk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012 * L, 0.022 * L, hh * 2.2, 4),
    psxMaterial({ color: 0x14101c, roughness: 0.7 }),
  );
  stalk.geometry.translate(0, hh * 1.1, 0);
  stalk.position.set(bx, hh * 0.7, 0);
  stalk.rotation.set(-0.9, 0, -0.5);
  grp.add(stalk);
  const bulbPos = new THREE.Vector3(bx - hh * 0.4, hh * 1.7, hh * 1.9);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(hh * 0.62, 9, 7),
    psxMaterial({ color: 0xf2f6c8, emissive: 0xdcf58a, emissiveIntensity: 2.6, roughness: 0.2 }),
  );
  bulb.position.copy(bulbPos);
  grp.add(bulb);
  grp.add(new THREE.Mesh(
    new THREE.SphereGeometry(hh * 1.0, 8, 6),
    psxMaterial({ color: 0xdcf58a, transparent: true, opacity: 0.22, emissive: 0xdcf58a, emissiveIntensity: 1.2 }),
  ).translateX(bulbPos.x).translateY(bulbPos.y).translateZ(bulbPos.z));
  const glow = new THREE.PointLight(0xd4f584, 3.4, hh * 12);
  glow.position.copy(bulbPos);
  grp.add(glow);
}

// ---------------------------------------------------------------------------
// squid / kraken
// ---------------------------------------------------------------------------
function tubeMesh(profile, mat, L, x0, x1, rings = 20, rad = 13) {
  const pos = [];
  const idx = [];
  const ri = [];
  const rAt = (u) => {
    for (let k = 0; k < profile.length - 1; k++) {
      if (u <= profile[k + 1][0]) {
        const kk = (u - profile[k][0]) / (profile[k + 1][0] - profile[k][0] || 1);
        return profile[k][1] + (profile[k + 1][1] - profile[k][1]) * kk;
      }
    }
    return profile[profile.length - 1][1];
  };
  for (let i = 0; i < rings; i++) {
    const u = i / (rings - 1);
    const x = x0 + (x1 - x0) * u;
    const r = rAt(u) * L;
    ri.push(pos.length / 3);
    for (let j = 0; j < rad; j++) {
      const a = (j / rad) * Math.PI * 2;
      pos.push(x, Math.sin(a) * r, Math.cos(a) * r);
    }
  }
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < rad; j++) {
      const jn = (j + 1) % rad;
      idx.push(ri[i] + j, ri[i + 1] + j, ri[i] + jn, ri[i] + jn, ri[i + 1] + j, ri[i + 1] + jn);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

function ball(r, color, x, y, z, emissive, ei) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 9, 7),
    psxMaterial({ color, emissive: emissive || 0x000000, emissiveIntensity: ei || 0, roughness: 0.45 }),
  );
  m.position.set(x, y, z);
  return m;
}

function buildSquid(c) {
  const grp = new THREE.Group();
  const L = BODY_LEN;
  const kraken = c.speciesId === 'the-reservoir-kraken';
  const tint = new THREE.Color(c.tint || 0x8a3a4a);
  const emI = c.emissive || 0;
  const skin = psxMaterial({ color: tint, roughness: 0.5, emissive: emI ? tint : 0x000000, emissiveIntensity: emI * 1.3 });
  const skinDark = psxMaterial({ color: tint.clone().multiplyScalar(0.6), roughness: 0.55, emissive: emI ? tint : 0x000000, emissiveIntensity: emI * 0.7 });

  // mantle: pointed tip at -L/2, bulging then tapering into the head (~+L*0.2)
  const mantle = tubeMesh(
    [[0, 0.004], [0.05, 0.05], [0.14, 0.1], [0.28, 0.118], [0.44, 0.112], [0.58, 0.092], [0.7, 0.078], [0.82, 0.088], [1, 0.072]],
    skin, L, -L * 0.5, L * 0.2, 24, 14,
  );
  grp.add(mantle);

  // swim fins near the tip
  const finMat = finMaterial(tint.clone().lerp(new THREE.Color(0xffffff), 0.12), emI ? tint : 0, emI * 0.6);
  for (const s of [1, -1]) {
    const fin = flatFin(0.5, 0.36, finMat);
    fin.position.set(-L * 0.34, 0, s * 0.1 * L);
    fin.rotation.set(0, s * 0.5, 0);
    fin.scale.setScalar(0.85);
    grp.add(fin);
  }

  // big eyes on the head
  const R = 0.055 * L;
  for (const s of [1, -1]) {
    if (kraken) grp.add(ball(R * 1.3, tint, L * 0.13, 0.02 * L, s * 0.085 * L, tint, 1.4));
    grp.add(ball(R, 0xf0ead6, L * 0.14, 0.02 * L, s * 0.092 * L));
    grp.add(ball(R * 0.5, 0x0a0a0a, L * 0.175, 0.02 * L, s * 0.1 * L));
  }

  // arms: N short + 2 long tentacles from the head end, curling toward -X
  const base = L * 0.2;
  const N = kraken ? 10 : 8;
  for (let k = 0; k < N + 2; k++) {
    const long = k >= N;
    const a = ((k % N) / N) * Math.PI * 2 + (long ? 0.35 : 0);
    const ring = long ? 0.05 * L : 0.06 * L;
    const arm = new THREE.Group();
    arm.position.set(base, Math.sin(a) * ring, Math.cos(a) * ring);
    // point the arm outward+forward then curl
    arm.rotation.z = -0.4 - Math.abs(Math.sin(a)) * 0.3;
    arm.rotation.y = Math.atan2(Math.cos(a), 0.6) * 0.5;
    const segs = long ? 7 : 4;
    const armLen = (long ? 1.15 : 0.42) * L;
    let node = arm;
    for (let i = 0; i < segs; i++) {
      const j = new THREE.Group();
      j.rotation.z = 0.32 + (long ? 0.12 : 0.34) * i; // progressive downward curl
      j.rotation.x = Math.sin(a) * 0.18;
      const r = (long ? 0.02 : 0.03) * L * (1 - (i / segs) * 0.7);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r, armLen / segs, 5), i % 2 ? skinDark : skin);
      seg.geometry.translate(0, armLen / segs / 2, 0);
      j.add(seg);
      node.add(j);
      const tip = new THREE.Group();
      tip.position.y = armLen / segs;
      j.add(tip);
      node = tip;
    }
    if (long) {
      const club = new THREE.Mesh(new THREE.SphereGeometry(0.03 * L, 6, 5), skin);
      club.scale.set(1, 2.2, 1);
      node.add(club);
    }
    grp.add(arm);
  }

  grp.rotation.y = Math.PI;
  grp.userData = { grip: 'hug', bodyLen: L, mouth: new THREE.Vector3(-L * 0.5, 0, 0) };
  return grp;
}

// ---------------------------------------------------------------------------
// crustaceans — crab, shrimp, crayfish
// ---------------------------------------------------------------------------
function boneChain(segs, mat, mat2) {
  const root = new THREE.Group();
  let node = root;
  segs.forEach((s, i) => {
    const j = new THREE.Group();
    j.rotation.z = s.bend || 0;
    j.rotation.x = s.twist || 0;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.7, s.r, s.len, 4), i % 2 && mat2 ? mat2 : mat);
    m.geometry.translate(0, s.len / 2, 0);
    j.add(m);
    node.add(j);
    const tip = new THREE.Group();
    tip.position.y = s.len;
    j.add(tip);
    node = tip;
  });
  return { root, tip: node };
}

// loft rings along an arbitrary spine of Vector3s, per-point radius
function loftAlong(spine, radii, mat, rad = 10) {
  const pos = [];
  const idx = [];
  const ri = [];
  for (let i = 0; i < spine.length; i++) {
    const p = spine[i];
    const dir = spine[Math.min(i + 1, spine.length - 1)].clone().sub(spine[Math.max(i - 1, 0)]).normalize();
    const up = Math.abs(dir.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const n = new THREE.Vector3().crossVectors(dir, up).normalize();
    const b = new THREE.Vector3().crossVectors(dir, n).normalize();
    ri.push(pos.length / 3);
    for (let j = 0; j < rad; j++) {
      const a = (j / rad) * Math.PI * 2;
      const o = n.clone().multiplyScalar(Math.cos(a) * radii[i]).add(b.clone().multiplyScalar(Math.sin(a) * radii[i]));
      pos.push(p.x + o.x, p.y + o.y, p.z + o.z);
    }
  }
  for (let i = 0; i < spine.length - 1; i++)
    for (let j = 0; j < rad; j++) {
      const jn = (j + 1) % rad;
      idx.push(ri[i] + j, ri[i + 1] + j, ri[i] + jn, ri[i] + jn, ri[i + 1] + j, ri[i + 1] + jn);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

function buildCrab(c) {
  const grp = new THREE.Group();
  const L = BODY_LEN;
  const king = c.speciesId === 'king-crab';
  const tint = new THREE.Color(c.tint || 0x5c7fa6);
  const shell = psxMaterial({ color: tint, roughness: 0.35, metalness: 0.12 });
  const shellD = psxMaterial({ color: tint.clone().multiplyScalar(0.66), roughness: 0.4 });
  const claw = psxMaterial({ color: tint.clone().lerp(new THREE.Color(0xffffff), king ? 0.12 : 0.22), roughness: 0.3, metalness: 0.1 });

  const cw = (king ? 0.46 : 0.4) * L;
  const cd = (king ? 0.34 : 0.3) * L;
  const ch = 0.13 * L;

  const cara = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 9), shell);
  cara.scale.set(cw, ch, cd);
  cara.position.y = ch * 0.4;
  grp.add(cara);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), shellD);
  belly.scale.set(cw * 0.86, ch * 0.5, cd * 0.86);
  belly.position.y = -ch * 0.2;
  grp.add(belly);

  if (king)
    for (let k = 0; k < 9; k++) {
      const a = -0.8 + k * 0.2;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.022 * L, 0.1 * L, 4), claw);
      sp.position.set(Math.sin(a) * cw * 0.85, ch * 0.5, -Math.cos(a) * cd * 0.9);
      sp.rotation.set(-1.5, 0, Math.sin(a));
      grp.add(sp);
    }

  for (const s of [1, -1]) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * L, 0.016 * L, 0.1 * L, 4), shellD);
    stalk.geometry.translate(0, 0.05 * L, 0);
    stalk.position.set(s * 0.07 * L, ch * 0.6, -cd * 0.8);
    stalk.rotation.set(-0.7, 0, s * 0.2);
    grp.add(stalk);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022 * L, 6, 5), psxMaterial({ color: 0x080808, roughness: 0.3 }));
    eye.position.set(s * 0.09 * L, ch * 1.1, -cd * 0.98);
    grp.add(eye);
  }

  const legLen = king ? [0.32, 0.4] : [0.24, 0.3];
  for (const s of [1, -1])
    for (let k = 0; k < 4; k++) {
      const { root } = boneChain(
        [
          { len: legLen[0] * L, r: (king ? 0.026 : 0.022) * L, bend: s * -1.25 },
          { len: legLen[1] * L, r: (king ? 0.013 : 0.012) * L, bend: s * -1.35 },
        ],
        s % 2 ? shell : shellD,
        shellD,
      );
      root.position.set(s * cw * 0.72, ch * 0.15, (-0.5 + k * 0.36) * cd);
      root.rotation.y = (k - 1.5) * 0.42;
      grp.add(root);
    }

  for (const s of [1, -1]) {
    const scl = (s === 1 ? 1 : 0.78) * (king ? 1.5 : 1);
    const arm = new THREE.Group();
    arm.position.set(s * cw * 0.5, 0, -cd * 0.85);
    arm.rotation.set(-0.7, s * 0.3, s * -0.4);
    const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * L * scl, 0.038 * L * scl, 0.22 * L * scl, 5), shell);
    seg1.geometry.translate(0, 0.11 * L * scl, 0);
    arm.add(seg1);
    const w = new THREE.Group();
    w.position.y = 0.22 * L * scl;
    w.rotation.x = 0.5;
    arm.add(w);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.1 * L * scl, 0.16 * L * scl, 0.09 * L * scl), claw);
    palm.position.y = 0.08 * L * scl;
    w.add(palm);
    const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.03 * L * scl, 0.15 * L * scl, 4), claw);
    f1.position.set(0.03 * L * scl, 0.2 * L * scl, 0);
    f1.rotation.z = -0.25;
    w.add(f1);
    const f2 = f1.clone();
    f2.position.x = -0.03 * L * scl;
    f2.rotation.z = 0.5;
    f2.scale.y = 0.72;
    w.add(f2);
    grp.add(arm);
  }

  grp.rotation.set(-0.32, 0.35, 0);
  grp.userData = { grip: 'none', bodyLen: L, mouth: new THREE.Vector3(0, 0, 0) };
  return grp;
}

function buildShrimp(c) {
  const grp = new THREE.Group();
  const L = BODY_LEN;
  const crayfish = c.speciesId === 'crayfish';
  const tint = new THREE.Color(c.tint || 0xe0906a);
  const shell = psxMaterial({ color: tint, roughness: 0.35, metalness: 0.08, transparent: !crayfish, opacity: crayfish ? 1 : 0.92 });
  const shellD = psxMaterial({ color: tint.clone().multiplyScalar(0.7), roughness: 0.4 });

  const N = 16;
  const arc = crayfish ? 0.5 : 1.25;
  const curlR = L * 0.42;
  const spine = [];
  const radii = [];
  const Rmax = (crayfish ? 0.1 : 0.085) * L;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const th = -arc * 0.4 + arc * t;
    spine.push(new THREE.Vector3(Math.sin(th) * curlR, -Math.cos(th) * curlR + curlR, 0));
    radii.push(Rmax * (t < 0.12 ? 0.55 + t * 3.6 : Math.max(0.12, 1 - (t - 0.12) * 1.0)));
  }
  grp.add(loftAlong(spine, radii, shell, 10));

  for (let i = 3; i < N - 2; i += 2) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radii[i] * 1.04, radii[i] * 0.16, 4, 10), shellD);
    ring.position.copy(spine[i]);
    ring.lookAt(spine[i].clone().add(spine[i + 1].clone().sub(spine[i - 1])));
    grp.add(ring);
  }

  const head = spine[0];
  const headDir = spine[0].clone().sub(spine[1]).normalize();

  const ros = new THREE.Mesh(new THREE.ConeGeometry(0.018 * L, 0.34 * L, 4), shellD);
  ros.position.copy(head).addScaledVector(headDir, 0.17 * L).add(new THREE.Vector3(0, 0.03 * L, 0));
  ros.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), headDir.clone().add(new THREE.Vector3(0, 0.35, 0)).normalize());
  grp.add(ros);

  for (const s of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028 * L, 6, 5), psxMaterial({ color: 0x0a0a0a, roughness: 0.3 }));
    eye.position.copy(head).addScaledVector(headDir, 0.04 * L).add(new THREE.Vector3(0, 0.02 * L, s * radii[0] * 0.85));
    grp.add(eye);
  }

  for (const s of [1, -1]) {
    const { root } = boneChain(
      [
        { len: 0.42 * L, r: 0.008 * L, bend: 0.32 },
        { len: 0.4 * L, r: 0.005 * L, bend: 0.36 },
        { len: 0.3 * L, r: 0.003 * L, bend: 0.4 },
      ],
      shellD,
    );
    root.position.copy(head).add(new THREE.Vector3(0, 0, s * radii[0] * 0.6));
    root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), headDir);
    root.rotateZ(s * 0.3);
    grp.add(root);
  }

  for (let i = 2; i < N - 1; i += 2)
    for (const s of [1, -1]) {
      const near = i < N * 0.55;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.004 * L, 0.008 * L, (near ? 0.14 : 0.08) * L, 4), shellD);
      leg.geometry.translate(0, -(near ? 0.07 : 0.04) * L, 0);
      leg.position.copy(spine[i]).add(new THREE.Vector3(0, -radii[i] * 0.7, s * radii[i] * 0.5));
      leg.rotation.set(0.4, 0, s * 0.3);
      grp.add(leg);
    }

  const tail = spine[N];
  const tailDir = spine[N].clone().sub(spine[N - 1]).normalize();
  for (let k = -2; k <= 2; k++) {
    const blade = flatFin(0.24, 0.12, finMaterial(tint.clone().lerp(new THREE.Color(0xffffff), 0.15), 0, 0));
    blade.position.copy(tail);
    blade.quaternion.setFromUnitVectors(new THREE.Vector3(-1, 0, 0), tailDir);
    blade.rotateY(k * 0.36);
    blade.scale.setScalar(0.62);
    grp.add(blade);
  }

  if (crayfish)
    for (const s of [1, -1]) {
      const arm = new THREE.Group();
      arm.position.copy(head).add(new THREE.Vector3(0.05 * L, -0.02 * L, s * radii[0] * 0.7));
      arm.rotation.set(0.3, 0, s * -1.0);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * L, 0.026 * L, 0.24 * L, 5), shell);
      seg.geometry.translate(0, 0.12 * L, 0);
      arm.add(seg);
      const w = new THREE.Group();
      w.position.y = 0.24 * L;
      arm.add(w);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.07 * L, 0.13 * L, 0.06 * L), shell);
      palm.position.y = 0.06 * L;
      w.add(palm);
      for (const fs of [1, -1]) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.02 * L, 0.13 * L, 4), shell);
        f.position.set(fs * 0.02 * L, 0.16 * L, 0);
        f.rotation.z = fs * 0.3;
        if (fs < 0) f.scale.y = 0.7;
        w.add(f);
      }
      grp.add(arm);
    }

  grp.rotation.set(-0.3, 0.4, crayfish ? 0 : -0.2);
  grp.userData = { grip: 'none', bodyLen: L, mouth: new THREE.Vector3(0, 0, 0) };
  return grp;
}

// ---------------------------------------------------------------------------
// junk
// ---------------------------------------------------------------------------
function buildJunk(c) {
  const grp = new THREE.Group();
  const mat = (color, o = {}) => psxMaterial({ color, roughness: 0.85, ...o });
  const M = {
    metal: mat(0x8b8f96, { roughness: 0.5, metalness: 0.4 }),
    darkMetal: mat(0x3a3d42, { roughness: 0.55, metalness: 0.4 }),
    rust: mat(0x7a4a2c),
    leather: mat(0x4b3626),
    sole: mat(0x241b13),
    gold: mat(0xffcf3a, { emissive: 0xffb02a, emissiveIntensity: 0.55 }),
    wood: mat(0x4a3220),
    glass: psxMaterial({ color: 0x5f8a6c, transparent: true, opacity: 0.5, roughness: 0.25 }),
    paper: mat(0xd8cfae),
    news: mat(0xbdb6a2),
    black: mat(0x121218),
  };
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const cyl = (r0, r1, h, seg, m) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m);
  const add = (mesh, x = 0, y = 0, z = 0) => {
    mesh.position.set(x, y, z);
    grp.add(mesh);
    return mesh;
  };
  const bar = (len, r, m) => {
    const b = cyl(r, r, len, 5, m);
    return b;
  };

  switch (c.speciesId) {
    case 'car-tire': {
      add(new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.34, 8, 22), M.black));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        add(box(0.18, 0.2, 0.34, M.black), Math.cos(a) * 1.14, Math.sin(a) * 1.14, 0).rotation.z = a;
      }
      add(cyl(0.5, 0.5, 0.36, 8, M.metal)); // rim
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add(box(0.5, 0.12, 0.12, M.metal), Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0).rotation.z = a;
      }
      add(cyl(0.16, 0.16, 0.42, 6, M.darkMetal));
      break;
    }

    case 'rusty-can': {
      add(cyl(0.46, 0.46, 1.5, 12, M.rust));
      add(new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 5, 12), M.metal), 0, 0.75, 0).rotation.x = Math.PI / 2;
      add(cyl(0.5, 0.5, 0.5, 12, mat(0x9a9484)), 0, 0.05, 0); // label band
      // peeled lid, hinged up
      const lid = add(cyl(0.44, 0.44, 0.04, 12, M.metal), 0.2, 0.95, 0);
      lid.rotation.set(0, 0, -0.9);
      break;
    }

    case 'old-boot': {
      add(box(1.7, 0.34, 0.66, M.sole), 0, 0, 0); // sole
      add(box(0.5, 0.28, 0.66, M.sole), -0.6, -0.16, 0); // heel
      add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 7, 6), M.leather), 0.78, 0.12, 0).scale.set(1.1, 0.9, 0.95); // toe
      const shaft = add(box(0.62, 1.15, 0.62, M.leather), -0.45, 0.78, 0);
      shaft.rotation.z = 0.18;
      add(box(0.5, 0.5, 0.5, M.leather), 0.08, 0.42, 0); // instep
      add(new THREE.Mesh(new THREE.CircleGeometry(0.24, 8), M.black), -0.4, 1.34, 0).rotation.x = -0.6; // opening
      for (let i = 0; i < 3; i++) add(bar(0.5, 0.03, M.sole), 0.05, 0.35 + i * 0.22, 0.32).rotation.set(0, 0, 0.7 + (i % 2) * -1.4);
      break;
    }

    case 'shopping-cart': {
      const w = 1.5, h = 1.0, d = 1.1, r = 0.035;
      const rim = (len, m) => bar(len, r, m || M.metal);
      // basket frame (slightly flared top)
      const posts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2 + 0.1, d / 2], [-w / 2 - 0.1, d / 2]];
      posts.forEach(([x, z]) => add(rim(h), x, 0, z));
      for (const yy of [-h / 2, h / 2]) {
        add(rim(w + (yy > 0 ? 0.2 : 0)), 0, yy, -d / 2).rotation.z = Math.PI / 2;
        add(rim(w + (yy > 0 ? 0.2 : 0)), 0, yy, d / 2).rotation.z = Math.PI / 2;
        add(rim(d), -w / 2 - (yy > 0 ? 0.1 : 0), yy, 0).rotation.x = Math.PI / 2;
        add(rim(d), w / 2 + (yy > 0 ? 0.1 : 0), yy, 0).rotation.x = Math.PI / 2;
      }
      // wire grid on the long sides + bottom
      for (let k = -1; k <= 1; k++) {
        add(rim(w), 0, k * 0.28, -d / 2).rotation.z = Math.PI / 2;
        add(rim(w), 0, k * 0.28, d / 2).rotation.z = Math.PI / 2;
        add(rim(d), k * 0.42, -h / 2, 0).rotation.x = Math.PI / 2;
      }
      for (let k = -1; k <= 1; k++) add(rim(h), k * 0.45, 0, -d / 2);
      // handle
      add(rim(w), -w / 2 - 0.35, h / 2 + 0.25, 0).rotation.z = Math.PI / 2;
      add(rim(0.5), -w / 2 - 0.18, h / 2 + 0.12, d / 2).rotation.z = 0.7;
      add(rim(0.5), -w / 2 - 0.18, h / 2 + 0.12, -d / 2).rotation.z = 0.7;
      // wheels
      for (const [x, z] of [[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.35], [0.5, 0.35]]) {
        add(cyl(0.14, 0.14, 0.08, 8, M.darkMetal), x, -h / 2 - 0.22, z).rotation.x = Math.PI / 2;
        add(rim(0.22), x, -h / 2 - 0.11, z);
      }
      break;
    }

    case 'soggy-newspaper': {
      for (let k = 0; k < 4; k++) {
        const sheet = box(1.5 - k * 0.08, 0.03, 1.15 - k * 0.05, k % 2 ? M.news : mat(0xc9c2ae));
        sheet.rotation.set(0.12 + k * 0.03, k * 0.4, -0.08);
        add(sheet, k * 0.04, k * 0.05, 0);
      }
      add(cyl(0.12, 0.12, 1.1, 6, M.news), 0.62, 0.12, 0).rotation.x = Math.PI / 2; // rolled edge
      for (let i = 0; i < 3; i++) add(box(1.1, 0.005, 0.04, M.black), -0.1, 0.28, -0.3 + i * 0.3).rotation.x = 0.12; // "text"
      break;
    }

    case 'lost-phone': {
      add(box(0.82, 1.62, 0.12, M.black));
      const screen = add(new THREE.Mesh(new THREE.PlaneGeometry(0.68, 1.44), psxMaterial({ color: 0x0b1420, emissive: 0x14324f, emissiveIntensity: 0.5 })), 0, 0, 0.065);
      // cracks
      for (const [x, y, rot, len] of [[-0.2, 0.3, 0.6, 0.9], [-0.2, 0.3, -0.4, 0.7], [-0.2, 0.3, 1.4, 0.6]])
        add(box(len, 0.015, 0.01, mat(0x9fd0ff, { emissive: 0x9fd0ff, emissiveIntensity: 0.6 })), x, y, 0.07).rotation.z = rot;
      add(cyl(0.06, 0.06, 0.05, 6, M.darkMetal), -0.22, 0.62, -0.08).rotation.x = Math.PI / 2; // camera
      break;
    }

    case 'message-bottle': {
      add(cyl(0.34, 0.34, 1.3, 10, M.glass));
      add(cyl(0.12, 0.34, 0.4, 10, M.glass), 0, 0.8, 0); // shoulder
      add(cyl(0.13, 0.13, 0.3, 8, M.glass), 0, 1.12, 0); // neck
      add(cyl(0.11, 0.15, 0.26, 8, mat(0x9a7a4a)), 0, 1.34, 0); // cork
      add(cyl(0.12, 0.12, 0.8, 6, M.paper), 0, -0.1, 0).rotation.set(0.3, 0, 0.4); // rolled note
      grp.rotation.z = Math.PI / 2 - 0.15; // lies on its side
      break;
    }

    case 'treasure-chest': {
      add(box(1.9, 0.95, 1.15, M.wood), 0, -0.1, 0);
      const half = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.92, 12, 1, false, 0, Math.PI), M.wood);
      half.rotation.z = Math.PI / 2;
      const lid = new THREE.Group();
      lid.add(half);
      lid.position.set(0, 0.42, -0.58);
      lid.rotation.x = -0.55; // thrown open
      grp.add(lid);
      for (const x of [-0.7, 0.7]) add(box(0.14, 1.05, 1.2, M.darkMetal), x, -0.1, 0); // iron bands
      add(box(0.28, 0.34, 0.1, M.gold), 0, -0.05, 0.6); // lock
      for (let i = 0; i < 8; i++)
        add(new THREE.Mesh(new THREE.SphereGeometry(0.09 + Math.random() * 0.06, 5, 4), M.gold),
          -0.55 + Math.random() * 1.1, 0.05 + Math.random() * 0.35, 0.1 + Math.random() * 0.35);
      break;
    }

    default:
      add(box(1.3, 0.9, 0.9, M.metal));
  }

  grp.userData = { grip: 'none', bodyLen: BODY_LEN, mouth: new THREE.Vector3(0, 0, 0) };
  return grp;
}

function fitModel(obj, entry) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const longest = Math.max(size.x, size.y, size.z) || 1;
  const s = (BODY_LEN / longest) * (entry.scale || 1);
  obj.scale.setScalar(s);
  obj.position.sub(center.multiplyScalar(s));
  if (entry.yaw) obj.rotation.y = entry.yaw;
  obj.traverse((n) => {
    if (n.isMesh && n.material && !n.material.onBeforeCompile) {
      n.material = psxMaterial({ color: n.material.color || new THREE.Color(0x8a8a8a), map: n.material.map || null });
    }
  });
}
