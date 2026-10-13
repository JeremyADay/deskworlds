// The storm itself: the wind and its gusts, the lightning, the clouds' drift, the moon's crawl
// along the ridge, the embers in the pit and the Holiday Lights switch. No drawing here.
// Lengths are in window heights: x runs 0..aspect across the glass, y runs 0 (sill) to 1 (top).
export const FIXED_STEP = 1 / 60;

// Where things stand in the frame. Across the frame positions are fractions of its width.
export const RAIL_TOP = 0.168, RAIL_BOTTOM = 0.150, SHORE = 0.300, NEAR_SHORE = 0.218;
export const PIT = Object.freeze({ x: 0.40, y: 0.196 });
// The moon takes fifty minutes to creep from `from` to `to` (fractions of the width), sets
// behind the ridge there, and a couple of minutes later rises again where it began.
export const MOON = Object.freeze({ from: 0.20, to: 0.62, crossing: 3000, away: 150, turn: 50, radius: 0.030, lift: -0.010 });
// The ridge and the nearer hills are fixed country, sampled once into a strip the shaders read.
export const PROFILE = Object.freeze({ samples: 4096, width: 4 });
// How far a strike lifts the picture, in the scene's linear light before the display curve:
// the whole sky, clouds over the whole sky, and the glow in the clouds around the strike.
export const FLASH = Object.freeze({ sky: [0.09, 0.10, 0.15], cloud: [0.20, 0.21, 0.30], glow: [0.34, 0.36, 0.50], land: [0.08, 0.09, 0.13], lake: [0.12, 0.13, 0.19], fog: [0.035, 0.037, 0.05] });
export const DISPLAY_GAMMA = 1.55, EXPOSURE = 1.26;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// Per-second easing that gives the same motion at any step length.
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

function lattice(i, seed) {
  let n = Math.imul(i | 0, 374761393) + Math.imul(seed | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function noise(x, seed) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lattice(i, seed) * (1 - u) + lattice(i + 1, seed) * u;
}
function fbm(x, seed) {
  let v = 0, a = 0.5;
  for (let i = 0; i < 4; i++) { v += a * noise(x, seed + i); x = x * 2.03 + 1.7; a *= 0.5; }
  return v;
}
const ridged = (x, seed) => 1 - Math.abs(noise(x, seed) * 2 - 1);
// Straight runs between random heights: the angular line of broken granite.
function crags(x, seed) { const i = Math.floor(x), f = x - i; return lattice(i, seed) * (1 - f) + lattice(i + 1, seed) * f; }

// The far ridge: broad shoulders, sharp secondary peaks and a ragged line of treetops, the
// way the San Bernardinos look from the lake. Never a smooth hump.
export function ridgeHeight(x) {
  return 0.47 + fbm(x * 1.7, 11) * 0.12 + crags(x * 6.1, 23) * 0.042 + crags(x * 14.3 + 4, 31) * 0.020 + crags(x * 37 + 9, 33) * 0.008
    + (noise(x * 28, 37) - 0.5) * 0.010 + noise(x * 90, 41) ** 2 * 0.004 + lattice(Math.floor(x * 420), 43) * noise(x * 60, 47) * 0.0035;
}
// The nearer wooded hills that run down to the far shore.
export function hillHeight(x) {
  return 0.318 + fbm(x * 3 + 7, 53) * 0.085 + crags(x * 4.3 + 2, 57) * 0.030 + crags(x * 11, 59) * 0.020 + (noise(x * 40, 61) - 0.5) * 0.006 + lattice(Math.floor(x * 520), 67) * 0.0022;
}
// The ridge's broad shape without its crags, for light that falls off down the slopes.
export const ridgeShoulder = x => 0.47 + fbm(x * 1.7, 11) * 0.12 + 0.03;
// Per sample: the ridge, the hills, the ridge's shoulder, and a spare.
export function profileStrip() {
  const data = new Float32Array(PROFILE.samples * 4);
  for (let i = 0; i < PROFILE.samples; i++) {
    const x = (i + 0.5) / PROFILE.samples * PROFILE.width;
    data[i * 4] = ridgeHeight(x); data[i * 4 + 1] = hillHeight(x); data[i * 4 + 2] = ridgeShoulder(x);
  }
  return data;
}

// The moon creeps along the ridge, about half of it always behind the rock. Its height follows
// the ridge averaged over its own width, and is kept high enough that no crag swallows it.
// It only ever travels left to right, at one steady pace. `up` is 1 while it rides the ridge
// and falls to 0 as it sets. On a narrow screen the pines stand further in, so it starts clear of them.
export function moonPosition(time, aspect) {
  const u = (time + MOON.turn) % (MOON.crossing + MOON.away);
  const from = MOON.from + 0.07 * clamp((2.39 - aspect) / 0.79, 0, 1);
  const x = from + (MOON.to - from) * Math.min(1, u / MOON.crossing);
  const up = smooth(0, MOON.turn, u) * (1 - smooth(MOON.crossing - MOON.turn, MOON.crossing, u));
  let ridge = 0, highest = -Infinity;
  for (let i = -8; i <= 8; i++) { const r = ridgeHeight(x * aspect + i * MOON.radius / 8); ridge += r; highest = Math.max(highest, r); }
  return { x, y: Math.max(ridge / 17 + MOON.lift, highest - MOON.radius * 0.45) - (1 - up) * MOON.radius * 2.6, up };
}

// A strike's light: the glow in the cloud rises in a tenth of a second, falls away over half
// a second and flickers once; a bolt holds a little longer and restrikes twice.
export function glowEnvelope(dt) {
  if (dt < 0) return 0;
  const main = dt < 0.12 ? dt / 0.12 : Math.exp(-(dt - 0.12) / 0.5);
  const echo = dt > 0.3 ? 0.5 * Math.exp(-(((dt - 0.4) / 0.08) ** 2)) : 0;
  return Math.min(1, main + echo);
}
export function boltEnvelope(dt) {
  if (dt < 0.05 || dt > 0.8) return 0;
  const k = dt - 0.05;
  return Math.min(1, Math.exp(-k / 0.13) + 0.42 * Math.exp(-(((k - 0.22) / 0.05) ** 2)) + 0.22 * Math.exp(-(((k - 0.40) / 0.05) ** 2)));
}

// The display curve the glass applies last, and the brightest a strike can make a patch of
// cloud, of bare sky, of the land and of the fogged pane. Shared with the shaders through
// FLASH so the picture cannot be made to flash white without this changing too.
export const display = v => Math.max(0, v * EXPOSURE) ** (1 / DISPLAY_GAMMA);
export function flashLuma(state, kind, distance = 0) {
  const luma = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const near = state.glow * Math.exp(-distance * distance * 2.2);
  const add = (base, parts) => base.map((b, i) => b + parts.reduce((s, [k, c]) => s + k * c[i], 0));
  const lit = kind === 'cloud' ? add([0.075, 0.08, 0.098], [[state.amb, FLASH.sky], [state.amb, FLASH.cloud], [near * 1.35, FLASH.glow]])
    : kind === 'sky' ? add([0.05, 0.055, 0.072], [[state.amb, FLASH.sky], [near * 0.25, FLASH.glow]])
    : kind === 'lake' ? add([0.022, 0.026, 0.036], [[state.amb, FLASH.lake]])
    : add([0.012, 0.014, 0.02], [[state.amb, FLASH.land]]);
  // Fog on the pane dims what is behind it and lifts a little with the flash.
  return display(luma(lit.map((c, i) => c * 0.90 + 0.016 + state.amb * FLASH.fog[i])));
}

export function createStorm({ random = Math.random, holiday = false } = {}) {
  const gusts = [], strikes = [];
  let nextGust = 4, nextStrike = 2.5, lean = 0, smoke = 0, steady = 0.6, fire = 1, ember = 0.7;
  const state = {
    time: 0, level: 0.8, gust: 0, smoke: 0, wind: 0.6, rain: 0.85, sway: 1.3, cloudX: 0,
    glow: 0, glowX: 0.5, glowY: 0.7, bolt: 0, boltX: 0.5, boltSeed: 0, amb: 0,
    fire: 1, ember: 0.7, holiday: holiday ? 1 : 0, holidayOn: Boolean(holiday), strikes: 0, bolts: 0, gusts: 0,
  };
  // The storm breathes over about three minutes but is a good one from the first frame.
  const level = t => 0.72 + 0.18 * (0.5 - 0.5 * Math.cos((t / 170 + 0.32) * Math.PI * 2));

  function strike(bolt = random() < 0.35, { x = 0.12 + random() * 0.76, peak = 0.65 + random() * 0.35 } = {}) {
    strikes.push({ t: state.time, x, y: 0.62 + random() * 0.22, peak, bolt: Boolean(bolt), seed: random() * 100 });
    state.strikes++; if (bolt) state.bolts++;
  }
  // How long until the next: a quarter of the time soon, usually a middling wait, now and then a lull.
  function spell(soon, soonTo, usual, usualTo, lull, lullTo) {
    const r = random(), u = random();
    return r < 0.25 ? soon + u * (soonTo - soon) : r < 0.85 ? usual + u * (usualTo - usual) : lull + u * (lullTo - lull);
  }
  function gust(strength = (0.25 + random() * random() * 1.25) * (0.35 + state.level), direction = random() < 0.8 ? 1 : -1, duration = 2 + random() * 3.5) {
    gusts.push({ t: state.time, dur: duration, str: strength, dir: direction });
    state.gusts++;
  }

  function step(dt) {
    const t = state.time += dt;
    const S = state.level = level(t);
    // The wind comes in pushes, mostly from the left. Each rises in about a second, holds
    // and dies away over three; the trees, the rain and the drops lean with it at once.
    // Wind has no metronome: sometimes one push follows hard on another, sometimes it holds off.
    if (t > nextGust) { gust(); nextGust = t + spell(2, 4, 5, 16, 22, 45); }
    let push = 0;
    for (let i = gusts.length - 1; i >= 0; i--) {
      const g = gusts[i], d = t - g.t;
      if (d > g.dur + 4) { gusts.splice(i, 1); continue; }
      const env = d < 1.2 ? d / 1.2 : d < g.dur ? 1 : Math.max(0, 1 - (d - g.dur) / 3);
      push += g.str * g.dir * env * (0.85 + 0.15 * Math.sin(t * 9 + g.t));
    }
    lean += ((0.12 + 0.10 * Math.sin(state.time * 0.21) + 0.08 * Math.sin(state.time * 0.057 + 1.3)) * S + push - lean) * ease(3.7, dt);
    // The smoke hears about a gust a moment after the trees do.
    smoke += (lean - smoke) * ease(1.2, dt);
    // The hardest gusts press toward a limit, never against a stop.
    state.gust = Math.tanh(lean * 1.15);
    state.smoke = Math.tanh(smoke * 1.15);
    state.wind = Math.min(1.7, 0.1 + 0.5 * S + Math.abs(lean) * 0.8);
    state.rain = Math.min(1.25, 0.15 + 0.85 * S);
    state.sway = 0.4 + state.wind * 1.5;
    // Clouds are too big and too far to gust: they take the wind averaged over many seconds
    // and only ever travel one way.
    steady += (state.wind - steady) * ease(0.12, dt);
    state.cloudX += dt * 0.012 * (0.6 + 0.4 * Math.min(1.5, steady));

    // Nor has lightning: a strike often has a second close behind, and then the sky may sulk.
    if (t > nextStrike) { strike(); nextStrike = t + spell(0.5, 2.5, 3, 9, 13, 26); }
    let glow = 0, bolt = 0, amb = 0;
    for (let i = strikes.length - 1; i >= 0; i--) {
      const s = strikes[i], age = t - s.t;
      if (age > 4) { strikes.splice(i, 1); continue; }
      const g = glowEnvelope(age) * s.peak;
      if (g > glow) { glow = g; state.glowX = s.x; state.glowY = s.y; }
      amb = Math.max(amb, g * (s.bolt ? 0.4 : 0.22));
      if (s.bolt) {
        const b = boltEnvelope(age) * s.peak;
        if (b > bolt) { bolt = b; state.boltX = s.x; state.boltSeed = s.seed; }
        amb = Math.max(amb, b);
      }
    }
    state.glow = glow; state.bolt = bolt; state.amb = amb;

    // The fireplace behind you flickers quickly; the embers in the pit breathe slowly and
    // the rain keeps them low.
    fire += (0.8 + 0.25 * Math.sin(t * 7.3) * Math.sin(t * 2.9) + 0.2 * random() - fire) * ease(9.7, dt);
    ember += (0.75 + 0.2 * Math.sin(t * 1.7) * Math.sin(t * 0.6) - 0.25 * state.rain + 0.08 * random() - ember) * ease(3.1, dt);
    state.fire = fire;
    state.ember = Math.max(0.2, ember) * (0.88 + 0.12 * Math.sin(t * 5.1) * Math.sin(t * 3.3));
    // The bulbs change over in about a second, not at a snap.
    state.holiday += ((state.holidayOn ? 1 : 0) - state.holiday) * ease(2.4, dt);
    if (Math.abs((state.holidayOn ? 1 : 0) - state.holiday) < 0.002) state.holiday = state.holidayOn ? 1 : 0;
  }

  return {
    state, step, strike, gust,
    setHoliday(on) { state.holidayOn = Boolean(on); return state.holidayOn; },
    toggleHoliday() { state.holidayOn = !state.holidayOn; return state.holidayOn; },
    moon: aspect => moonPosition(state.time, aspect),
    diagnostics: () => ({
      time: state.time, level: state.level, gust: state.gust, wind: state.wind, strikes: state.strikes, bolts: state.bolts, gusts: state.gusts,
      holiday: state.holidayOn, finite: Object.values(state).every(v => typeof v !== 'number' || Number.isFinite(v)),
    }),
  };
}
export { smooth, clamp };
