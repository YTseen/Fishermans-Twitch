import * as THREE from 'three';
import { buildCatchObject } from './fish.js';
import { audio } from './audio.js';

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const back = (t) => {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

// Every fish hangs vertical — nose at the top, tail at the bottom — so nothing
// gets clipped by the tall card. A small Y turn keeps it from looking like a
// flat cut-out.
const BASE_Z = Math.PI / 2;
const BASE_Y = -0.22;

// Real size spread — a minnow should look like a minnow next to a monster.
// ~10cm → 0.37, 25cm → 0.55, 50cm → 0.74, 1m → 0.99, 2m+ → caps ~1.3.
export function visualScale(c) {
  const cm = c.lengthIn ? c.lengthIn * 2.54 : 40;
  let s = THREE.MathUtils.clamp(0.46 * Math.pow(cm / 12, 0.4), 0.4, 1.35);
  // crustaceans measure "span" not body length — hold them a bit smaller
  if (c.shape === 'crab' || c.shape === 'shrimp' || c.shape === 'crayfish') s *= 0.8;
  return s;
}

function assemble(fish, s, junk) {
  const rig = new THREE.Group();
  const holder = new THREE.Group();
  const flopper = new THREE.Group();
  flopper.add(fish);
  holder.add(flopper);
  holder.scale.setScalar(s);
  holder.rotation.set(0, junk ? 0 : BASE_Y, junk ? 0 : BASE_Z);
  rig.add(holder);
  return { rig, holder, flopper };
}

function frame(stage, rig, flopper) {
  stage.setRig(rig);
  rig.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(flopper);
  const centre = box.getCenter(new THREE.Vector3());
  const h = box.max.y - box.min.y;
  // Small/medium fish sit centred. Anything too tall for the frame is pinned by
  // the head near the top so the face stays on screen and the tail runs off the
  // bottom into the deep.
  const y = h > 4.3 ? 2.0 - box.max.y : -centre.y;
  // don't let a side protrusion (a lure, a long tentacle) drag the body off-centre
  const x = THREE.MathUtils.clamp(-centre.x, -0.5, 0.5) * 0.7;
  rig.position.set(x, y, -centre.z);
  box._tall = h > 4.3;
  return box;
}

// ---- live alert -------------------------------------------------------------
export async function playCatch(stage, c, { onReveal } = {}) {
  const fish = await buildCatchObject(c);
  const junk = fish.userData.grip === 'none';
  const s = visualScale(c);
  const { rig, holder, flopper } = assemble(fish, s, junk);
  const box = frame(stage, rig, flopper);
  const restY = rig.position.y;
  const tailLocal = new THREE.Vector3(0, box.min.y + 0.15, 0.1);

  const DUR = Math.max(5200, c.sceneMs || 9000);
  const IN_END = 900;
  const OUT_START = DUR - 700;
  const start = performance.now();
  let revealed = false;
  let breached = false;
  let nextFlop = 1700;

  return new Promise((resolve) => {
    stage.onTick = (dt, time) => {
      const e = performance.now() - start;

      if (e < IN_END) {
        const t = clamp01(e / IN_END);
        rig.position.y = restY - 3.4 * (1 - back(t));
        rig.rotation.z = (1 - t) * -0.3;
        // splash the moment it clears the surface
        if (!breached && rig.position.y > restY - 1.2) {
          breached = true;
          const at = new THREE.Vector3(0, -2.0, 0.2);
          rig.localToWorld(at);
          stage.spray(at, 1.3);
          audio.splash(c.tier);
        }
      } else if (e < OUT_START) {
        rig.position.y = restY + Math.sin(time * 1.7) * 0.05;
        if (!junk) {
          holder.rotation.y = BASE_Y + Math.sin(time * 1.1) * 0.12;
          flopper.rotation.z = Math.sin(time * 1.5) * 0.04;
        }

        if (junk) {
          fish.rotation.y += dt * 0.8;
        } else if (e > nextFlop) {
          const f = (e - nextFlop) / 620;
          flopper.rotation.z = Math.sin(clamp01(f) * Math.PI * 3) * 0.22 * (1 - clamp01(f));
          if (f < 0.14) {
            const tail = tailLocal.clone();
            holder.localToWorld(tail);
            stage.spray(tail, 1.0);
          }
          if (f >= 1) nextFlop = e + 2400 + Math.random() * 1600;
        }

        if (!revealed && e > IN_END + 80) {
          revealed = true;
          onReveal?.();
        }
      } else {
        const t = smooth(clamp01((e - OUT_START) / 700));
        rig.position.y = restY - 3.6 * t;
        rig.rotation.z = t * 0.14;
        if (t >= 1) {
          stage.onTick = null;
          stage.clearRig();
          resolve();
        }
      }
    };
  });
}

// ---- static presentation for the gallery -----------------------------------
export async function presentFish(stage, c) {
  const fish = await buildCatchObject(c);
  const junk = fish.userData.grip === 'none';
  const s = visualScale(c);
  const { rig, holder, flopper } = assemble(fish, s, junk);
  frame(stage, rig, flopper);
  const restY = rig.position.y;

  stage.onTick = (dt, time) => {
    holder.rotation.y = (junk ? 0 : BASE_Y) + Math.sin(time * 0.7) * 0.5;
    rig.position.y = restY + Math.sin(time * 1.4) * 0.04;
    flopper.rotation.z = Math.sin(time * 1.1) * 0.03;
  };
}
