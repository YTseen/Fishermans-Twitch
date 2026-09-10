import * as THREE from 'three';

// Internal render resolution — low, for the PSX look. The chunk comes from the
// low-res target + colour posterise, NOT from mangled geometry, so the fish
// meshes underneath are smooth and well formed.
const RW = 320;
const RH = 400;

// Very light vertex snap — a whiff of PSX wobble, not a seizure.
const SNAP_VERT = `
  vec4 _sn = gl_Position;
  float _g = 220.0;
  _sn.xyz /= _sn.w;
  _sn.xy = floor(_sn.xy * _g) / _g;
  _sn.xyz *= _sn.w;
  gl_Position = _sn;
`;

export function psxMaterial(params = {}) {
  const m = new THREE.MeshStandardMaterial({
    roughness: 0.72,
    metalness: 0.03,
    ...params,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n' + SNAP_VERT,
    );
  };
  return m;
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.host = canvas.parentElement;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, RW / RH, 0.1, 400);
    this.camera.position.set(0, 0.12, 7.3);
    this.camera.lookAt(0, 0.02, 0);

    this.rt = new THREE.WebGLRenderTarget(RW, RH, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.post = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { tDiffuse: { value: this.rt.texture }, levels: { value: 22.0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float levels; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          c.rgb = floor(c.rgb * levels + 0.5) / levels;
          gl_FragColor = c;
        }`,
    });
    this.post.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));

    this._buildBackdrop();

    this.rig = new THREE.Group(); // hand + fish live here
    this.scene.add(this.rig);

    this._w = 0;
    this._h = 0;
    this._syncSize();
  }

  _buildBackdrop() {
    // golden-hour lighting: warm sky bounce, low golden key, warm back-glow rim
    this.scene.add(new THREE.HemisphereLight(0xffe6c4, 0x3a3050, 1.4));

    const key = new THREE.DirectionalLight(0xffe2b0, 2.5);
    key.position.set(4, 3, 4);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0xffb066, 1.7); // sunset behind the catch
    rim.position.set(-3, 1.2, -5);
    this.scene.add(rim);

    const fill = new THREE.DirectionalLight(0xdcecff, 0.7);
    fill.position.set(0, 1, 8);
    this.scene.add(fill);

    // the sun, low on the horizon, partly behind the hills
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 24),
      new THREE.MeshBasicMaterial({ color: 0xffeec2 }),
    );
    sun.position.set(3.4, -0.3, -24);
    this.scene.add(sun);
    for (const [r, o, c] of [[3.4, 0.35, 0xffd58a], [5.2, 0.16, 0xffb877]]) {
      const halo = new THREE.Mesh(
        new THREE.CircleGeometry(r, 24),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o }),
      );
      halo.position.set(3.4, -0.3, -24 - 0.5);
      this.scene.add(halo);
    }

    // distant hills — warm-dark silhouettes against the glow
    const hillMat = new THREE.MeshBasicMaterial({ color: 0x2c2340 });
    for (let k = 0; k < 3; k++) {
      const pts = [];
      const w = 40;
      const seg = 14;
      for (let i = 0; i <= seg; i++) {
        const x = -w / 2 + (w * i) / seg;
        const y = -2 + Math.sin(i * 0.9 + k * 2) * 0.6 + Math.sin(i * 0.31) * 0.5 - k * 0.15;
        pts.push(new THREE.Vector2(x, y));
      }
      pts.push(new THREE.Vector2(w / 2, -8), new THREE.Vector2(-w / 2, -8));
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), hillMat.clone());
      mesh.material.color.lerp(new THREE.Color(0x4a3a5a), k * 0.28); // nearer hills a touch lighter
      mesh.position.set(0, -0.1, -22 - k * 4);
      mesh.scale.setScalar(1 + k * 0.15);
      this.scene.add(mesh);
    }

    // a warm reflection band right at the waterline
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 1.4),
      new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0.5 }),
    );
    glow.position.set(2.5, -1.9, -14);
    this.scene.add(glow);

    // water surface — blue lake, warm glint off the sun
    const waterGeo = new THREE.PlaneGeometry(60, 40, 24, 16);
    waterGeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(
      waterGeo,
      psxMaterial({ color: 0x2f6aa8, roughness: 0.3, metalness: 0.22, emissive: 0x1a2f4c, emissiveIntensity: 0.5 }),
    );
    this.water.position.set(0, -2.3, -4);
    this.scene.add(this.water);
    this.waterBase = Float32Array.from(waterGeo.attributes.position.array);

    // droplet pool (fish flop spray)
    this.DROPS = 60;
    this.dropPos = new Float32Array(this.DROPS * 3).fill(-999);
    this.dropVel = new Float32Array(this.DROPS * 3);
    this.dropLife = new Float32Array(this.DROPS);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dropPos, 3));
    this.drops = new THREE.Points(
      dg,
      new THREE.PointsMaterial({ color: 0xdff2ff, size: 3, sizeAttenuation: false, transparent: true, depthWrite: false }),
    );
    this.scene.add(this.drops);
  }

  spray(origin, power = 1) {
    for (let i = 0; i < this.DROPS; i++) {
      if (this.dropLife[i] > 0.05) continue;
      this.dropLife[i] = 0.4 + Math.random() * 0.5;
      this.dropPos[i * 3] = origin.x + (Math.random() - 0.5) * 0.4;
      this.dropPos[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.4;
      this.dropPos[i * 3 + 2] = origin.z;
      this.dropVel[i * 3] = (Math.random() - 0.5) * 3 * power;
      this.dropVel[i * 3 + 1] = (1 + Math.random() * 2.5) * power;
      this.dropVel[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    }
  }

  setRig(obj) {
    this.clearRig();
    this.rigObject = obj;
    this.rig.add(obj);
  }

  clearRig() {
    if (!this.rigObject) return;
    this.rig.remove(this.rigObject);
    this.rigObject.traverse((n) => {
      n.geometry?.dispose?.();
      if (Array.isArray(n.material)) n.material.forEach((m) => m.dispose());
      else n.material?.dispose?.();
    });
    this.rigObject = null;
  }

  start() {
    // Drive from rAF when it's alive (OBS, a visible tab) and from a timer
    // otherwise (a hidden/throttled tab still animates). The dt guard stops the
    // two drivers double-stepping when both fire.
    this._elapsed = 0;
    this._last = performance.now();
    const frame = () => {
      const now = performance.now();
      const dt = (now - this._last) / 1000;
      if (dt < 0.004) return;
      this._last = now;
      const step = Math.min(0.05, dt);
      this._elapsed += step;
      this._tick(step, this._elapsed);
      this._render();
    };
    const raf = () => {
      this._raf = requestAnimationFrame(raf);
      frame();
    };
    raf();
    this._ivl = setInterval(frame, 1000 / 60);
  }

  _tick(dt, t) {
    const p = this.water.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = this.waterBase[i * 3];
      const z = this.waterBase[i * 3 + 2];
      p.array[i * 3 + 1] = Math.sin(x * 0.6 + t * 1.8) * 0.12 + Math.cos(z * 0.8 - t * 1.3) * 0.12;
    }
    p.needsUpdate = true;

    let liveDrops = false;
    for (let i = 0; i < this.DROPS; i++) {
      if (this.dropLife[i] <= 0.05) {
        this.dropPos[i * 3 + 1] = -999;
        continue;
      }
      liveDrops = true;
      this.dropLife[i] -= dt;
      this.dropVel[i * 3 + 1] -= 11 * dt;
      this.dropPos[i * 3] += this.dropVel[i * 3] * dt;
      this.dropPos[i * 3 + 1] += this.dropVel[i * 3 + 1] * dt;
      this.dropPos[i * 3 + 2] += this.dropVel[i * 3 + 2] * dt;
    }
    this.drops.visible = liveDrops;
    this.drops.geometry.attributes.position.needsUpdate = true;

    this.onTick?.(dt, t);
  }

  _render() {
    this._syncSize();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.post, this.postCam);
  }

  _syncSize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h || (w === this._w && h === this._h)) return;
    this._w = w;
    this._h = h;
    this.renderer.setSize(w, h, false);
    this.rt.setSize(RW, Math.round((RW * h) / w));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
