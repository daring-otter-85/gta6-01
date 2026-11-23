// The screenshot scenes behind ?shot=cover|street|mission|harbor. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (drive toward a point on the road, walk toward a target, shoot the nearest
// enemy), so the frame is what a short game really looks like and the same seed always
// gives the same frame.

import { STEP } from './config.js';
import { SCREEN_PLAY } from './render.js';
import { startMission } from './missions.js';
import { angleDiff } from './player.js';

const SILENT = {
  engine() {}, siren() {}, shot() {}, enemyShot() {}, blip() {}, crash() {},
  jingle() {}, fail() {}, arrest() {},
};

/** Drive input steering the player's car toward (tx, ty). */
function driveInput(state, tx, ty) {
  const car = state.player.car;
  const diff = angleDiff(car.angle, Math.atan2(ty - car.y, tx - car.x));
  return {
    mx: diff > 0.12 ? 1 : diff < -0.12 ? -1 : 0,
    my: -1, run: false, handbrake: false, firing: false,
    aimX: tx, aimY: ty, mouseIn: false, enterPressed: false,
  };
}

/** On-foot input: walk toward (tx, ty), shooting the nearest enemy when there is one. */
function footInput(state, tx, ty) {
  const p = state.player;
  let aimX = tx;
  let aimY = ty;
  let firing = false;
  let nearest = null;
  let nearestD = 1e9;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < nearestD) {
      nearestD = d;
      nearest = e;
    }
  }
  if (nearest) {
    aimX = nearest.x;
    aimY = nearest.y;
    firing = nearestD < 520;
  }
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  // Close to a shooting range, then hold and fire.
  const move = nearest && nearestD < 260 ? 0 : 1;
  return {
    mx: d > 12 ? (dx / d) * move : 0,
    my: d > 12 ? (dy / d) * move : 0,
    run: false, handbrake: false, firing,
    aimX, aimY, mouseIn: true, enterPressed: false,
  };
}

function putPlayerInCar(state, x, y, angle, color) {
  const car = {
    x, y, angle, speed: 0, targetSpeed: 0, color: color || '#c0392b',
    police: false, parked: false, driver: false, axis: 'h', coord: y, dir: 1, spin: 0,
  };
  state.player.car = car;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
  state.camera.x = Math.max(0, Math.min(3200 - 1280, x - 640));
  state.camera.y = Math.max(0, Math.min(2400 - 720, y - 360));
  return car;
}

function addPoliceCar(state, x, y, angle, speed) {
  state.policeCars.push({
    x, y, angle, speed, targetSpeed: 600, color: '#20242c',
    police: true, parked: false, driver: false,
    axis: 'h', coord: y, dir: 1, spin: 0, stuckTimer: 0,
  });
}

function stepFor(world, seconds, inputFn) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) world.step(STEP, inputFn(world.state), SILENT);
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Unknown names stage the street scene.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  const ui = { hasSave: false, saveMission: 0, saveCash: 0, saveBest: 0, muted: false, message: null };

  if (name === 'cover') {
    // A getaway in progress: Milo driving west down Palm Row, three stars, the law behind.
    state.mission.index = 2;
    startMission(state, SILENT);
    state.mission.stage = 2;
    state.mission.stageTimer = 0;
    state.wanted = 3;
    putPlayerInCar(state, 2000, 1150, Math.PI, '#2471a3');
    addPoliceCar(state, 2140, 1150, Math.PI, 540);
    addPoliceCar(state, 2195, 1118, Math.PI, 510);
    addPoliceCar(state, 2250, 1184, Math.PI, 480);
    stepFor(world, 1.5, (s) => driveInput(s, 300, 1150));
    return { screen: SCREEN_PLAY, ui };
  }

  if (name === 'mission') {
    // The alley shootout: Milo on foot against Corso's crew, job four in progress.
    state.player.x = 1300;
    state.player.y = 1520;
    state.mission.index = 3;
    startMission(state, SILENT);
    stepFor(world, 1.2, (s) => footInput(s, 1300, 1600));
    return { screen: SCREEN_PLAY, ui };
  }

  if (name === 'harbor') {
    // Dusk at the harbor: Milo driving the waterfront road north toward the piers,
    // one star, one unit behind.
    state.dusk = 1;
    state.mission.index = 4;
    state.wanted = 1;
    putPlayerInCar(state, 2800, 1150, -Math.PI / 2, '#b9770e');
    addPoliceCar(state, 2800, 1300, -Math.PI / 2, 460);
    stepFor(world, 1.5, (s) => driveInput(s, 2800, 300));
    // The staging drive can clip a pedestrian on the waterfront and pick up a
    // second star; the scene is meant to show one star and no bust in progress.
    state.wanted = 1;
    state.bustMeter = 0;
    return { screen: SCREEN_PLAY, ui };
  }

  // street: Milo on foot in a busy downtown street, traffic and pedestrians all around.
  state.player.x = 1800;
  state.player.y = 1150;
  state.player.angle = 0;
  state.camera.x = 1800 - 640;
  state.camera.y = 1150 - 360;
  let sr = 1234567;
  const srand = () => {
    sr = (sr + 0x6d2b79f5) | 0;
    let t = Math.imul(sr ^ (sr >>> 15), 1 | sr);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i += 1) {
    const spot = state.city.nearestRoadPoint(1800 + (srand() - 0.5) * 700, 1150 + (srand() - 0.5) * 500);
    state.peds.push({
      x: spot.x + 62, y: spot.y, angle: 0, speed: 55, axis: 'h', coord: spot.y,
      dir: 1, color: ['#d94f4f', '#4f8fd9', '#5fb85f', '#d9a04f'][i % 4],
      down: false, downTimer: 0, flee: false, fleeX: 0, fleeY: 0, panic: 0,
    });
  }
  stepFor(world, 2.5, (s) => ({
    mx: 1, my: 0, run: false, handbrake: false, firing: false,
    aimX: s.player.x + 100, aimY: s.player.y, mouseIn: true, enterPressed: false,
  }));
  return { screen: SCREEN_PLAY, ui };
}
