// What stands in the yard, as numbers: where the pines' boughs spring from, how the boulders
// lie, each blade of grass. Positions across the frame are fractions of its width so the
// composition holds from 16:10 to an ultrawide; sizes are in window heights.
import { PIT } from './storm.js';

export const BOUGH_FLOATS = 12, ROCK_FLOATS = 6, BLADE_FLOATS = 8, TRUNK_FLOATS = 7;
export const BULB_GAP = 0.045, SPLASH_PARTS = 6;
// Two big Jeffrey pines frame the view and a slimmer one stands behind each (drawn first).
// `skirt` is how far up the bare trunk the crown begins, `limbs` how many boughs reach out
// of it and `inner` how many fill its heart, `shade` and `lit` how much the night air and
// the cabin's light reach it.
export const PINES = Object.freeze([
  { x: 0.140, base: -0.06, height: 0.80, width: 0.15, skirt: 0.44, seed: 2.9, shade: 0.88, lit: 0.6, limbs: 46, inner: 40 },
  { x: 0.865, base: -0.06, height: 0.74, width: 0.16, skirt: 0.46, seed: 6.1, shade: 0.88, lit: 0.6, limbs: 44, inner: 40 },
  { x: 0.07, base: -0.10, height: 1.07, width: 0.25, skirt: 0.40, seed: 1.3, shade: 1, lit: 1, limbs: 74, inner: 64 },
  { x: 0.95, base: -0.10, height: 0.97, width: 0.22, skirt: 0.42, seed: 4.7, shade: 1, lit: 1, limbs: 68, inner: 60 },
]);
export const boughCount = tree => tree.limbs + tree.inner;
// Granite moved aside when the beach was cleared: [x, y, half-width, half-height]. The
// middle of the beach stays open.
export const BOULDERS = Object.freeze([
  [0.272, 0.193, 0.022, 0.013], [0.228, 0.212, 0.058, 0.046], [0.196, 0.196, 0.040, 0.024], [0.160, 0.222, 0.070, 0.062], [0.108, 0.198, 0.046, 0.030], [0.040, 0.212, 0.092, 0.068],
  [0.728, 0.193, 0.020, 0.012], [0.762, 0.214, 0.064, 0.052], [0.800, 0.196, 0.036, 0.022], [0.846, 0.206, 0.050, 0.040], [0.900, 0.196, 0.034, 0.022], [0.962, 0.212, 0.090, 0.066],
]);
export const CHAIR_REACH = 0.132;

export function buildBoughs(aspect, random, tree) {
  const out = [], x0 = tree.x * aspect, slim = Math.min(1, Math.max(0.62, aspect / 2.39));
  // An open, uneven crown: broadest a third of the way up it, rounded at the top, and no two
  // limbs the same length, so sky shows between them.
  const reach = c => tree.width * slim * (0.42 + 0.58 * Math.sin(Math.PI * Math.pow(c, 0.8))) * (1 - 0.62 * c * c);
  const add = (c, side, len, rise, across, shade) => {
    const t = tree.skirt + (1 - tree.skirt) * c, taper = 0.028 * Math.max(0, 1 - t * 1.03) * (tree.width / 0.3 + 0.35);
    out.push(x0 + side * (across ? -len * across : taper * 0.4), tree.base + t * tree.height, t, tree.seed,
      len, side > 0 ? rise : Math.PI - rise, Math.floor(random() * 8), tree.shade * shade, random(), side, tree.lit, 0);
  };
  // Tufts in the heart of the crown first, then the limbs that reach out over them.
  for (let i = 0; i < tree.inner; i++) {
    const c = 0.03 + 0.95 * Math.pow((i + random()) / tree.inner, 0.9), side = random() < 0.5 ? 1 : -1;
    add(c, side, reach(c) * (0.5 + 0.5 * random()) + 0.03, -0.3 + 0.7 * c + (random() - 0.5) * 0.9, 0.35 + 0.35 * random(), 0.70 + 0.2 * random());
  }
  for (let i = 0; i < tree.limbs; i++) {
    const c = Math.pow((i + random()) / tree.limbs, 0.85), side = (i + (random() < 0.25 ? 1 : 0)) % 2 ? 1 : -1;
    // One side is fuller than the other, and which side changes up the trunk.
    const lop = 1 + side * 0.35 * Math.sin(tree.seed * 3.1 + c * (4 + tree.seed % 3));
    // Here and there a limb is short or broken off, and the sky shows through.
    const gap = Math.sin(c * 19 + tree.seed * 5 + side) > 0.55 ? 0.45 : 1;
    const len = reach(c) * lop * gap * (0.40 + 0.7 * Math.pow(random(), 0.7)) + 0.03;
    // Low limbs hang and turn up at the tip; high ones climb.
    add(c, side, len, -0.50 + 1.0 * c + (random() - 0.5) * 0.60, 0, 0.85 + 0.3 * random());
  }
  return new Float32Array(out);
}

// A trunk: a tapering strip, [x, y, t, across, seed, shade, how far into the crown] per vertex.
const TRUNK_SEGMENTS = 36;
export function buildTrunk(aspect, tree) {
  const out = [], x0 = tree.x * aspect, wide = 0.028 * (tree.width / 0.3 + 0.35);
  const at = (j, u) => { const t = j / TRUNK_SEGMENTS; return [x0 + u * wide * Math.max(0, 1 - t * 1.03) * (1 + 0.5 * Math.exp(-t * 14)), tree.base + t * tree.height, t, u, tree.seed, tree.shade, Math.min(1, Math.max(0, (t - tree.skirt) * 9))]; };
  for (let j = 0; j < TRUNK_SEGMENTS; j++) out.push(...at(j, -1), ...at(j, 1), ...at(j + 1, 1), ...at(j, -1), ...at(j + 1, 1), ...at(j + 1, -1));
  return new Float32Array(out);
}

export function buildBoulders(aspect, random) {
  const out = [];
  // Farthest first, so nearer stones overlap those behind.
  for (const [x, y, rx, ry] of [...BOULDERS].sort((a, b) => (b[1] - b[3] * 0.55) - (a[1] - a[3] * 0.55))) out.push(x * aspect, y, rx, ry, 1 + random() * 20, 0.85 + random() * 0.3);
  return new Float32Array(out);
}

// Grass under the rail in five ranks, tall and near at the bottom of the frame, short and
// far just under the rail: [x, base, height, seed, half-width, lean, shade, rank].
export function buildGrass(aspect, random) {
  const out = [], ranks = [[0.108, 0.036, 0.62], [0.086, 0.044, 0.72], [0.060, 0.052, 0.82], [0.030, 0.062, 0.92], [-0.004, 0.072, 1]];
  ranks.forEach(([base, height, shade], rank) => {
    const count = Math.round(aspect * (250 - rank * 24));
    for (let i = 0; i < count; i++) {
      // It grows in tussocks, not as a lawn.
      const x = (i + random()) / count * aspect, tall = random();
      const clump = 0.5 + 0.5 * Math.sin(x * 23 + rank * 1.7) * Math.sin(x * 7.3 + rank * 4.1) + 0.3 * Math.sin(x * 61 + rank);
      out.push(x, base + (random() - 0.5) * 0.02, height * (0.25 + 0.75 * tall * tall * tall + 0.2 * random()) * (0.45 + 0.95 * clump), random(),
        0.0009 + 0.0013 * random() + rank * 0.00022, (random() - 0.5) * 0.9, shade * (0.55 + 0.4 * random() + 0.35 * clump), rank);
    }
  });
  return new Float32Array(out);
}

export const bulbCount = aspect => Math.ceil(aspect / BULB_GAP);
export const splashCount = aspect => Math.round(aspect * 260) * SPLASH_PARTS;
export const chairs = aspect => new Float32Array([PIT.x * aspect - CHAIR_REACH, PIT.y - 0.018, 1, PIT.x * aspect + CHAIR_REACH, PIT.y - 0.018, -1]);

// Eight limbs of Jeffrey pine, drawn once: bare wood for the first third, then side twigs
// each ending in a round tuft of long needles, the way the tree carries them. Brightness is
// how much light a needle would catch (most on the upper side); alpha is the limb's shape.
// `context` is a 2D canvas context 1024 x 1024.
export function paintBoughs(context, random) {
  const W = 512, H = 256;
  context.clearRect(0, 0, W * 2, H * 4);
  context.lineCap = 'round';
  for (let v = 0; v < 8; v++) {
    const ox = (v % 2) * W, oy = Math.floor(v / 2) * H;
    context.save();
    context.beginPath(); context.rect(ox + 2, oy + 2, W - 4, H - 4); context.clip();
    context.translate(ox, oy + H / 2);
    const sag = 0.4 + random() * 0.7;
    const limb = u => [24 + u * 420, 30 * sag * Math.sin(u * 2.4) - 46 * u * u * u];
    const wood = (x0, y0, x1, y1, width) => {
      context.strokeStyle = 'rgba(30,30,30,1)'; context.lineWidth = width;
      context.beginPath(); context.moveTo(x0, y0); context.lineTo(x1, y1); context.stroke();
    };
    // A tuft: a brush of long fine needles sweeping forward off the twig's end and drooping
    // under their own wet weight. Many and thin, so it reads as a mass and not as a leaf.
    const tuft = (x, y, heading, size, pass) => {
      const needles = pass ? 70 : 90;
      for (let n = 0; n < needles; n++) {
        const off = (random() + random() - 1) * (pass ? 1.5 : 1.9), a = heading + off;
        const len = size * (1.15 - 0.30 * Math.abs(off)) * (0.55 + 0.6 * random()), droop = len * (0.22 + 0.25 * random());
        // Needles on the upper side catch what light there is.
        const up = Math.max(0, -Math.sin(a)), light = Math.round(255 * Math.min(1, pass ? 0.22 + 0.78 * up * (0.4 + 0.6 * random()) : 0.13 + 0.12 * random()));
        context.strokeStyle = `rgba(${light},${light},${light},${pass ? 0.75 : 1})`;
        context.lineWidth = pass ? 0.7 + random() * 0.5 : 1.3 + random() * 1.1;
        const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len + droop;
        context.beginPath(); context.moveTo(x, y); context.quadraticCurveTo(x + Math.cos(a) * len * 0.55, y + Math.sin(a) * len * 0.55, ex, ey); context.stroke();
      }
    };
    for (let i = 0; i < 40; i++) { const a = limb(i / 40), b = limb((i + 1) / 40); wood(a[0], a[1], b[0], b[1], 7 - 5 * i / 40); }
    const tufts = [];
    const count = 15 + Math.floor(random() * 6);
    for (let k = 0; k < count; k++) {
      const u = 0.22 + 0.78 * (k + random() * 0.8) / count, [sx, sy] = limb(u);
      const side = k % 2 ? 1 : -1, out = (4 + 40 * random() * random()) * (1.1 - 0.5 * u);
      const heading = side * (0.25 + 0.75 * random()) + 0.10;
      const ex = sx + Math.cos(heading) * out, ey = sy + Math.sin(heading) * out;
      wood(sx, sy, ex, ey, 2.6 - 1.4 * u);
      tufts.push([ex, ey, heading * 0.7 + 0.12, (30 + 34 * random() * random()) * (1.15 - 0.4 * u)]);
    }
    const [tx, ty] = limb(1);
    tufts.push([tx, ty, 0.0, 44]);
    // The dark body of every tuft first, then the lit needles over them all.
    for (const pass of [0, 1]) for (const [x, y, heading, size] of tufts) tuft(x, y, heading, size, pass);
    context.restore();
  }
}
