import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WORLDS, worldUrl, previewUrl } from '../worlds.js';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
assert.equal(new Set(WORLDS.map(world => world.id)).size, WORLDS.length, 'world ids are unique');
for (const world of WORLDS) {
  assert(existsSync(fileURLToPath(new URL('index.html', worldUrl(world)))), `${world.id} has a page`);
  assert(existsSync(fileURLToPath(new URL('wallpaper.html', worldUrl(world)))), `${world.id} has a wallpaper page`);
  assert(existsSync(fileURLToPath(previewUrl(world))), `${world.id} has a gallery preview`);
  const page = read(`scenes/${world.id}/index.html`);
  // The switcher fills its list from WORLDS; a page names only itself.
  assert.match(page, /<button disabled id="worlds"[^>]*>([^<]+)<\/button>\s*<ul id="world-list" hidden><\/ul>/, `${world.id} has the world switcher`);
  for (const other of WORLDS) if (other !== world) assert(!page.includes(`../${other.id}/`), `${world.id} does not link ${other.id} by hand`);
  for (const id of ['pause', 'fullscreen', 'quality', 'hide', 'show-controls']) assert(page.includes(`id="${id}"`), `${world.id} has #${id}`);
  assert.match(page, /H hides controls/, `${world.id} describes the H shortcut`);
  assert(!read(`scenes/${world.id}/wallpaper.html`).includes('class="chrome"'), `${world.id} wallpaper has no chrome`);
}
// The Mac app cannot import JavaScript, so it keeps its own list; keep the two in step.
const swiftCases = read('wallpaper/Wallpaper.swift').match(/case (\w+scape(?:, \w+scape)*)\n/)[1].split(', ');
assert.deepEqual(swiftCases, WORLDS.map(world => world.id), 'the Mac app offers the same worlds in the same order');
console.log(`PASS: ${WORLDS.length} worlds, each with a page, wallpaper, preview, controls and the shared world switcher`);
