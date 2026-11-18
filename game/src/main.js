// Sunfall City — boot and the one loop. The world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one; a stall over 0.25 s is
// dropped, not replayed) and the renderer paints whatever state is there.
// main.js owns the screens around the simulation — title, pause, busted,
// wasted, career complete — by watching and setting world.state.screen,
// and it turns raw keyboard/pointer input into the per-tick snapshots
// world.step consumes.
//
// Controls: WASD/arrows move or drive · Shift sprint · E/F interact (talk,
// enter/exit a car, advance dialogue) · mouse aims, hold click or J fires
// the pistol · K melee · P/Esc pause · M mute · Enter/Space confirm.
//
// ?seed=N fixes the city and everything in it. ?shot=cover|chase|street|
// mission (with &seed=N) stages that scene instead of running the loop,
// paints it twice and sets window.__shotReady for a screenshot.

import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, ACTION_MELEE } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer } from './render.js';
import { drawHud, drawScreens } from './hud.js';
import { createAudio } from './audio.js';
import { loadSave, storeSave } from './save.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; longer stalls are dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const g = canvas.getContext('2d');

function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
world.onSave = (save) => storeSave(save);

/** The camera centre the renderer will actually use (its clamp, mirrored). */
function effectiveCamera() {
  const { city, camera } = world.state;
  const vw = canvas.width;
  const vh = canvas.height;
  const cx = vw >= city.w ? city.w / 2 : Math.max(vw / 2, Math.min(city.w - vw / 2, camera.x));
  const cy = vh >= city.h ? city.h / 2 : Math.max(vh / 2, Math.min(city.h - vh / 2, camera.y));
  return { x: cx, y: cy };
}

function drawFrame() {
  const state = world.state;
  renderer.draw(state);
  if (state.screen !== 'title') drawHud(g, state, canvas.width, canvas.height);
  drawScreens(g, state, canvas.width, canvas.height);
}

function runShot(name) {
  stageShot(name, world);
  let painted = 0;
  function paint() {
    drawFrame();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  world.reset(loadSave());
  const input = createInput(window);

  // Extra keys the shared input module does not know: J fires, K swings.
  let fireHeld = false;
  let meleeQueued = false;
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyJ') fireHeld = true;
    if (event.code === 'KeyK' && !event.repeat) meleeQueued = true;
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'KeyJ') fireHeld = false;
  });

  let pendingActions = 0;
  let accumulator = 0;
  let last = performance.now();
  let lastScreen = world.state.screen;

  function announce(message) {
    status.textContent = message;
  }

  function announceScreen(screen) {
    const state = world.state;
    if (screen === 'title') announce('Sunfall City. Press Enter to play.');
    else if (screen === 'play') announce(state.mission ? `Playing. ${state.mission.title}.` : 'Playing. Free roam.');
    else if (screen === 'paused') announce('Paused.');
    else if (screen === 'busted') announce(`Busted. ${state.screenText}`);
    else if (screen === 'wasted') announce(`Wasted. ${state.screenText}`);
    else if (screen === 'end') announce('Career complete. Press Enter to keep driving.');
  }

  function handleMeta(actions) {
    const state = world.state;
    if (actions & ACTION_MUTE) audio.toggleMute();
    if (state.screen === 'title' && (actions & ACTION_CONFIRM)) {
      audio.start();
      state.screen = 'play';
      return false; // the starting press is not also a gameplay press
    }
    if (state.screen === 'play' && (actions & ACTION_PAUSE)) {
      state.screen = 'paused';
      return true;
    }
    if (state.screen === 'paused' && (actions & (ACTION_PAUSE | ACTION_CONFIRM))) {
      state.screen = 'play';
      return true;
    }
    if ((state.screen === 'busted' || state.screen === 'wasted') && (actions & ACTION_CONFIRM)) {
      world.dismiss();
      return true;
    }
    if (state.screen === 'end' && (actions & ACTION_CONFIRM)) {
      world.continueFreeRoam();
      return true;
    }
    return state.screen === 'play';
  }

  function snapshot() {
    const m = input.mouse();
    const cam = effectiveCamera();
    const mouse = {
      x: m.x + cam.x - canvas.width / 2,
      y: m.y + cam.y - canvas.height / 2,
      down: m.down,
    };
    const snap = {
      dir: input.direction(),
      sprint: input.sprintHeld(),
      actions: pendingActions | (meleeQueued ? ACTION_MELEE : 0),
      mouse,
      aim: mouse,
      fire: fireHeld,
    };
    pendingActions = 0;
    meleeQueued = false;
    return snap;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    const actions = input.takeActions();
    const wasPlay = world.state.screen === 'play';
    const forward = handleMeta(actions);
    if (wasPlay && forward) pendingActions |= actions;
    if (world.state.screen !== 'play') meleeQueued = false;

    if (world.state.screen === 'play') {
      while (accumulator >= STEP && world.state.screen === 'play') {
        world.step(STEP, snapshot(), audio);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }

    if (world.state.screen !== lastScreen) {
      lastScreen = world.state.screen;
      announceScreen(lastScreen);
    }
    drawFrame();
  }

  // Leaving the tab pauses a running game rather than letting it run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && world.state.screen === 'play') {
      world.state.screen = 'paused';
    }
  });

  announce('Sunfall City. Press Enter to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
