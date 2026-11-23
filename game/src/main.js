// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, wasted and busted.
// Cash, mission progress and the best haul save to localStorage; C on the title screen
// continues a saved game.
//
// ?seed=N fixes the city. ?shot=cover|street|mission|harbor (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for
// a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './rng.js';
import { createWorld, EVENT_BUSTED, EVENT_MISSION, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { MISSIONS } from './missions.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save !== 'object' || save === null) return null;
    return {
      cash: Number(save.cash) || 0,
      missionIndex: Number(save.missionIndex) || 0,
      best: Number(save.best) || 0,
    };
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: world.state.cash,
      missionIndex: world.state.mission.index,
      best: world.state.best,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  // Paint twice, synchronously: in headless runs requestAnimationFrame may never tick,
  // and the staged scene is static, so two direct draws are the whole frame.
  renderer.draw(world.state, scene.screen, scene.ui);
  renderer.draw(world.state, scene.screen, scene.ui);
  window.__shotReady = true;
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let accumulator = 0;
  let last = performance.now();
  let message = null;
  let messageUntil = 0;
  let continuePressed = false;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && !event.repeat) continuePressed = true;
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(text) {
    status.textContent = text;
  }

  function showMessage(text) {
    message = text;
    messageUntil = performance.now() + 3500;
  }

  function startNew() {
    world.reset();
    save = null;
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      // No storage: the fresh game still starts.
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Solmar Bay. Head to the gold marker for your first job.');
  }

  function startContinue() {
    world.reset();
    world.applySave(save);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Continuing. Job ${world.state.mission.index + 1} of 5.`);
  }

  function restartMission() {
    const m = world.state.mission;
    const def = MISSIONS[Math.min(m.index, MISSIONS.length - 1)];
    m.active = false;
    m.stage = 0;
    m.enemiesLeft = 0;
    m.dialogue = null;
    world.state.enemies = [];
    world.state.bullets = [];
    world.state.wanted = 0;
    world.state.bustMeter = 0;
    world.state.policeCars = [];
    world.state.cops = [];
    const p = world.state.player;
    if (p.car) {
      world.state.cars.push(p.car);
      p.car = null;
    }
    p.x = def.start.x;
    p.y = def.start.y;
    p.health = 100;
    showMessage('Job restarted');
  }

  function endGame(kind) {
    screen = kind === 'wasted' ? SCREEN_WASTED : SCREEN_BUSTED;
    writeSave();
    announce(kind === 'wasted' ? 'Wasted. Press Enter to get back up.' : 'Busted. Press Enter to walk free.');
  }

  function handleActions(actions) {
    const now = performance.now();
    void now;
    if (screen === SCREEN_TITLE) {
      if (continuePressed && save) {
        continuePressed = false;
        startContinue();
      } else if (actions & ACTION_CONFIRM) {
        startNew();
      }
      continuePressed = false;
      return;
    }
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      showMessage(muted ? 'Sound off' : 'Sound on');
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        writeSave();
        announce('Paused.');
      } else if (actions & ACTION_RESTART) {
        restartMission();
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_WASTED || screen === SCREEN_BUSTED) {
      if (actions & ACTION_CONFIRM) {
        world.respawn();
        screen = SCREEN_PLAY;
        announce('Back on the streets.');
      }
    }
  }

  function buildInput(actions) {
    const ist = input.state();
    const logical = renderer.toLogical(ist.mouseX, ist.mouseY);
    return {
      mx: ist.mx,
      my: ist.my,
      run: ist.run,
      handbrake: ist.handbrake,
      firing: ist.firing && screen === SCREEN_PLAY,
      aimX: logical.x + world.state.camera.x,
      aimY: logical.y + world.state.camera.y,
      mouseIn: ist.mouseIn,
      enterPressed: Boolean(actions & ACTION_ENTER),
    };
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      // A living backdrop: traffic rolls while the title is up.
      world.step(STEP, {
        mx: 0, my: 0, run: false, handbrake: false, firing: false,
        aimX: world.state.player.x, aimY: world.state.player.y,
        mouseIn: false, enterPressed: false,
      }, audio);
      return;
    }
    const events = world.step(STEP, buildInput(actions), audio);
    if (events & EVENT_WASTED) endGame('wasted');
    else if (events & EVENT_BUSTED) endGame('busted');
    else if (events & EVENT_MISSION) {
      const done = MISSIONS[world.state.mission.index - 1];
      if (done) showMessage(`Job complete! +$${done.reward.toLocaleString('en-US')}`);
      writeSave();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(actions);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const ui = {
      hasSave: Boolean(save),
      saveMission: save ? save.missionIndex : 0,
      saveCash: save ? save.cash : 0,
      saveBest: save ? save.best : 0,
      muted: audio.muted,
      message: message && now < messageUntil ? message : null,
    };
    renderer.draw(world.state, screen, ui);
  }

  // Leaving the tab pauses a running game rather than letting the cops close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused.');
    }
  });

  announce('Solmar Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
