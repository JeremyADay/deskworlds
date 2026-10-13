import assert from 'node:assert/strict';
import { createGlass, WIPE, fogClear, handCover, handWidth, FINGERS } from '../src/glass.js';
import { FIXED_STEP } from '../src/storm.js';
import { randomGenerator } from '../../shared/random.js';

const aspect = 3440 / 1440;
const pane = (seed, a = aspect) => createGlass({ random: randomGenerator(seed), aspect: a });
const run = (g, seconds, gust = 0.1, rain = 0.9) => { for (let i = 0, n = Math.round(seconds / FIXED_STEP); i < n; i++) { g.step(FIXED_STEP, gust, rain); g.clearStamps(); } };

// The hand: a palm with four fingertip nubs on top, and large.
{
  assert.ok(handCover(0, 0) > 0.9, 'The palm covers its middle');
  for (const [x, y, , length] of FINGERS) { assert.ok(handCover(x, y) > 0.9, 'A fingertip'); assert.ok(y + length > 0.55 && length < 0.2, 'a short nub standing above the palm'); }
  assert.ok(handCover(0.21, 0.62) < 0 && handCover(-0.21, 0.63) < 0, 'With gaps between the fingertips');
  assert.ok(handCover(0, -0.5) < 0 && handCover(0.7, 0) < 0, 'And nothing beyond the outline');
  assert.ok(handCover(0, 0.36) > 0 && handCover(0.31, 0.31) > 0, 'The fingers join the palm');
  assert.ok(handCover(0.40, 0.1) > 0 && handCover(0.40, -0.36) < 0, 'The palm narrows toward the heel');
  assert.ok(handCover(0.11, 0.6) > 0 && handCover(0.11, -0.6) < 0, 'The fingers are on top');
  for (const a of [aspect, 16 / 10, 16 / 9]) assert.ok(handWidth(a) >= 0.2 && handWidth(a) <= WIPE.maxWidth, 'A large hand at every shape of screen');
}

// A wiped patch stays clear long enough to enjoy: fog returns over one to two minutes.
{
  assert.equal(fogClear(0), 1);
  assert.ok(fogClear(40) > 0.97, 'Still clear after forty seconds');
  assert.ok(fogClear(60) > 0.7, 'Mostly clear at a minute');
  assert.ok(fogClear(90) < 0.6 && fogClear(90) > 0.1, 'Fogging over between one and two minutes');
  assert.ok(fogClear(120) === 0 && fogClear(500) === 0, 'Fogged again after two');
  for (let t = 0; t < 130; t++) assert.ok(fogClear(t + 1) <= fogClear(t), 'It only ever returns');
}

// The wipe clears the drops too, and they bead back one by one over about fifteen seconds.
for (const seed of [1, 2, 3]) {
  const g = pane(seed);
  run(g, 20);
  const x = 1.2, y = 0.55, w = handWidth(aspect), r = w * 0.3;
  const before = g.beadsNear(x, y, r);
  assert.ok(before >= 25, `The pane is beaded with rain (${before} under the palm)`);
  const runnersBefore = g.runners.length;
  assert.ok(runnersBefore >= 3, 'And drops are running down it');
  g.wipe(x - 0.3, y); g.wipe(x, y); g.wipe(x + 0.3, y);
  assert.ok(g.stampCount >= 3, 'The hand leaves its print for the fog');
  assert.equal(g.beadsNear(x, y, r), 0, 'Every bead under the palm is gone');
  // (The hand wavers a little as it goes, so the test keeps just inside its outline.)
  assert.ok(g.runners.every((d) => handCover((d.x - x) / (w * 0.8), (d.y - y) / (w * 0.8)) <= 0 && handCover((d.x - x + 0.3) / (w * 0.8), (d.y - y) / (w * 0.8)) <= 0), 'And every running drop');
  g.lift();
  run(g, 1.5);
  assert.ok(g.beadsNear(x, y, r) <= before * 0.1, 'The patch stays clear at first');
  run(g, 7);
  const half = g.beadsNear(x, y, r);
  assert.ok(half > before * 0.2 && half < before * 0.85, `About half are back after eight seconds (${half} of ${before})`);
  run(g, 9);
  assert.ok(g.beadsNear(x, y, r) > before * 0.75, `All but back after seventeen (${g.beadsNear(x, y, r)} of ${before})`);
}

// Drops run in fits and starts, and a gust blows them sideways.
{
  const g = pane(4);
  run(g, 10, 0);
  const d = g.runners.find((r) => r.y > 0.5 && r.y < 0.9);
  let stopped = 0, moved = 0, lastY = d.y;
  for (let i = 0; i < 600 && g.runners.includes(d); i++) { g.step(FIXED_STEP, 0, 0.9); g.clearStamps(); if (d.y === lastY) stopped++; else moved++; lastY = d.y; }
  assert.ok(stopped > 5 && moved > 5, `Stick and slip (${stopped} frames held, ${moved} sliding)`);
  const drift = (gust) => {
    const p = pane(5);
    run(p, 6, 0);
    const start = new Map(p.runners.map((r) => [r, r.x]));
    run(p, 1.5, gust);
    const kept = p.runners.filter((r) => start.has(r));
    return kept.reduce((s, r) => s + r.x - start.get(r), 0) / kept.length;
  };
  const still = drift(0), right = drift(1), left = drift(-1);
  assert.ok(right > still + 0.01, `A gust from the left blows the drops to the right (${right.toFixed(3)})`);
  assert.ok(left < still - 0.01, 'And one from the right, to the left');
}

// The pane keeps its numbers in bounds at every shape of screen and through a long night.
for (const a of [aspect, 16 / 10, 16 / 9]) {
  const g = pane(6, a);
  for (let i = 0; i < 3600; i++) { g.step(FIXED_STEP, Math.sin(i / 200), 1); if (i % 7 === 0) g.wipe((i % 500) / 500 * a, 0.5); g.clearStamps(); }
  const n = g.pack(), stats = g.diagnostics();
  assert.ok(n > 500 && n * 4 <= g.drops.length, 'Drops fit their buffer');
  assert.ok(g.drops.subarray(0, n * 4).every(Number.isFinite), 'And stay finite');
  assert.ok(stats.runners <= 260, 'Running drops are capped');
}
{
  const g = pane(7);
  g.resize(16 / 9);
  run(g, 2);
  assert.ok(g.pack() > 500, 'A resized pane is beaded at once');
}

console.log('lakescape glass: ok');
