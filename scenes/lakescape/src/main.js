import { QUALITY_PRESETS as presets, qualityName, activeQuality, frameRate, framebufferSize, renderScale } from '../../shared/render-policy.js';
import { installControls, reportSceneError, preferredQuality } from '../../shared/controls.js';
import { createFrameLoop } from '../../shared/frame-loop.js';
import { randomGenerator } from '../../shared/random.js';
import { createStorm, FIXED_STEP } from './storm.js';
import { createGlass } from './glass.js';
import { createRenderer } from './render.js';

const canvas = document.querySelector('#scene'), stage = document.querySelector('#stage'), loading = document.querySelector('#loading');
const params = new URLSearchParams(location.search), isHost = document.documentElement.dataset.motion === 'host';
const capture = params.has('capture');
if (capture) document.body.classList.add('clean', 'capture');
const HOLIDAY_KEY = 'deskworlds-holiday-lights';
let quality = preferredQuality(params);
let hostRate = isHost ? 0 : 60, onBattery = false, contextLost = false, disposed = false;
let paused = capture || (!isHost && matchMedia('(prefers-reduced-motion: reduce)').matches);
let changeRate = () => {}, changePower = () => {}, feed = () => {};
// Installed before WebGL startup so host rate 0 cannot be lost during initialization.
window.sceneRate = (fps) => { if (!Number.isFinite(fps)) return; const next = Math.max(0, Math.min(60, fps)); if (next === hostRate) return; hostRate = next; changeRate(); };
// This world's one action is a switch: Holiday Lights. Called bare it toggles; the Mac host,
// which remembers the switch between launches, passes the way it should now stand.
window.sceneFeed = (on) => feed(on);
window.scenePause = (value) => { paused = Boolean(value); changeRate(); };
// The Mac host knows the power source; a browser only sometimes does (see getBattery below).
window.scenePower = (battery) => { const next = Boolean(battery); if (next === onBattery) return; onBattery = next; changePower(); };

// The switch is remembered: the host says how it stands in the address, a browser keeps it itself.
function rememberedHoliday() {
  if (params.has('holiday')) return params.get('holiday') === '1';
  if (capture) return false;
  try { return localStorage.getItem(HOLIDAY_KEY) === '1'; } catch { return false; }
}

async function start() {
  // A capture is repeatable; a visit is not.
  const seed = capture ? Number(params.get('seed')) || 1 : Math.floor(Math.random() * 2 ** 32);
  const random = randomGenerator(seed);
  const storm = createStorm({ random, holiday: rememberedHoliday() });
  const glass = createGlass({ random, aspect: stage.clientWidth / Math.max(1, stage.clientHeight) });
  const { renderer, render: draw, resize: sizeTargets, remember, setClear, dispose } = createRenderer(canvas, storm, glass);
  let loop = null, accumulator = 0, unremembered = 0, frames = 0, zeroSize = false, aspect = 1;
  let cpuEMA = 0, slowSamples = 0, autoScale = 1, ratio = 1;
  const running = () => !disposed && !paused && !document.hidden && !contextLost && !zeroSize && hostRate > 0;
  const fps = () => frameRate(quality, hostRate, onBattery);

  const advanceOne = () => { storm.step(FIXED_STEP); glass.step(FIXED_STEP, storm.state.gust, storm.state.rain); unremembered += FIXED_STEP; };
  function render() {
    if (contextLost || disposed || document.hidden) return;
    // The pane's fog and tracks catch up with the time that has passed, then the frame is drawn.
    remember(unremembered); unremembered = 0;
    draw();
    frames++;
    if (!loading.hidden) loading.hidden = true;
  }
  function renderFrame(elapsed) {
    const before = performance.now();
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 6) { advanceOne(); accumulator -= FIXED_STEP; steps++; }
    if (steps === 6) accumulator = 0;
    render();
    if (!running()) return;
    const cost = performance.now() - before;
    cpuEMA = cpuEMA ? cpuEMA * 0.96 + cost * 0.04 : cost;
    // Conservative one-way downshift, never an oscillating up/down resolution loop.
    // CPU render time is only a pressure signal, not a claimed hardware GPU measurement.
    if (cpuEMA > 1000 / fps() * 0.85 || elapsed > 1.65 / fps()) slowSamples++; else slowSamples = Math.max(0, slowSamples - 1);
    if (slowSamples > 80 && autoScale > 0.72 && !capture) { autoScale = Math.max(0.72, autoScale - 0.1); slowSamples = 0; resize(false); }
  }
  let updateControls = () => {};
  function restart() {
    accumulator = 0;
    loop?.setRate(fps());
    loop?.setPaused(paused);
    loop?.setHidden(document.hidden || contextLost || disposed || zeroSize);
    updateControls();
  }
  changeRate = restart;
  changePower = () => { resize(); restart(); };
  function resize(redrawNow = true) {
    const width = stage.clientWidth, height = stage.clientHeight, preset = presets[activeQuality(quality, onBattery)];
    const wasZeroSize = zeroSize;
    zeroSize = !(width > 0 && height > 0);
    if (zeroSize) { restart(); return; }
    ratio = renderScale(quality, devicePixelRatio, onBattery) * autoScale;
    const { width: w, height: h } = framebufferSize(width, height, ratio, renderer.capabilities.maxTextureSize, preset.pixels);
    ratio = w / width;
    const next = sizeTargets(width, height, w, h);
    if (next !== aspect) { aspect = next; glass.resize(aspect); }
    if (wasZeroSize) restart();
    if (redrawNow && !document.hidden) render();
  }
  const observer = new ResizeObserver(() => resize());
  observer.observe(stage);
  resize(false);

  // The cursor is your hand on the inside of the pane.
  function point(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return;
    glass.wipe((clientX - rect.left) / rect.width * aspect, 1 - (clientY - rect.top) / rect.height);
    if (paused) render();
  }
  canvas.addEventListener('pointermove', (event) => point(event.clientX, event.clientY), { passive: true });
  canvas.addEventListener('pointerleave', () => glass.lift());
  const feedButton = document.querySelector('#feed');
  const showHoliday = () => feedButton?.setAttribute('aria-pressed', String(storm.state.holidayOn));
  feed = (on) => {
    const now = typeof on === 'boolean' ? storm.setHoliday(on) : storm.toggleHoliday();
    if (!capture) try { localStorage.setItem(HOLIDAY_KEY, now ? '1' : '0'); } catch {}
    showHoliday();
  };
  updateControls = installControls({
    stage, isPaused: () => paused, isRunning: running,
    pause: window.scenePause, feed: () => feed(), feedIcon: 'lights', quality: () => quality,
    setQuality(value) { quality = qualityName(value); autoScale = 1; resize(); restart(); },
  });
  showHoliday();
  document.addEventListener('visibilitychange', () => { glass.lift(); if (!document.hidden) { resize(false); if (paused) render(); } restart(); });
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  motionQuery.addEventListener('change', (event) => { if (!isHost && event.matches) { paused = true; restart(); } });
  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); contextLost = true; restart(); loading.hidden = false; });
  canvas.addEventListener('webglcontextrestored', () => { contextLost = false; resize(false); render(); restart(); });
  if (navigator.getBattery && !isHost) {
    navigator.getBattery().then((battery) => { function update() { onBattery = !battery.charging; resize(); restart(); } battery.addEventListener('chargingchange', update); update(); }).catch(() => {});
  }

  // Capture mode advances the actual storm and pane, then renders the actual scene. The
  // pane's memory is brought up to date ten times a second on the way.
  const advance = (seconds) => {
    for (let i = 0, n = Math.round(seconds / FIXED_STEP); i < n; i++) { advanceOne(); if (i % 6 === 5) { remember(unremembered); unremembered = 0; } }
  };
  if (capture) {
    if (params.has('clear')) setClear(Number(params.get('clear')) || 0);
    advance(Math.min(120, Math.max(0, Number(params.get('time')) || 0)));
  }
  render();
  loop = createFrameLoop(renderFrame, { fps: fps(), paused, hidden: document.hidden || contextLost || zeroSize });
  restart();
  const gl = renderer.getContext();
  window.lakeStorm = {
    ready: true,
    diagnostics: () => ({
      ...storm.diagnostics(), ...glass.diagnostics(), moon: storm.moon(aspect), frames, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      pixels: [canvas.width, canvas.height], quality, effectiveFPS: running() ? fps() : 0, renderScale: ratio, cpuFrameEMA: cpuEMA,
      scheduled: loop.state.pending, paused, hostRate, hidden: document.hidden, contextLost, webgl: 'WebGL2', renderer: gl.getParameter(gl.RENDERER),
    }),
    state: () => ({ ...storm.state }),
    pause(value = true) { paused = Boolean(value); restart(); },
    advance(seconds) {
      if (!paused) throw new Error('Pause before advancing deterministic capture time.');
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 120) throw new RangeError('Advance must be 0–120 seconds.');
      advance(seconds); render();
    },
    // Frame fractions from the top left, or nothing to take the hand off the glass.
    cursor(x, y) { if (x === undefined) glass.lift(); else glass.wipe(x * aspect, 1 - y); if (paused) render(); },
    holiday(on) { feed(on); if (paused) render(); },
    // For captures: a strike or a gust on demand, and a clean pane to see the yard through.
    strike: (bolt = true, x = 0.5, peak = 1) => storm.strike(bolt, { x, peak }),
    gust: (strength = 1, direction = 1, duration = 4) => storm.gust(strength, direction, duration),
    clear(value = 1) { setClear(value); if (paused) render(); },
  };
  window.sceneStats = window.lakeStorm.diagnostics;
  if (params.get('diagnostics') === '1') {
    const { installDiagnostics } = await import('../../shared/diagnostics.js');
    installDiagnostics({ renderer, loop, renderFrame, stats: window.sceneStats });
  }
  // Release owned GPU objects and stop callbacks when a page is really discarded.
  // BFCache pages retain resources and restart from their old storm time.
  addEventListener('pagehide', (event) => {
    loop.setHidden(true); if (event.persisted) return; disposed = true; loop.dispose(); observer.disconnect(); dispose();
  });
  addEventListener('pageshow', (event) => { if (event.persisted) { resize(false); render(); restart(); } });
}
start().catch(reportSceneError);
