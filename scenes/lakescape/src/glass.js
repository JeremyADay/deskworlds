// The window pane: the beads of rain standing on it, the drops that run down it in fits and
// starts, and the hand that wipes it. The fog itself lives on the GPU (see render.js); this
// keeps the drops and says where the hand has been.
// Lengths are in window heights: x runs 0..aspect, y runs 0 (sill) to 1 (top).
import { clamp, smooth } from './storm.js';

// The hand is as wide as `width` of the pane (never more than `maxWidth` of its height).
// A wiped patch stays clear of fog for most of a minute and has fogged over again after two;
// its beads come back one at a time over about fifteen seconds. A running drop's track heals
// in a few seconds.
export const WIPE = Object.freeze({ width: 0.13, maxWidth: 0.31, fogBack: 120, fogKnee: 0.6, beadFrom: 2, beadBack: 15, trailBack: 2.0 });
export const CELL = 1 / 38;
export const MAX_RUNNERS = 260, MAX_STAMPS = 2048;
export const FRAME = 0.016;

// How clear a patch still is, `age` seconds after the hand passed (1 clear, 0 fogged).
export const fogClear = age => smooth(0, WIPE.fogKnee, 1 - age / WIPE.fogBack);

// A hand pressed flat to the glass: a palm with four fingertips above it. Offsets are in hand
// widths, y up. Positive inside, falling to zero at the outline. The stamp shader draws the
// same shape from these numbers.
// The palm is a rounded shape (half-width, half-height, squareness, and how much it narrows
// toward the heel of the hand). Each digit is an ellipse:
// [x, y, half-width, half-length, lean]. Four fingertips stand on the palm and the thumb's
// tip shows at its side.
export const PALM = Object.freeze([0.44, 0.40, 2.7, 0.20]);
export const DIGITS = Object.freeze([
  [-0.32, 0.42, 0.090, 0.16, -0.22], [-0.115, 0.50, 0.098, 0.195, -0.07], [0.10, 0.505, 0.100, 0.199, 0.04], [0.315, 0.44, 0.094, 0.17, 0.20],
  [-0.50, 0.03, 0.095, 0.20, -0.55],
]);
export const FINGERS = DIGITS.slice(0, 4);
export function handCover(dx, dy) {
  const heel = 1 - PALM[3] * clamp(-dy / PALM[1], 0, 1);
  let cover = 1 - (Math.abs(dx / (PALM[0] * heel)) ** PALM[2] + Math.abs(dy / PALM[1]) ** PALM[2]) ** (1 / PALM[2]);
  for (const [x, y, rx, ry, lean] of DIGITS) {
    const s = Math.sin(lean), c = Math.cos(lean), u = dx - x, v = dy - y;
    cover = Math.max(cover, 1 - Math.hypot((u * c - v * s) / rx, (u * s + v * c) / ry));
  }
  return cover;
}
export const handWidth = aspect => Math.min(WIPE.width * aspect, WIPE.maxWidth);

export function createGlass({ random = Math.random, aspect = 16 / 9 } = {}) {
  let cols = 0, rows = 0, slots = 0, time = 0, last = null, spawn = 0, wipes = 0;
  // Each cell of the pane holds at most one bead: where it sits, how big it gets, when it
  // forms and when it is gone.
  let bx, by, target, born, until;
  const runners = [];
  let drops = new Float32Array(0), count = 0;
  const stamps = new Float32Array(MAX_STAMPS * 4);
  let stampCount = 0;

  function seat(i, at, sure = false, life = 18 + random() * 50) {
    const cx = i % cols, cy = (i / cols) | 0;
    bx[i] = (cx + 0.15 + random() * 0.7) * CELL; by[i] = (cy + 0.15 + random() * 0.7) * CELL;
    const u = random();
    target[i] = 0.0006 + 0.0034 * u * u + 0.0092 * u ** 6;
    // Rain gathers in patches: some of the pane stands thick with beads, some nearly bare.
    const patch = 0.5 + 0.5 * Math.sin(bx[i] * 9.1 + 1.3) * Math.sin(by[i] * 11.7 + bx[i] * 3.1) + 0.25 * Math.sin(bx[i] * 31 + by[i] * 23);
    if (!sure && random() > 0.15 + 0.95 * patch) at += 6 + random() * 30;
    born[i] = at; until[i] = at + life;
  }
  function resize(next) {
    aspect = next;
    cols = Math.ceil(aspect / CELL); rows = Math.ceil(1 / CELL); slots = cols * rows;
    bx = new Float32Array(slots); by = new Float32Array(slots); target = new Float32Array(slots);
    born = new Float64Array(slots); until = new Float64Array(slots);
    // A pane the rain has been on for a while, not one it has just started on.
    for (let i = 0; i < slots; i++) { seat(i, time); born[i] -= random() * (until[i] - time) * 0.9; if (random() < 0.3) born[i] = time + random() * 12; }
    drops = new Float32Array((slots + MAX_RUNNERS) * 4);
    for (let i = runners.length - 1; i >= 0; i--) if (runners[i].x > aspect) runners.splice(i, 1);
    last = null;
  }
  resize(aspect);
  const alive = i => time >= born[i] && time < until[i];
  const slotAt = (x, y) => { const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL); return cx < 0 || cy < 0 || cx >= cols || cy >= rows ? -1 : cy * cols + cx; };
  function stamp(x, y, size, kind) {
    if (stampCount >= MAX_STAMPS) return;
    stamps.set([x, y, size, kind], stampCount++ * 4);
  }

  // One print of the hand at (x, y): the fog under it is gone and so is every drop.
  function print(x, y, w) {
    stamp(x, y, w, 0);
    const x0 = Math.max(0, Math.floor((x - 0.72 * w) / CELL)), x1 = Math.min(cols - 1, Math.floor((x + 0.6 * w) / CELL));
    const y0 = Math.max(0, Math.floor((y - 0.5 * w) / CELL)), y1 = Math.min(rows - 1, Math.floor((y + 0.9 * w) / CELL));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const i = cy * cols + cx;
      if (handCover((bx[i] - x) / w, (by[i] - y) / w) <= 0) continue;
      // A bead the hand took comes back where it stood, in its own time.
      seat(i, time + WIPE.beadFrom + random() * (WIPE.beadBack - WIPE.beadFrom), true);
    }
    for (let i = runners.length - 1; i >= 0; i--) if (handCover((runners[i].x - x) / w, (runners[i].y - y) / w) > 0) runners.splice(i, 1);
    // The water the palm pushes off gathers under it, and now and then a drop of it runs.
    if (random() < 0.15 && runners.length < MAX_RUNNERS) runners.push({ x: x + (random() - 0.5) * 0.7 * w, y: y - 0.43 * w, r: 0.005 + 0.003 * random(), stuck: 0.2 + random(), slide: 0.05 + random() * 0.3, veer: 0, seed: random() * 40, stretch: 1, trail: 0, pearl: 0 });
  }
  // The cursor moved to (x, y): the hand sweeps there from where it was.
  function wipe(x, y) {
    if (!(Number.isFinite(x) && Number.isFinite(y))) return;
    const w = handWidth(aspect), from = last || { x, y };
    const dx = x - from.x, dy = y - from.y, steps = Math.min(96, Math.max(1, Math.ceil(Math.hypot(dx, dy) / (w * 0.05))));
    // No hand travels dead straight: it rides up and down a little as it goes.
    const wobble = (px, py) => w * 0.045 * (Math.sin(px * 19 + py * 7) + Math.sin(px * 7.3 - py * 13 + 1));
    for (let i = 1; i <= steps; i++) { const px = from.x + dx * i / steps, py = from.y + dy * i / steps; print(px, py + wobble(px, py), w); }
    last = { x, y }; wipes++;
  }

  function step(dt, gust = 0, rain = 1) {
    time += dt;
    const push = Math.abs(gust);
    // Beads that have had their time dry off or are knocked loose, and another forms nearby.
    for (let i = 0; i < slots; i++) if (time >= until[i]) seat(i, time + 1 + random() * 7);
    // Rain keeps landing: a heavy drop arrives somewhere and starts down the pane.
    spawn += dt * 0.85 * rain * aspect * (1 + 1.5 * push);
    while (spawn >= 1) {
      spawn -= 1;
      if (runners.length >= MAX_RUNNERS) continue;
      const u = random();
      runners.push({ x: random() * aspect, y: 0.15 + random() * 0.9, r: 0.0045 + 0.0042 * u * u, stuck: random() * 1.2, slide: 0.02 + random() * 0.2, veer: (random() - 0.5) * 0.3, seed: random() * 40, stretch: 1, trail: 0, pearl: 0 });
    }
    for (let i = runners.length - 1; i >= 0; i--) {
      const d = runners[i];
      if (d.stuck > 0) {
        // Held by the glass. A gust shakes it loose sooner and shoves it sideways meanwhile.
        d.stuck -= dt * (1 + 2.5 * push) * (d.r / 0.006);
        d.x += gust * 0.012 * dt;
        d.stretch += (1 - d.stretch) * Math.min(1, dt * 10);
        continue;
      }
      const speed = 0.07 + 0.55 * clamp((d.r - 0.004) / 0.005, 0, 1.4), move = speed * dt, fromX = d.x, fromY = d.y;
      d.y -= move;
      d.x += (gust * 0.85 + d.veer + Math.sin(d.y * 53 + d.seed) * 0.17 + Math.sin(d.y * 19 + d.seed * 2) * 0.09) * move;
      d.slide -= move; d.r -= move * 0.004;
      d.stretch += (1 + Math.min(0.7, speed * 1.6) - d.stretch) * Math.min(1, dt * 14);
      const at = slotAt(d.x, d.y);
      if (at >= 0 && alive(at) && Math.hypot(bx[at] - d.x, by[at] - d.y) < d.r + target[at]) {
        // It swallows the beads in its way and grows.
        d.r = Math.min(0.011, Math.sqrt(d.r * d.r + target[at] * target[at] * 0.5));
        seat(at, time + 3 + random() * 9);
      }
      // Its track is laid down unbroken however fast it falls.
      for (d.trail += move; d.trail > 0.002; d.trail -= 0.002) { const back = (d.trail - 0.002) / move; stamp(d.x + (fromX - d.x) * back, d.y + (fromY - d.y) * back + d.r * 0.5, d.r * 0.46, 1); }
      d.pearl += move;
      if (d.pearl > 0.012 && at >= 0) {
        // And leaves a string of small ones behind it.
        d.pearl = random() * 0.006;
        const above = slotAt(d.x, d.y + d.r * 1.6);
        if (above >= 0 && !alive(above) && random() < 0.7) {
          bx[above] = d.x + (random() - 0.5) * d.r * 0.4; by[above] = d.y + d.r * 1.6;
          target[above] = 0.0011 + 0.0013 * random(); born[above] = time - 1.2; until[above] = time + 5 + random() * 10;
        }
      }
      // Each slip is short and sets off a little to one side of the last.
      if (d.slide <= 0) { d.stuck = 0.15 + random() * random() * 2.6; d.slide = 0.02 + random() * random() * 0.22; d.veer = (random() - 0.5) * 0.3; }
      if (d.y < -0.02 || d.x < -0.02 || d.x > aspect + 0.02 || d.r < 0.0036) runners.splice(i, 1);
    }
  }

  // The drops as the renderer wants them: x, y, radius and how far each is stretched by its fall.
  function pack() {
    let n = 0;
    for (let i = 0; i < slots; i++) {
      if (!alive(i)) continue;
      const r = target[i] * smooth(0, 1.5, time - born[i]) * smooth(0, 1.2, until[i] - time);
      if (r < 0.0006) continue;
      // A bead big enough to feel its weight sags.
      drops[n++] = bx[i]; drops[n++] = by[i]; drops[n++] = r; drops[n++] = 1 + Math.max(0, r - 0.0035) * 55;
    }
    for (const d of runners) { drops[n++] = d.x; drops[n++] = d.y; drops[n++] = d.r; drops[n++] = d.stretch; }
    count = n / 4;
    return count;
  }

  return {
    step, wipe, resize, pack, runners,
    lift() { last = null; },
    get drops() { return drops; }, get count() { return count; },
    stamps, get stampCount() { return stampCount; }, clearStamps() { stampCount = 0; },
    // Beads standing within `radius` of a point, for tests and captures.
    beadsNear(x, y, radius) { let n = 0; for (let i = 0; i < slots; i++) if (alive(i) && Math.hypot(bx[i] - x, by[i] - y) < radius) n++; return n; },
    diagnostics: () => { let beads = 0; for (let i = 0; i < slots; i++) if (alive(i)) beads++; return { beads, runners: runners.length, slots, wipes, glassTime: time }; },
  };
}
