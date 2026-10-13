import assert from 'node:assert/strict';
import { createStorm, FIXED_STEP, MOON, moonPosition, ridgeHeight, hillHeight, glowEnvelope, boltEnvelope, flashLuma, SHORE } from '../src/storm.js';
import { randomGenerator } from '../../shared/random.js';

const storm = (seed, options) => createStorm({ random: randomGenerator(seed), ...options });
const run = (s, seconds, each = () => {}) => { for (let i = 0, n = Math.round(seconds / FIXED_STEP); i < n; i++) { s.step(FIXED_STEP); each(s.state); } };
const aspects = [3440 / 1440, 16 / 10, 16 / 9];

// A good storm from the first frame, and it stays one: rain, wind, gusts and lightning never
// let up, and the same seed always makes the same storm.
for (const seed of [1, 2, 3, 4]) {
  const s = storm(seed);
  let minRain = Infinity, minLevel = Infinity;
  run(s, 600, (state) => { minRain = Math.min(minRain, state.rain); minLevel = Math.min(minLevel, state.level); });
  assert.ok(s.diagnostics().finite, 'State stays finite');
  assert.ok(minLevel >= 0.72 && minRain > 0.7, `Never less than a good storm (${minLevel.toFixed(2)})`);
  assert.ok(s.state.strikes >= 40 && s.state.strikes <= 140, `Lightning every few seconds (${s.state.strikes} in ten minutes)`);
  assert.ok(s.state.bolts >= 6 && s.state.bolts < s.state.strikes * 0.6, `Mostly glow in the clouds, sometimes a bolt (${s.state.bolts} of ${s.state.strikes})`);
  assert.ok(s.state.gusts >= 30 && s.state.gusts <= 140, `Gusts keep coming (${s.state.gusts})`);
}
{
  const a = storm(7), b = storm(7);
  run(a, 60); run(b, 60);
  assert.deepEqual(a.state, b.state, 'Deterministic for a seed');
  const early = storm(3);
  run(early, 4);
  assert.ok(early.state.strikes >= 1, 'The first strike comes within seconds of opening');
}

// The gust model: a push rises in about a second, the trees and rain lean with it, the smoke
// follows a moment later, and all of it settles back.
{
  const s = storm(5);
  run(s, 1);
  const before = s.state.gust;
  s.gust(1, 1, 4);
  let lead = 0;
  run(s, 1.5, (state) => { lead = Math.max(lead, state.gust - state.smoke); });
  assert.ok(s.state.gust > before + 0.5, `The wind leans hard into a gust (${s.state.gust.toFixed(2)})`);
  assert.ok(lead > 0.25, `The smoke lags the trees (${lead.toFixed(2)})`);
  run(s, 2.5);
  assert.ok(s.state.smoke > 0.5, 'The smoke bends over a moment later');
  let peak = 0;
  run(storm(5), 0); run(s, 1, (state) => { peak = Math.max(peak, Math.abs(state.gust)); });
  assert.ok(peak < 1, 'Lean stays in range');
  s.gust(1.2, -1, 3);
  run(s, 2);
  assert.ok(s.state.gust < 0, 'A gust from the right leans everything the other way');
}
// Gusts change smoothly: nothing in the yard snaps from one frame to the next.
for (const seed of [1, 2, 3]) {
  const s = storm(seed);
  let last = 0, jump = 0;
  run(s, 300, (state) => { jump = Math.max(jump, Math.abs(state.gust - last)); last = state.gust; });
  assert.ok(jump < 0.06, `The lean never jumps (${jump.toFixed(3)} a frame)`);
}

// Clouds drift steadily: always the same way, a bit faster in strong wind, never jumping
// back and forth with the gusts.
for (const seed of [1, 2, 3]) {
  const s = storm(seed);
  let last = 0, slowest = Infinity, fastest = 0, lastRate = null, kick = 0;
  run(s, 400, (state) => {
    const rate = (state.cloudX - last) / FIXED_STEP; last = state.cloudX;
    slowest = Math.min(slowest, rate); fastest = Math.max(fastest, rate);
    if (lastRate !== null) kick = Math.max(kick, Math.abs(rate - lastRate) / rate);
    lastRate = rate;
  });
  assert.ok(slowest > 0, 'Clouds never drift backwards');
  assert.ok(fastest / slowest < 1.6, `Their speed varies only gently (${(fastest / slowest).toFixed(2)}x)`);
  assert.ok(kick < 0.002, `And never changes abruptly (${kick.toExponential(1)} a frame)`);
  // A hard gust barely moves them.
  const calm = storm(seed), gusty = storm(seed);
  run(calm, 30); run(gusty, 30);
  const from = gusty.state.cloudX;
  gusty.gust(1.4, -1, 5); run(gusty, 3); run(calm, 3);
  assert.ok(gusty.state.cloudX > from, 'Even a gust against them does not turn them');
}

// The moon starts at the upper left and creeps along the ridge line, always partly behind
// it, never out in the open sky and never gone.
for (const aspect of aspects) {
  const start = moonPosition(0, aspect);
  assert.ok(start.x < 0.3 && start.y > 0.45, 'It starts upper left');
  assert.ok(start.up > 0.99, 'And is up when the world opens');
  let previous = start.x, fastest = 0, slowest = Infinity;
  for (let t = 0; t <= MOON.crossing - 2 * MOON.turn; t += 5) {
    const m = moonPosition(t, aspect);
    assert.ok(m.x >= previous - 1e-9, 'It creeps left to right');
    if (t) { fastest = Math.max(fastest, (m.x - previous) / 5); slowest = Math.min(slowest, (m.x - previous) / 5); }
    previous = m.x;
    assert.ok(m.up > 0.99, 'It stays up for the whole crossing');
    // The rock under its middle and across its width.
    let highest = -Infinity, mean = 0, n = 0;
    for (let dx = -MOON.radius; dx <= MOON.radius; dx += MOON.radius / 8) { const r = ridgeHeight(m.x * aspect + dx); highest = Math.max(highest, r); mean += r; n++; }
    assert.ok(m.y - MOON.radius < mean / n - MOON.radius * 0.4, `A good part of the disc is always behind the ridge (t=${t}, aspect ${aspect.toFixed(2)})`);
    assert.ok(m.y + MOON.radius > highest + MOON.radius * 0.5, `And a good part of it always shows (t=${t})`);
    assert.ok(m.y < highest + MOON.radius * 0.5, 'It never floats clear into the open sky');
  }
  assert.ok(previous > 0.55 && previous < 0.7, 'It ends its run right of centre');
  assert.ok(fastest < 0.0002, `Very slowly: about a pixel every two seconds on an ultrawide (${fastest.toExponential(1)})`);
  assert.ok(fastest - slowest < 1e-9, 'And at one steady pace');
  // At the end of its run it sets behind the ridge and, a little later, rises where it began. It never goes back.
  const set = moonPosition(MOON.crossing + MOON.away / 2 - MOON.turn, aspect);
  assert.ok(set.up === 0 && set.y + MOON.radius < ridgeHeight(set.x * aspect), 'Set: wholly behind the ridge');
  for (let t = MOON.crossing - 2 * MOON.turn, last = previous; t < MOON.crossing - MOON.turn + 1; t += 1) { const m = moonPosition(t, aspect); assert.ok(m.x >= last - 1e-9, 'Setting, it still moves rightward'); last = m.x; }
  const risen = moonPosition(MOON.crossing + MOON.away, aspect);
  assert.ok(Math.abs(risen.x - start.x) < 1e-6 && risen.up > 0.99, 'Risen again at the left');
}
// The country behind it is rugged, not rounded, and stands clear of the lake.
{
  let turns = 0, steep = 0;
  for (let x = 0.01; x < 3.99; x += 0.002) {
    const a = ridgeHeight(x - 0.002), b = ridgeHeight(x), c = ridgeHeight(x + 0.002);
    if ((b - a) * (c - b) < 0) turns++;
    steep = Math.max(steep, Math.abs(c - a) / 0.004);
    assert.ok(b > hillHeight(x) + 0.02 && hillHeight(x) > SHORE + 0.01, 'Ridge above hills above the shore');
    assert.ok(b < 0.72, 'The ridge leaves the sky to the storm');
  }
  assert.ok(turns > 300, `A ragged skyline (${turns} turns)`);
  assert.ok(steep > 0.8, 'With steep faces');
}

// The Holiday Lights switch: off until thrown, eases over, and stays where it is put.
{
  const s = storm(2);
  assert.equal(s.state.holidayOn, false);
  run(s, 2);
  assert.equal(s.state.holiday, 0, 'Warm patio bulbs by default');
  assert.equal(s.toggleHoliday(), true);
  run(s, 0.2);
  assert.ok(s.state.holiday > 0 && s.state.holiday < 1, 'The bulbs change over, not snap');
  run(s, 5);
  assert.equal(s.state.holiday, 1, 'Fully coloured within a few seconds');
  run(s, 300);
  assert.equal(s.state.holiday, 1, 'And it stays on through the storm');
  assert.equal(s.toggleHoliday(), false);
  run(s, 5);
  assert.equal(s.state.holiday, 0);
  assert.equal(s.setHoliday(true), true);
  assert.equal(s.setHoliday(true), true, 'Setting it twice leaves it on');
  assert.equal(storm(2, { holiday: true }).state.holiday, 1, 'A remembered switch opens already lit');
}

// Lightning may be bright but never a full-screen white flash. Through the brightest strike
// there is (a bolt at full strength) every frame is checked: the open sky, the land and the
// lake stay well short of white, and only cloud close to the strike gets bright.
{
  assert.ok(Math.max(...Array.from({ length: 200 }, (_, i) => glowEnvelope(i / 100))) <= 1);
  assert.ok(Math.max(...Array.from({ length: 200 }, (_, i) => boltEnvelope(i / 100))) <= 1);
  const s = storm(9);
  run(s, 1);
  s.strike(true, { x: 0.5, peak: 1 });
  let brightest = 0, frames = 0, lit = 0;
  run(s, 1.5, (state) => {
    frames++;
    if (state.amb > 0.5) lit++;
    // The frame from the strike outwards, in window heights: cloud over the top half, the rest below.
    let sum = 0, near = 0, count = 0;
    for (let d = 0; d <= 1.2; d += 0.05) {
      const cloud = flashLuma(state, 'cloud', d);
      assert.ok(flashLuma(state, 'sky', d) < 0.62, 'Open sky stays dusky');
      if (d > 0.7) assert.ok(cloud < 0.8, `Cloud away from the strike is not white (${cloud.toFixed(2)})`);
      sum += cloud * 0.45 + flashLuma(state, 'sky', d) * 0.1 + flashLuma(state, 'land') * 0.3 + flashLuma(state, 'lake') * 0.15; count++;
      if (cloud > 0.85) near++;
    }
    assert.ok(flashLuma(state, 'land') < 0.5 && flashLuma(state, 'lake') < 0.55, 'The valley is lit, not bleached');
    assert.ok(near / count < 0.4, 'Only the cloud around the strike is brilliant');
    brightest = Math.max(brightest, sum / count);
  });
  assert.ok(lit >= 2, 'The strike does light the valley');
  assert.ok(brightest < 0.6, `The frame as a whole never nears white (${brightest.toFixed(2)})`);
  assert.ok(lit < frames * 0.3, 'And the flash is brief');
}

console.log('lakescape storm: ok');
