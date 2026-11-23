// Keyboard and mouse input. Held keys give movement axes; one-shot presses (enter a car,
// pause, mute, restart the mission, confirm) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice. The mouse
// position is kept in canvas pixels; the loop converts it to world coordinates with the
// renderer's view transform.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;

const KEYS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'handbrake',
};

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, run: false, handbrake: false };
  let actions = 0;
  let firing = false;
  let mouseX = 0;
  let mouseY = 0;
  let mouseIn = false;

  function onKeyDown(event) {
    const name = KEYS[event.code];
    if (name) {
      held[name] = true;
      event.preventDefault();
      return;
    }
    if (event.repeat) return;
    if (event.code === 'KeyE') actions |= ACTION_ENTER;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    else if (event.code === 'KeyR') actions |= ACTION_RESTART;
    else if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else return;
    event.preventDefault();
  }

  function onKeyUp(event) {
    const name = KEYS[event.code];
    if (name) held[name] = false;
  }

  function onBlur() {
    for (const key of Object.keys(held)) held[key] = false;
    firing = false;
  }

  function trackMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseIn = true;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointermove', trackMouse);
  canvas.addEventListener('pointerdown', (event) => {
    trackMouse(event);
    firing = true;
    actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('pointerup', () => {
    firing = false;
  });
  canvas.addEventListener('pointerleave', () => {
    mouseIn = false;
  });

  return {
    /** Movement axes -1..1, run/handbrake flags, firing and the mouse in canvas pixels. */
    state() {
      return {
        mx: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        my: (held.down ? 1 : 0) - (held.up ? 1 : 0),
        run: held.run,
        handbrake: held.handbrake,
        firing,
        mouseX,
        mouseY,
        mouseIn,
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
