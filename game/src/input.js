// Keyboard and pointer input for Sunfall City.
// Held keys give a movement direction and a sprint flag; one-shot presses
// (interact, confirm, pause, mute) are queued as bit flags and taken once by
// the game loop, so a press between two frames is never lost or counted twice.

export const ACTION_INTERACT = 1;
export const ACTION_CONFIRM = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MUTE = 8;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const INTERACT = new Set(['KeyE', 'KeyF']);
const CONFIRM = new Set(['Enter', 'Space']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);

/**
 * Attach input listeners to `target` (the canvas or window).
 * Returns { direction(), sprintHeld(), takeActions(), mouse() }.
 */
export function createInput(target) {
  const held = new Set();
  let queued = 0;
  const pointer = { x: 0, y: 0, down: false };

  function onKeyDown(event) {
    if (event.repeat) return;
    held.add(event.code);
    if (INTERACT.has(event.code)) queued |= ACTION_INTERACT;
    else if (CONFIRM.has(event.code)) queued |= ACTION_CONFIRM;
    else if (PAUSE.has(event.code)) queued |= ACTION_PAUSE;
    else if (MUTE.has(event.code)) queued |= ACTION_MUTE;
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
  }
  function onKeyUp(event) {
    held.delete(event.code);
  }
  function onPointerDown(event) {
    pointer.down = true;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    queued |= ACTION_CONFIRM;
  }
  function onPointerMove(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  }
  function onPointerUp() {
    pointer.down = false;
  }
  function onBlur() {
    held.clear();
    pointer.down = false;
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('blur', onBlur);

  return {
    /** Current held direction, each axis in -1..1 (not normalised). */
    direction() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        if (LEFT.has(code)) x -= 1;
        else if (RIGHT.has(code)) x += 1;
        else if (UP.has(code)) y -= 1;
        else if (DOWN.has(code)) y += 1;
      }
      return { x, y };
    },
    sprintHeld() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    /** The ACTION_* bitmask queued since the last call; clears the queue. */
    takeActions() {
      const actions = queued;
      queued = 0;
      return actions;
    },
    mouse() {
      return { x: pointer.x, y: pointer.y, down: pointer.down };
    },
  };
}
