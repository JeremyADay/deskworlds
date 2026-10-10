import { WORLDS, worldUrl, currentWorld } from './worlds.js';

const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>';

// A disclosure of links: the button names the world on screen and opens the list of all of them.
export function installWorldSwitcher() {
  const button = document.querySelector('#worlds');
  const list = document.querySelector('#world-list');
  if (!button || !list) return;
  const here = currentWorld();
  const label = document.createElement('span');
  label.textContent = here?.name ?? 'Worlds';
  button.replaceChildren(label);
  button.insertAdjacentHTML('beforeend', CHEVRON);
  list.replaceChildren(...WORLDS.map(world => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = worldUrl(world).href;
    link.textContent = world.name;
    if (world === here) link.setAttribute('aria-current', 'page');
    item.append(link);
    return item;
  }));
  const links = [...list.querySelectorAll('a')];
  const current = links.find(link => link.hasAttribute('aria-current')) ?? links[0];

  function setOpen(open, focus = false) {
    list.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (!open) return;
    current.scrollIntoView({ block: 'nearest' });
    if (focus) current.focus();
  }
  const isOpen = () => !list.hidden;

  button.addEventListener('click', () => setOpen(!isOpen()));
  button.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    setOpen(true, true);
  });
  list.addEventListener('keydown', event => {
    const index = links.indexOf(document.activeElement);
    const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: links.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    links[(next + links.length) % links.length].focus();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !isOpen()) return;
    const inside = list.contains(document.activeElement);
    setOpen(false);
    if (inside) button.focus();
  });
  // Close when focus or a press lands anywhere else.
  button.parentElement.addEventListener('focusout', event => {
    if (!button.parentElement.contains(event.relatedTarget)) setOpen(false);
  });
  document.addEventListener('pointerdown', event => {
    if (!button.parentElement.contains(event.target)) setOpen(false);
  });
  button.disabled = false;
}
