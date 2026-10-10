import assert from 'node:assert/strict';
import { createPond, fishCount, FIXED_STEP, PELLET } from '../src/pond.js';
import { randomGenerator } from '../../shared/random.js';

// A 3440 x 1440 frame: the pond shows 1.1 m from the middle to the top edge.
const halfH = 1.1, halfW = halfH * 3440 / 1440;
const pond = (seed, aspect = halfW / halfH) => createPond({ random: randomGenerator(seed), count: fishCount(aspect), halfW: halfH * aspect, halfH });
const run = (p, seconds, each = () => {}) => {
  for (let i = 0; i < Math.round(seconds / FIXED_STEP); i++) { each(i * FIXED_STEP); p.step(FIXED_STEP); p.impulses.length = 0; }
};
const angleSpread = (angles) => 1 - Math.hypot(angles.reduce((s, a) => s + Math.cos(a), 0), angles.reduce((s, a) => s + Math.sin(a), 0)) / angles.length;

// The cast: seven to ten fish on an ultrawide, fewer on a narrower screen, and the same seed
// always makes the same pond.
{
  assert.ok(fishCount(3440 / 1440) >= 7 && fishCount(3440 / 1440) <= 10, 'An ultrawide holds seven to ten koi');
  assert.ok(fishCount(16 / 9) <= fishCount(3440 / 1440), 'A narrower screen holds no more');
  const a = pond(4), b = pond(4);
  run(a, 20); run(b, 20);
  assert.deepEqual(a.fish.map((f) => [f.x, f.z, f.heading]), b.fish.map((f) => [f.x, f.z, f.heading]), 'Deterministic for a seed');
  assert.ok(new Set(a.fish.map((f) => f.variety)).size >= 6, 'A mix of varieties');
}

// Cruising: unhurried, in the pond, at a spread of depths, and never a synchronised school.
for (const seed of [1, 2, 3, 4, 5]) {
  const p = pond(seed);
  let maxSpeed = 0, outside = 0, samples = 0, spread = 0;
  run(p, 240, (t) => {
    for (const f of p.fish) {
      maxSpeed = Math.max(maxSpeed, f.speed);
      if (Math.abs(f.x) > halfW + 0.35 || Math.abs(f.z) > halfH + 0.3) outside++;
    }
    if (t > 20 && Math.round(t / FIXED_STEP) % 120 === 0) { spread += angleSpread(p.fish.map((f) => f.heading)); samples++; }
  });
  assert.ok(p.diagnostics().finite, 'State stays finite');
  assert.ok(maxSpeed < 0.45, `Cruising stays unhurried (${maxSpeed.toFixed(2)} m/s)`);
  assert.equal(outside, 0, 'Fish stay in the pond');
  assert.ok(spread / samples > 0.35, `Headings stay varied, not schooled (${(spread / samples).toFixed(2)})`);
  const depths = p.fish.map((f) => f.depth);
  assert.ok(Math.max(...depths) - Math.min(...depths) > 0.15, 'Some fish swim deeper than others');
}

// Pads keep to the edges and corners, clear of the middle of the frame and the icon band on the right.
for (const seed of [1, 2, 3, 4, 5, 6]) {
  const p = pond(seed);
  assert.ok(p.pads.length >= 12, 'Several clusters of pads');
  for (const pad of p.pads) {
    assert.ok(!(Math.abs(pad.x) < halfW * 0.45 && Math.abs(pad.z) < halfH * 0.5), 'No pad in the middle');
    assert.ok(pad.x < halfW * 0.7, 'No pad under the desktop icons');
    assert.ok(pad.z > -halfH * 0.75, 'No pad under the menu bar');
  }
  assert.ok(p.flowers.length >= 1 && p.flowers.length <= 2, 'One or two flowers');
}

// Feeding: a pinch lands with rings, the koi come up for it and eat every pellet with a gulp at
// the surface. It is not a scrum: the keen come first and some never bother, each fish takes a
// pellet and peels away rather than parking on the food, and bodies never pile up on each other.
let engagedAll = 0, castAll = 0;
for (const seed of [1, 2, 3, 4, 5, 6]) {
  const p = pond(seed);
  run(p, 10);
  p.pinch();
  // How many others at about its level have their middle within half a metre of a fish's.
  const near = (f) => p.fish.filter((g) => g !== f && Math.abs(g.depth - f.depth) < 0.1 && Math.hypot(g.x - f.x, g.z - f.z) < 0.5).length;
  const n = p.fish.length, ate = new Array(n).fill(0), still = new Array(n).fill(0), engaged = new Set();
  let rings = 0, gulpDepth = Infinity, closest = Infinity, longestStill = 0, pile = 0;
  for (let i = 0; i < Math.round(40 / FIXED_STEP) && p.pellets.length; i++) {
    const before = p.stats.eaten, gulps = p.fish.map((f) => f.gulp);
    p.step(FIXED_STEP);
    rings += p.impulses.length / 4;
    p.impulses.length = 0;
    p.fish.forEach((f, k) => {
      if (f.mode === 'feed') engaged.add(k);
      if (p.stats.eaten > before && f.mode === 'feed' && f.gulp > gulps[k] + 0.5) { ate[k]++; gulpDepth = Math.min(gulpDepth, f.depth); }
      still[k] = f.mode === 'feed' && Math.abs(f.speed) < 0.04 ? still[k] + FIXED_STEP : 0;
      longestStill = Math.max(longestStill, still[k]);
      pile = Math.max(pile, near(f));
    });
    // Feeding fish at the same level never overlap: centres stay apart by a good part of a body length.
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const f = p.fish[a], g = p.fish[b];
      if (f.mode === 'feed' && g.mode === 'feed' && Math.abs(f.depth - g.depth) < 0.1) closest = Math.min(closest, Math.hypot(f.x - g.x, f.z - g.z) / ((f.len + g.len) / 2));
    }
  }
  assert.equal(p.pellets.length, 0, `All ${PELLET.pinch} pellets eaten (seed ${seed})`);
  assert.ok(p.stats.eaten === PELLET.pinch, 'Each pellet counted once');
  assert.ok(rings >= PELLET.pinch * 2, 'Pellets landing and mouths breaking the surface make rings');
  assert.ok(gulpDepth < 0.15, 'Fish rise to the surface to eat');
  assert.ok(closest > 0.3, `Feeding fish keep apart (closest ${closest.toFixed(2)} body lengths, seed ${seed})`);
  assert.ok(pile <= 4, `No pile-up at the food (${pile} others within 0.5 m, seed ${seed})`);
  assert.ok(longestStill < 1, `Feeding fish keep moving (still for ${longestStill.toFixed(1)} s, seed ${seed})`);
  assert.ok(engaged.size >= 2 && engaged.size < n, `Some come for the food and some do not (${engaged.size} of ${n}, seed ${seed})`);
  assert.ok(Math.max(...ate) >= 2 && ate.filter((k) => k > 0).length >= 2, `Several share the food, the keen more than once (${ate}, seed ${seed})`);
  engagedAll += engaged.size; castAll += n;
  // Afterwards they drift off and spread out again.
  run(p, 30);
  assert.ok(p.fish.every((f) => f.mode === 'cruise'), 'They drift off again afterwards');
  assert.ok(Math.max(...p.fish.map(near)) <= 3, `And spread out (seed ${seed})`);
}
assert.ok(engagedAll / castAll > 0.35 && engagedAll / castAll < 0.85, `About half the pond turns out for a feeding (${engagedAll} of ${castAll})`);

// A resting cursor draws a curious fish or two over; a fast pass sends the nearest moving off,
// and they settle again.
for (const seed of [1, 2, 3]) {
  const p = pond(seed);
  run(p, 15);
  const at = { x: p.fish[0].x + 0.3, z: p.fish[0].z };
  let closest = Infinity, curious = 0;
  run(p, 30, () => {
    p.point(at.x, at.z);
    curious = Math.max(curious, p.fish.filter((f) => f.mode === 'curious').length);
    for (const f of p.fish) closest = Math.min(closest, Math.hypot(f.x + Math.cos(f.heading) * f.len * 0.3 - at.x, f.z + Math.sin(f.heading) * f.len * 0.3 - at.z));
  });
  assert.ok(curious >= 1 && curious <= 3, `One to three fish come to look (${curious})`);
  assert.ok(closest < 0.3, `A curious fish comes up close (${closest.toFixed(2)} m)`);

  // Sweep the cursor fast straight through the nearest fish.
  const f = p.fish.find((g) => g.mode === 'curious') || p.fish[0];
  const x0 = f.x - 0.8, z0 = f.z;
  const before = p.stats.startles;
  for (let i = 0; i <= 24; i++) { p.point(x0 + i * 0.066, z0); p.step(FIXED_STEP); p.impulses.length = 0; }
  assert.ok(p.stats.startles > before, 'A fast pass startles');
  const startled = p.fish.filter((g) => g.mode === 'startle');
  assert.ok(startled.length >= 1, 'Someone darts');
  assert.ok(Math.max(...startled.map((g) => g.speed)) > 0.25, 'It moves off briskly');
  p.point(null);
  run(p, 6);
  assert.ok(p.fish.every((g) => g.mode !== 'startle'), 'And they settle again');
}

// Cursor motion leaves ripples; a cursor resting on the water does not.
{
  const p = pond(9);
  // Count only the rings made where the cursor is, not the fish's wakes or drips elsewhere.
  const at = (x, z) => { let n = 0; for (let i = 0; i < p.impulses.length; i += 4) if (Math.hypot(p.impulses[i] - x, p.impulses[i + 1] - z) < 0.02) n++; return n; };
  let moving = 0, resting = 0;
  for (let i = 0; i < 120; i++) { const x = -1 + i * 0.01; p.point(x, 0.2); p.step(FIXED_STEP); moving += at(x, 0.2); p.impulses.length = 0; }
  for (let i = 0; i < 120; i++) { p.point(0.2, 0.2); p.step(FIXED_STEP); resting += at(0.2, 0.2); p.impulses.length = 0; }
  assert.ok(moving >= 10, `A moving cursor rings the water (${moving})`);
  assert.ok(resting <= 2, `A resting cursor leaves it still (${resting})`);
}

console.log('koiscape behaviour: ok');
