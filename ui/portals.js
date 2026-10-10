import { WORLDS, worldUrl, previewUrl } from './worlds.js';

// One portal per world. The carousel (gallery.js) runs next and selects the first.
const gallery = document.querySelector('.gallery');
for (const [index, world] of WORLDS.entries()) {
  const portal = document.createElement('a');
  portal.className = 'portal';
  portal.draggable = false;
  portal.href = worldUrl(world).href;
  portal.innerHTML = `
    <div class="portal-image">
      <span class="preview-status" hidden>Preview unavailable</span>
      <img draggable="false" width="1440" height="750" />
    </div>
    <div class="portal-caption">
      <h2><span class="enter" aria-hidden="true">↗</span></h2>
    </div>`;
  const image = portal.querySelector('img');
  image.src = previewUrl(world).href;
  image.alt = world.alt;
  if (index === 0) image.fetchPriority = 'high';
  portal.querySelector('h2').prepend(world.name);
  gallery.append(portal);
}
