import * as THREE from 'three';
import { psxMaterial } from './scene.js';

// Low-poly fist + forearm for the grip-and-grin. Proportioned for a fish of
// BODY_LEN (~3.4) — it is added alongside the fish at natural scale and the two
// are scaled together, so the hand always reads hand-sized next to the catch.
//
// Canonical build: the grip sits at the origin, the fish's mouth anchor is
// placed just inside it, and the forearm runs up-and-back out of frame.

const SKIN = 0xc98a63;

function skin(shade = 1) {
  return psxMaterial({ color: new THREE.Color(SKIN).multiplyScalar(shade), roughness: 0.82, metalness: 0 });
}

export function buildHand(grip = 'lip') {
  const hand = new THREE.Group();
  const s = skin(1);
  const sDark = skin(0.84);

  // ---- forearm: tapered, angled toward the camera, leaves frame top ----
  const foreLen = 2.0;
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, foreLen, 8), s);
  fore.geometry.translate(0, foreLen / 2, 0);
  fore.rotation.set(-0.32, 0, 0.18);
  fore.position.set(0.05, 0.18, -0.02);
  hand.add(fore);

  // wrist
  const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), s);
  wrist.position.set(0.02, 0.16, 0);
  wrist.scale.set(1.1, 0.9, 1);
  hand.add(wrist);

  // ---- fist: a rounded block the fish's jaw goes into ----
  const fist = new THREE.Group();
  hand.add(fist);

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.5), s);
  palm.position.set(0, 0, 0);
  fist.add(palm);
  // round it off
  for (const [x, z] of [[-0.28, 0.22], [0.28, 0.22], [-0.28, -0.22], [0.28, -0.22]]) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 6), s);
    c.position.set(x, 0, z);
    fist.add(c);
  }

  // curled-finger ridge across the top / near face
  for (let i = 0; i < 4; i++) {
    const kn = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 6), i % 2 ? sDark : s);
    kn.position.set(-0.24 + i * 0.16, 0.16, 0.24);
    kn.scale.set(1, 0.85, 1.15);
    fist.add(kn);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.34, 6), i % 2 ? s : sDark);
    seg.rotation.x = Math.PI / 2.2;
    seg.position.set(-0.24 + i * 0.16, 0.02, 0.3);
    fist.add(seg);
  }

  // thumb wrapping the near-bottom
  const thumb = new THREE.Group();
  const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.34, 6), s);
  t1.geometry.translate(0, 0.17, 0);
  t1.rotation.set(0.4, 0, 1.5);
  thumb.add(t1);
  const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.28, 6), sDark);
  t2.geometry.translate(0, 0.14, 0);
  t2.position.set(-0.32, 0.05, 0);
  t2.rotation.set(0.9, 0, 1.9);
  thumb.add(t2);
  const tTip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), s);
  tTip.position.set(-0.4, 0.2, 0.05);
  thumb.add(tTip);
  thumb.position.set(0.28, -0.12, 0.16);
  fist.add(thumb);

  hand.userData = { gripInset: new THREE.Vector3(0, -0.16, 0.02) };
  return hand;
}
