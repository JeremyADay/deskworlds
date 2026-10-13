import * as THREE from 'three';
import {
  SCREEN_VERT, BACKDROP_VERT, BACKDROP_FRAG, BOULDER_VERT, BOULDER_FRAG, PIT_VERT, PIT_FRAG, SMOKE_FRAG, CHAIR_VERT, CHAIR_FRAG, TRUNK_VERT, TRUNK_FRAG,
  BOUGH_VERT, BOUGH_FRAG, GRASS_VERT, GRASS_FRAG, RAIL_VERT, RAIL_FRAG, BULB_VERT, BULB_FRAG, SPLASH_VERT, SPLASH_FRAG, RAIN_FRAG,
  CLOUD_FRAG, FADE_FRAG, STAMP_VERT, STAMP_FRAG, SHRINK_FRAG, BLUR_FRAG, GLASS_FRAG, DROP_VERT, DROP_FRAG,
} from './shaders.js';
import { PIT, PROFILE, profileStrip } from './storm.js';
import { WIPE, MAX_STAMPS } from './glass.js';
import { PINES, boughCount, BOUGH_FLOATS, ROCK_FLOATS, BLADE_FLOATS, TRUNK_FLOATS, SPLASH_PARTS, buildBoughs, buildTrunk, buildBoulders, buildGrass, bulbCount, splashCount, chairs, paintBoughs } from './yard.js';
import { randomGenerator } from '../../shared/random.js';

// The widest frame the instance buffers are sized for (32:9 is 3.56).
const MAX_ASPECT = 4;
// The pane's memory of wipes is soft-edged, so it is kept at a modest fixed height.
const STATE_HEIGHT = 512;
// Shader time wraps where the trees', the grass's and the lights' swings all come round
// together, so nothing jumps and no phase loses precision after days of running.
const TIME_WRAP = 20 * Math.PI * 57;
// How far the fog smears the view: the step between blur taps, in window heights.
const BLUR = 0.0050;

export function createRenderer(canvas, storm, glass) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.autoClear = false;
  renderer.info.autoReset = false;

  // The yard is drawn sharp into `view`; its mip chain is the blur the fogged pane looks through.
  const view = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
  });
  const state = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  // The same view out of focus, at a quarter size: what the fog shows.
  const blurA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const soft = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
  });
  // The clouds' shape, at half size.
  const sky = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const shared = {
    uTime: { value: 0 }, uAspect: { value: 1 }, uAmb: { value: 0 }, uGust: { value: 0 }, uSmoke: { value: 0 }, uHoliday: { value: 0 },
    uMoonLit: { value: 0.7 }, uEmber: { value: 0.6 }, uRain: { value: 0.85 }, uSway: { value: 1 },
    uPit: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2(1, 1) },
  };

  const strip = profileStrip();
  const profile = new THREE.DataTexture(Uint16Array.from(strip, THREE.DataUtils.toHalfFloat), PROFILE.samples, 1, THREE.RGBAFormat, THREE.HalfFloatType);
  profile.minFilter = profile.magFilter = THREE.LinearFilter;
  profile.needsUpdate = true;

  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = atlasCanvas.height = 1024;
  paintBoughs(atlasCanvas.getContext('2d'), randomGenerator(4021));
  const atlas = new THREE.CanvasTexture(atlasCanvas);
  atlas.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  const OVER = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor };
  const ADD = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor };
  const yard = new THREE.Scene(), clouds = new THREE.Scene(), memory = new THREE.Scene(), pane = new THREE.Scene();
  function layer(scene, order, geometry, vertexShader, fragmentShader, uniforms = {}, blend = OVER) {
    const material = new THREE.ShaderMaterial({ uniforms: { ...shared, ...uniforms }, vertexShader, fragmentShader, depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide, ...blend });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false; mesh.renderOrder = order;
    scene.add(mesh);
    return mesh;
  }
  const quad = () => new THREE.PlaneGeometry(2, 2);
  // One quad drawn many times, each copy reading its own slice of `array`.
  function instanced(array, stride, attributes, base = quad(), usage = THREE.StaticDrawUsage) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute('position', base.getAttribute('position'));
    const buffer = new THREE.InstancedInterleavedBuffer(array, stride);
    buffer.setUsage(usage);
    let offset = 0;
    for (const [name, size] of attributes) { geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(buffer, size, offset)); offset += size; }
    geometry.instanceCount = 0;
    return { geometry, buffer };
  }
  function fill({ geometry, buffer }, data, stride) {
    buffer.array.set(data.subarray(0, Math.min(data.length, buffer.array.length)));
    buffer.needsUpdate = true;
    geometry.instanceCount = Math.min(data.length, buffer.array.length) / stride;
  }

  const cloudX = { value: 0 }, moonAt = { value: new THREE.Vector3() };
  layer(clouds, 0, quad(), SCREEN_VERT, CLOUD_FRAG, { uCloudX: cloudX, uMoon: moonAt }, { blending: THREE.NoBlending });
  const backdrop = layer(yard, 0, quad(), BACKDROP_VERT, BACKDROP_FRAG, {
    uProfile: { value: profile }, uSky: { value: sky.texture }, uCloudX: cloudX, uGlow: { value: 0 }, uBolt: { value: 0 }, uBoltX: { value: 0.5 }, uBoltSeed: { value: 0 },
    uMoon: moonAt, uGlowPos: { value: new THREE.Vector2(0.5, 0.7) },
  }, { blending: THREE.NoBlending });
  const rocks = instanced(new Float32Array(16 * ROCK_FLOATS), ROCK_FLOATS, [['aRock', 4], ['aSeed', 2]]);
  layer(yard, 10, rocks.geometry, BOULDER_VERT, BOULDER_FRAG);
  const pitBox = { value: new THREE.Vector4() }, smokeBox = { value: new THREE.Vector4() };
  layer(yard, 11, quad(), PIT_VERT, PIT_FRAG, { uBox: pitBox });
  const seats = instanced(new Float32Array(6), 3, [['aChair', 3]]);
  layer(yard, 12, seats.geometry, CHAIR_VERT, CHAIR_FRAG);
  layer(yard, 13, quad(), PIT_VERT, SMOKE_FRAG, { uBox: smokeBox });
  const trees = PINES.map((tree, i) => {
    const trunk = new THREE.BufferGeometry(), trunkBuffer = new THREE.InterleavedBuffer(buildTrunk(1, tree), TRUNK_FLOATS);
    trunk.setAttribute('position', new THREE.InterleavedBufferAttribute(trunkBuffer, 2, 0));
    trunk.setAttribute('aTree', new THREE.InterleavedBufferAttribute(trunkBuffer, 4, 2));
    trunk.setAttribute('aCrown', new THREE.InterleavedBufferAttribute(trunkBuffer, 1, 6));
    layer(yard, 20 + i * 2, trunk, TRUNK_VERT, TRUNK_FRAG);
    const boughs = instanced(new Float32Array(boughCount(tree) * BOUGH_FLOATS), BOUGH_FLOATS, [['aRoot', 4], ['aShape', 4], ['aLook', 4]]);
    layer(yard, 21 + i * 2, boughs.geometry, BOUGH_VERT, BOUGH_FRAG, { uAtlas: { value: atlas } });
    return { tree, trunkBuffer, boughs };
  });
  layer(yard, 30, quad(), SCREEN_VERT, RAIN_FRAG, {}, ADD);
  // A blade is a strip of five quads, tapering to its tip.
  const blade = new THREE.BufferGeometry();
  {
    const positions = [], index = [];
    for (let j = 0; j <= 5; j++) positions.push(-1, j / 5, 0, 1, j / 5, 0);
    for (let j = 0; j < 5; j++) index.push(j * 2, j * 2 + 1, j * 2 + 3, j * 2, j * 2 + 3, j * 2 + 2);
    blade.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    blade.setIndex(index);
  }
  const grass = instanced(new Float32Array(Math.ceil(MAX_ASPECT * 1200) * BLADE_FLOATS), BLADE_FLOATS, [['aBlade', 4], ['aLook', 4]], blade);
  layer(yard, 35, grass.geometry, GRASS_VERT, GRASS_FRAG);
  layer(yard, 40, quad(), RAIL_VERT, RAIL_FRAG);
  const bulbs = instanced(Float32Array.from({ length: bulbCount(MAX_ASPECT) }, (_, i) => i), 1, [['aBulb', 1]]);
  layer(yard, 41, bulbs.geometry, BULB_VERT, BULB_FRAG);
  const splashes = instanced(Float32Array.from({ length: splashCount(MAX_ASPECT) * 2 }, (_, i) => i % 2 ? (i >> 1) % SPLASH_PARTS : Math.floor((i >> 1) / SPLASH_PARTS)), 2, [['aSplash', 2]]);
  layer(yard, 42, splashes.geometry, SPLASH_VERT, SPLASH_FRAG);

  // The pane's memory: everything fades a little, then this frame's wipes and tracks go on.
  const fade = { value: new THREE.Vector2() };
  layer(memory, 0, quad(), SCREEN_VERT, FADE_FRAG, { uFade: fade }, { ...ADD, blendEquation: THREE.ReverseSubtractEquation });
  const stamps = instanced(glass.stamps, 4, [['aStamp', 4]], quad(), THREE.DynamicDrawUsage);
  layer(memory, 1, stamps.geometry, STAMP_VERT, STAMP_FRAG, {}, { ...ADD, blendEquation: THREE.MaxEquation });

  const blurStep = { value: new THREE.Vector2() }, blurSource = { value: view.texture };
  const shrink = new THREE.Scene(), blur = new THREE.Scene();
  layer(shrink, 0, quad(), SCREEN_VERT, SHRINK_FRAG, { uSrc: { value: view.texture } }, { blending: THREE.NoBlending });
  layer(blur, 0, quad(), SCREEN_VERT, BLUR_FRAG, { uSrc: blurSource, uStep: blurStep }, { blending: THREE.NoBlending });
  const paneUniforms = { uScene: { value: view.texture }, uSoft: { value: soft.texture }, uState: { value: state.texture }, uFire: { value: 1 }, uGlow: { value: 0 }, uFogKnee: { value: WIPE.fogKnee }, uClear: { value: 0 } };
  layer(pane, 0, quad(), SCREEN_VERT, GLASS_FRAG, paneUniforms, { blending: THREE.NoBlending });
  let drops = instanced(glass.drops, 4, [['aDrop', 4]], quad(), THREE.DynamicDrawUsage);
  const dropMesh = layer(pane, 1, drops.geometry, DROP_VERT, DROP_FRAG, { uScene: paneUniforms.uScene, uGlow: paneUniforms.uGlow, uFire: paneUniforms.uFire }, { blending: THREE.NormalBlending });

  let aspect = 1;
  // The same yard whatever the window's shape or however often it changes.
  function layout() {
    const random = randomGenerator(9173);
    fill(rocks, buildBoulders(aspect, random), ROCK_FLOATS);
    fill(seats, chairs(aspect), 3);
    for (const { tree, trunkBuffer, boughs } of trees) {
      trunkBuffer.array.set(buildTrunk(aspect, tree)); trunkBuffer.needsUpdate = true;
      fill(boughs, buildBoughs(aspect, random, tree), BOUGH_FLOATS);
    }
    fill(grass, buildGrass(aspect, random), BLADE_FLOATS);
    bulbs.geometry.instanceCount = bulbCount(aspect);
    splashes.geometry.instanceCount = splashCount(aspect);
    shared.uPit.value.set(PIT.x * aspect, PIT.y);
    pitBox.value.set(PIT.x * aspect, PIT.y + 0.004, 0.066, 0.026);
    smokeBox.value.set(PIT.x * aspect, PIT.y + 0.18, 0.56, 0.18);
  }

  // Let `seconds` pass on the pane and lay down the wipes and tracks made in that time.
  function remember(seconds) {
    fade.value.set(seconds / WIPE.fogBack, seconds / WIPE.trailBack);
    stamps.buffer.needsUpdate = true;
    stamps.geometry.instanceCount = Math.min(MAX_STAMPS, glass.stampCount);
    renderer.setRenderTarget(state);
    renderer.render(memory, camera);
    renderer.setRenderTarget(null);
    glass.clearStamps();
  }

  function render() {
    renderer.info.reset();
    const s = storm.state, u = backdrop.material.uniforms;
    shared.uTime.value = s.time % TIME_WRAP;
    shared.uAmb.value = s.amb; shared.uGust.value = s.gust; shared.uSmoke.value = s.smoke; shared.uHoliday.value = s.holiday;
    shared.uEmber.value = s.ember; shared.uRain.value = s.rain; shared.uSway.value = s.sway;
    u.uCloudX.value = s.cloudX; u.uGlow.value = s.glow; u.uGlowPos.value.set(s.glowX, s.glowY);
    u.uBolt.value = s.bolt; u.uBoltX.value = s.boltX; u.uBoltSeed.value = s.boltSeed;
    const moon = storm.moon(aspect);
    u.uMoon.value.set(moon.x, moon.y, moon.up);
    shared.uMoonLit.value = 0.7 * moon.up;
    paneUniforms.uFire.value = s.fire; paneUniforms.uGlow.value = s.glow;
    // The pane grows a new drop buffer when its shape changes.
    if (drops.buffer.array !== glass.drops) {
      drops.geometry.dispose();
      drops = instanced(glass.drops, 4, [['aDrop', 4]], quad(), THREE.DynamicDrawUsage);
      dropMesh.geometry = drops.geometry;
    }
    drops.geometry.instanceCount = glass.pack();
    drops.buffer.needsUpdate = true;
    renderer.setRenderTarget(sky);
    renderer.render(clouds, camera);
    renderer.setRenderTarget(view);
    renderer.render(yard, camera);
    // Shrink, blur across, blur down.
    renderer.setRenderTarget(soft);
    renderer.render(shrink, camera);
    blurSource.value = soft.texture; blurStep.value.set(BLUR / aspect, 0);
    renderer.setRenderTarget(blurA);
    renderer.render(blur, camera);
    blurSource.value = blurA.texture; blurStep.value.set(0, BLUR);
    renderer.setRenderTarget(soft);
    renderer.render(blur, camera);
    renderer.setRenderTarget(null);
    renderer.render(pane, camera);
  }

  function resize(cssWidth, cssHeight, w, h) {
    renderer.setSize(w, h, false);
    view.setSize(w, h);
    sky.setSize(Math.ceil(w / 2), Math.ceil(h / 2));
    blurA.setSize(Math.ceil(w / 4), Math.ceil(h / 4)); soft.setSize(Math.ceil(w / 4), Math.ceil(h / 4));
    shared.uRes.value.set(w, h);
    const next = cssWidth / cssHeight, stateWidth = Math.round(STATE_HEIGHT * next);
    if (state.width !== stateWidth || state.height !== STATE_HEIGHT) {
      state.setSize(stateWidth, STATE_HEIGHT);
      renderer.setRenderTarget(state); renderer.clear(); renderer.setRenderTarget(null);
    }
    if (next !== aspect) { aspect = next; shared.uAspect.value = aspect; layout(); }
    return aspect;
  }

  function dispose() {
    const geometries = new Set(), materials = new Set();
    for (const root of [yard, clouds, memory, pane, shrink, blur]) root.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
    geometries.forEach(g => g.dispose());
    materials.forEach(m => m.dispose());
    view.dispose(); sky.dispose(); blurA.dispose(); soft.dispose(); state.dispose(); profile.dispose(); atlas.dispose();
    renderer.dispose();
  }

  return {
    renderer, render, resize, remember, dispose,
    // Captures can look through a clean pane (1) to check the yard itself.
    setClear(value) { paneUniforms.uClear.value = Math.max(0, Math.min(1, value)); },
  };
}
