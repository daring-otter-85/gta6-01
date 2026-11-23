// The game's rules and state, with no drawing in it: traffic, pedestrians, police, the
// wanted level, bullets, pickups, the camera and the mission hookup. step() advances one
// fixed step and returns bit flags for what happened, so the caller can react (save,
// announce, change screen) without the world knowing about screens. Nothing here
// allocates after createWorld returns, except the small event list it reuses.

import { CAR, PALETTE, PED_COUNT, PLAYER, STEP, TRAFFIC_COUNT, VIEW, WANTED, WORLD } from './config.js';
import { createRandom } from './rng.js';
import { buildCity } from './city.js';
import { createEffects } from './effects.js';
import { stepPlayer } from './player.js';
import { startMission, missionPrompt, updateMission } from './missions.js';

export const EVENT_WASTED = 1;
export const EVENT_BUSTED = 2;
export const EVENT_MISSION = 4;
export const EVENT_WANTED_UP = 8;

const PARKED_SPOTS = [
  { x: 1330, y: 1210, angle: Math.PI / 2 }, { x: 860, y: 700, angle: 0 },
  { x: 1800, y: 1210, angle: Math.PI / 2 }, { x: 2300, y: 1150, angle: 0 },
  { x: 2800, y: 1600, angle: Math.PI / 2 }, { x: 300, y: 1600, angle: 0 },
  { x: 1300, y: 250, angle: Math.PI / 2 }, { x: 800, y: 2050, angle: 0 },
  { x: 2300, y: 2050, angle: Math.PI / 2 }, { x: 1800, y: 250, angle: 0 },
  { x: 1300, y: 700, angle: Math.PI / 2 }, { x: 800, y: 1150, angle: 0 },
];

const HEALTH_SPOTS = [
  { x: 980, y: 1330 }, { x: 1300, y: 650 }, { x: 2300, y: 1100 }, { x: 300, y: 700 },
];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const SILENT = {
  engine() {}, siren() {}, shot() {}, enemyShot() {}, blip() {}, crash() {},
  jingle() {}, fail() {}, arrest() {},
};

export function createWorld(seed) {
  const rng = createRandom(seed);
  const city = buildCity(rng);
  const fx = createEffects();

  const state = {
    seed,
    city,
    fx,
    time: 0,
    player: {
      x: 0, y: 0, angle: 0, health: PLAYER.health, ammo: PLAYER.magSize,
      fireTimer: 0, reloadTimer: 0, muzzle: 0, moving: false, car: null,
    },
    cars: [],
    policeCars: [],
    peds: [],
    cops: [],
    enemies: [],
    bullets: [],
    pickups: [],
    wanted: 0,
    wantedTimer: 0,
    lastShotWanted: -99,
    cash: 0,
    totalEarned: 0,
    best: 0,
    bustMeter: 0,
    hurtCd: 0,
    regenTimer: 0,
    camera: { x: 0, y: 0 },
    dusk: 0,
    mission: { index: 0, stage: 0, active: false, dialogue: null, dialogIdx: 0, dialogTimer: 0, stageTimer: 0, enemiesLeft: 0 },
    storyDone: false,
    gameOver: null,
    events: [],
  };

  function spawnTrafficCar() {
    const spot = city.randomRoadPoint();
    const car = {
      x: spot.x, y: spot.y, angle: spot.axis === 'v' ? (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (spot.dir > 0 ? 0 : Math.PI),
      speed: rng.range(140, 230), targetSpeed: rng.range(140, 230),
      color: rng.pick(PALETTE.traffic), police: false, parked: false, driver: true,
      axis: spot.axis, coord: spot.axis === 'v' ? spot.x : spot.y, dir: spot.dir, spin: 0,
    };
    // Nudge onto the right-hand lane.
    if (car.axis === 'v') car.x += 22 * (car.dir > 0 ? 1 : -1);
    else car.y += 22 * (car.dir > 0 ? -1 : 1);
    state.cars.push(car);
    return car;
  }

  function spawnPed() {
    const spot = city.randomRoadPoint();
    const side = rng.chance(0.5) ? 1 : -1;
    const ped = {
      x: spot.axis === 'v' ? spot.x + 62 * side : spot.x,
      y: spot.axis === 'v' ? spot.y : spot.y + 62 * side,
      angle: 0, speed: rng.range(40, 75), axis: spot.axis,
      coord: spot.axis === 'v' ? spot.x + 62 * side : spot.y + 62 * side,
      dir: spot.dir, color: rng.pick(PALETTE.ped),
      down: false, downTimer: 0, flee: false, fleeX: 0, fleeY: 0, panic: 0,
    };
    state.peds.push(ped);
    return ped;
  }

  function spawnPoliceCar() {
    const a = rng.range(0, Math.PI * 2);
    const spot = city.nearestRoadPoint(
      state.player.x + Math.cos(a) * 750,
      state.player.y + Math.sin(a) * 750,
    );
    const car = {
      x: spot.x, y: spot.y, angle: 0, speed: 0, targetSpeed: 600,
      color: PALETTE.police, police: true, parked: false, driver: false,
      axis: 'v', coord: spot.x, dir: 1, spin: 0, stuckTimer: 0,
    };
    state.policeCars.push(car);
    return car;
  }

  function spawnCop() {
    const a = rng.range(0, Math.PI * 2);
    const spot = city.nearestRoadPoint(
      state.player.x + Math.cos(a) * 420,
      state.player.y + Math.sin(a) * 420,
    );
    state.cops.push({ x: spot.x, y: spot.y, angle: 0, speed: 245, arrest: 0 });
  }

  function reset() {
    const p = state.player;
    p.x = city.playerStart.x;
    p.y = city.playerStart.y;
    p.angle = -Math.PI / 2;
    p.health = PLAYER.health;
    p.ammo = PLAYER.magSize;
    p.fireTimer = 0;
    p.reloadTimer = 0;
    p.muzzle = 0;
    p.car = null;
    state.cars = [];
    state.policeCars = [];
    state.peds = [];
    state.cops = [];
    state.enemies = [];
    state.bullets = [];
    state.pickups = [];
    for (const spot of PARKED_SPOTS) {
      state.cars.push({
        x: spot.x, y: spot.y, angle: spot.angle, speed: 0, targetSpeed: 0,
        color: rng.pick(PALETTE.traffic), police: false, parked: true, driver: false,
        axis: 'v', coord: spot.x, dir: 1, spin: 0,
      });
    }
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawnTrafficCar();
    for (let i = 0; i < PED_COUNT; i += 1) spawnPed();
    for (const spot of HEALTH_SPOTS) state.pickups.push({ x: spot.x, y: spot.y, kind: 'health' });
    state.wanted = 0;
    state.wantedTimer = 0;
    state.cash = 0;
    state.totalEarned = 0;
    state.bustMeter = 0;
    state.hurtCd = 0;
    state.time = 0;
    state.dusk = 0;
    state.mission = { index: 0, stage: 0, active: false, dialogue: null, dialogIdx: 0, dialogTimer: 0, stageTimer: 0, enemiesLeft: 0 };
    state.storyDone = false;
    state.gameOver = null;
    state.events = [];
    state.camera.x = clamp(p.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
    state.camera.y = clamp(p.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
  }

  /** Load a save (cash, mission progress, best) onto a fresh world. */
  function applySave(save) {
    if (!save) return;
    state.cash = save.cash || 0;
    state.totalEarned = save.best || 0;
    state.best = save.best || 0;
    state.mission.index = Math.min(save.missionIndex || 0, 4);
  }

  function respawn() {
    const p = state.player;
    p.x = city.playerStart.x;
    p.y = city.playerStart.y;
    p.angle = -Math.PI / 2;
    p.health = PLAYER.health;
    p.car = null;
    p.ammo = PLAYER.magSize;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.bustMeter = 0;
    state.policeCars = [];
    state.cops = [];
    state.enemies = [];
    state.bullets = [];
    state.mission.active = false;
    state.mission.stage = 0;
    state.mission.enemiesLeft = 0;
    state.gameOver = null;
  }

  function stepTraffic(dt) {
    const p = state.player;
    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      const car = state.cars[i];
      if (car.parked) continue;
      // Too far away to matter: recycle it near the player.
      if (Math.hypot(car.x - p.x, car.y - p.y) > 1500) {
        state.cars.splice(i, 1);
        spawnTrafficCar();
        continue;
      }
      let speed = car.targetSpeed;
      for (const other of state.cars) {
        if (other === car || other.parked) continue;
        if (other.axis !== car.axis || other.dir !== car.dir) continue;
        const along = car.axis === 'v' ? (other.y - car.y) * car.dir : (other.x - car.x) * car.dir;
        const across = car.axis === 'v' ? Math.abs(other.x - car.x) : Math.abs(other.y - car.y);
        if (along > 0 && along < 70 && across < 30) speed = Math.min(speed, Math.max(0, other.speed - 20));
      }
      car.speed += clamp(speed - car.speed, -300 * dt, 200 * dt);
      if (car.spin > 0) {
        car.spin -= dt;
        car.angle += 6 * dt;
        car.speed *= 1 - 2 * dt;
      }
      if (car.axis === 'v') car.y += car.dir * car.speed * dt;
      else car.x += car.dir * car.speed * dt;
      // Turn at an intersection sometimes, reverse at the edge of the city.
      const pos = car.axis === 'v' ? car.y : car.x;
      const roads = car.axis === 'v' ? [250, 700, 1150, 1600, 2050] : [300, 800, 1300, 1800, 2300, 2800];
      for (const cross of roads) {
        if (Math.abs(pos - cross) < 4 && rng.chance(0.12)) {
          car.axis = car.axis === 'v' ? 'h' : 'v';
          car.coord = cross;
          if (car.axis === 'v') {
            car.x = cross;
            car.dir = rng.chance(0.5) ? 1 : -1;
          } else {
            car.y = cross;
            car.dir = rng.chance(0.5) ? 1 : -1;
          }
          car.angle = car.axis === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
          break;
        }
      }
      if (car.axis === 'v') {
        if (car.y < 40 || car.y > 2200) car.dir *= -1;
      } else if (car.x < 40 || car.x > 3000) car.dir *= -1;
      car.angle = car.axis === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
      const out = { x: car.x, y: car.y };
      if (city.collide(car.x, car.y, 18, out)) {
        car.x = out.x;
        car.y = out.y;
        car.speed *= 0.5;
      }
    }
    // Keep the streets busy.
    let moving = 0;
    for (const car of state.cars) if (!car.parked) moving += 1;
    while (moving < TRAFFIC_COUNT) {
      spawnTrafficCar();
      moving += 1;
    }
  }

  function stepPeds(dt) {
    const p = state.player;
    for (let i = state.peds.length - 1; i >= 0; i -= 1) {
      const ped = state.peds[i];
      if (ped.down) {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) state.peds.splice(i, 1);
        continue;
      }
      if (Math.hypot(ped.x - p.x, ped.y - p.y) > 1400) {
        state.peds.splice(i, 1);
        spawnPed();
        continue;
      }
      if (ped.flee) {
        const a = Math.atan2(ped.y - ped.fleeY, ped.x - ped.fleeX);
        ped.x += Math.cos(a) * 130 * dt;
        ped.y += Math.sin(a) * 130 * dt;
        ped.angle = a;
        ped.panic -= dt;
        if (ped.panic <= 0) ped.flee = false;
        continue;
      }
      // A gunshot nearby sends everyone running.
      if (state.time - (state.lastShotTime || -99) < 0.5
        && Math.hypot(ped.x - p.x, ped.y - p.y) < 320) {
        ped.flee = true;
        ped.fleeX = p.x;
        ped.fleeY = p.y;
        ped.panic = 3;
        continue;
      }
      const speed = ped.speed;
      if (ped.axis === 'v') ped.y += ped.dir * speed * dt;
      else ped.x += ped.dir * speed * dt;
      ped.angle = ped.axis === 'v' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI);
      const pos = ped.axis === 'v' ? ped.y : ped.x;
      const roads = ped.axis === 'v' ? [250, 700, 1150, 1600, 2050] : [300, 800, 1300, 1800, 2300, 2800];
      for (const cross of roads) {
        if (Math.abs(pos - cross) < 3 && rng.chance(0.1)) {
          ped.axis = ped.axis === 'v' ? 'h' : 'v';
          ped.dir = rng.chance(0.5) ? 1 : -1;
          break;
        }
      }
      if (ped.axis === 'v' && (ped.y < 50 || ped.y > 2190)) ped.dir *= -1;
      if (ped.axis === 'h' && (ped.x < 50 || ped.x > 2990)) ped.dir *= -1;
    }
    while (state.peds.length < PED_COUNT) spawnPed();
  }

  function stepPolice(dt, audio) {
    const p = state.player;
    const wanted = state.wanted;
    const wantCars = wanted === 0 ? 0 : Math.min(wanted + 1, 6);
    while (state.policeCars.length < wantCars) spawnPoliceCar();
    while (state.policeCars.length > wantCars) state.policeCars.pop();
    const wantCops = !p.car && wanted > 0 ? Math.min(wanted, 3) : 0;
    while (state.cops.length < wantCops) spawnCop();
    while (state.cops.length > wantCops) state.cops.pop();

    let near = false;
    for (let i = state.policeCars.length - 1; i >= 0; i -= 1) {
      const car = state.policeCars[i];
      const dx = p.x - car.x;
      const dy = p.y - car.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1600) {
        state.policeCars.splice(i, 1);
        continue;
      }
      if (dist < 520) near = true;
      const targetAngle = Math.atan2(dy, dx);
      car.angle += clamp(angleDiff(car.angle, targetAngle), -2.4 * dt, 2.4 * dt);
      const targetSpeed = dist > 300 ? 640 : 520;
      car.speed += clamp(targetSpeed - car.speed, -700 * dt, 420 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      const out = { x: car.x, y: car.y };
      if (city.collide(car.x, car.y, 20, out) || city.onWater(car.x, car.y)) {
        car.x = out.x;
        car.y = out.y;
        car.speed *= 0.4;
        car.stuckTimer = (car.stuckTimer || 0) + dt;
        if (car.stuckTimer > 2.5) {
          const spot = city.nearestRoadPoint(p.x + (rng.chance(0.5) ? 700 : -700), p.y);
          car.x = spot.x;
          car.y = spot.y;
          car.speed = 0;
          car.stuckTimer = 0;
        }
      } else {
        car.stuckTimer = 0;
      }
      // Ramming the player: a slow player car gets busted, a fast one gets away.
      if (dist < 56) {
        if (p.car && Math.abs(p.car.speed) < 90) state.bustMeter += dt;
        if (!p.car) {
          state.bustMeter += dt * 1.6;
          if (state.hurtCd <= 0) {
            p.health -= 15;
            state.hurtCd = 0.6;
            fx.addShake(0.4);
            audio.crash();
          }
        }
      }
    }

    for (const cop of state.cops) {
      const dx = p.x - cop.x;
      const dy = p.y - cop.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 520) near = true;
      cop.angle = Math.atan2(dy, dx);
      if (dist > 30) {
        cop.x += Math.cos(cop.angle) * cop.speed * dt;
        cop.y += Math.sin(cop.angle) * cop.speed * dt;
      }
      if (dist < 34) {
        cop.arrest += dt;
        state.bustMeter += dt * 0.8;
      } else {
        cop.arrest = Math.max(0, cop.arrest - dt);
      }
    }
    if (!near) state.bustMeter = Math.max(0, state.bustMeter - dt * 0.5);
    return near;
  }

  function stepBullets(dt, audio) {
    const p = state.player;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      let dead = b.life <= 0;
      if (!dead && city.hitsBuilding(b.x, b.y, 2)) {
        fx.sparks(b.x, b.y);
        dead = true;
      }
      if (!dead && b.fromPlayer) {
        for (const e of state.enemies) {
          if (!e.alive) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) < 18) {
            e.hp -= 1;
            fx.blood(e.x, e.y);
            if (e.hp <= 0) {
              e.alive = false;
              state.mission.enemiesLeft -= 1;
              state.pickups.push({ x: e.x, y: e.y, kind: 'cash', amount: 120 });
              fx.cashBurst(e.x, e.y);
              audio.blip();
            }
            dead = true;
            break;
          }
        }
        if (!dead) {
          for (const ped of state.peds) {
            if (ped.down) continue;
            if (Math.hypot(ped.x - b.x, ped.y - b.y) < 14) {
              ped.down = true;
              ped.downTimer = 8;
              state.events.push({ type: 'wanted', amount: 1 });
              fx.blood(ped.x, ped.y);
              dead = true;
              break;
            }
          }
        }
      }
      if (!dead && !b.fromPlayer && !p.car) {
        if (Math.hypot(p.x - b.x, p.y - b.y) < 15) {
          p.health -= 12;
          state.hurtCd = 0.3;
          state.regenTimer = 0;
          fx.blood(p.x, p.y);
          fx.addShake(0.25);
          dead = true;
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
  }

  function stepEnemies(dt, audio) {
    const p = state.player;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy);
      e.angle = Math.atan2(dy, dx);
      if (dist > 260 && dist < 700) {
        e.x += Math.cos(e.angle) * 90 * dt;
        e.y += Math.sin(e.angle) * 90 * dt;
      }
      e.shootCd -= dt;
      if (e.shootCd <= 0 && dist < 520) {
        e.shootCd = 1.3 + rng.next() * 0.9;
        const a = e.angle + (rng.next() - 0.5) * 0.22;
        state.bullets.push({
          x: e.x + Math.cos(a) * 22, y: e.y + Math.sin(a) * 22,
          vx: Math.cos(a) * 780, vy: Math.sin(a) * 780,
          life: 0.8, fromPlayer: false,
        });
        fx.muzzle(e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26);
        audio.enemyShot();
      }
    }
  }

  function stepPickups(dt, audio) {
    const p = state.player;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pk = state.pickups[i];
      if (pk.hidden) {
        pk.respawn -= dt;
        if (pk.respawn <= 0) {
          pk.hidden = false;
          delete pk.respawn;
        }
        continue;
      }
      const d = Math.hypot(pk.x - p.x, pk.y - p.y);
      if (d < 30) {
        if (pk.kind === 'cash') {
          const amount = pk.amount || 60;
          state.cash += amount;
          state.totalEarned += amount;
          audio.blip();
          fx.cashBurst(pk.x, pk.y);
          state.pickups.splice(i, 1);
        } else if (pk.kind === 'health') {
          p.health = Math.min(PLAYER.health, p.health + 35);
          audio.blip();
          fx.dust(pk.x, pk.y);
          state.pickups.splice(i, 1);
          // The medkit comes back after a while.
          state.pickups.push({ x: pk.x, y: pk.y, kind: 'health', respawn: 25, hidden: true });
        }
      }
    }
  }

  function stepWanted(dt, policeNear, audio) {
    if (state.wanted === 0) {
      state.wantedTimer = 0;
      audio.siren(false, dt);
      return;
    }
    audio.siren(true, dt);
    if (!policeNear) {
      state.wantedTimer += dt;
      if (state.wantedTimer > WANTED.decayDelay) {
        state.wanted -= 1;
        state.wantedTimer = 0;
      }
    } else {
      state.wantedTimer = 0;
    }
  }

  /**
   * One fixed step. `input` is the normalized control state from the loop (or a shot's
   * autopilot): mx/my axes, run, handbrake, firing, aimX/aimY in world coordinates and
   * enterPressed for E. Returns EVENT_* flags.
   */
  function step(dt, input, audio) {
    const snd = audio || SILENT;
    let flags = 0;
    if (state.gameOver) return flags;
    state.time += dt;
    const missionBefore = state.mission.index;

    if (input.enterPressed) {
      // Starting a job: E at the gold marker (taking a car is handled in stepPlayer).
      if (!state.mission.active && missionPrompt(state)) {
        startMission(state, snd);
      }
    }
    stepPlayer(state, input, dt, city, fx, snd);
    updateMission(state, dt, snd);
    if (state.mission.index !== missionBefore) flags |= EVENT_MISSION;

    // Apply the events the player and the missions raised.
    for (const ev of state.events) {
      if (ev.type === 'wanted') {
        state.wanted = Math.min(WANTED.max, state.wanted + ev.amount);
        if (ev.amount > 0) flags |= EVENT_WANTED_UP;
      } else if (ev.type === 'setWanted') {
        state.wanted = Math.min(WANTED.max, ev.amount);
        flags |= EVENT_WANTED_UP;
      } else if (ev.type === 'shot') {
        if (state.time - state.lastShotWanted > 6) {
          state.lastShotWanted = state.time;
          state.wanted = Math.min(WANTED.max, state.wanted + 1);
          flags |= EVENT_WANTED_UP;
        }
        state.lastShotTime = state.time;
      } else if (ev.type === 'cashBurst') {
        fx.cashBurst(ev.x, ev.y);
      }
    }
    state.events.length = 0;

    stepTraffic(dt);
    stepPeds(dt);
    const policeNear = stepPolice(dt, snd);
    stepEnemies(dt, snd);
    stepBullets(dt, snd);
    stepPickups(dt, snd);
    stepWanted(dt, policeNear, snd);
    fx.step(dt);

    if (state.hurtCd > 0) state.hurtCd -= dt;
    state.regenTimer += dt;
    if (state.wanted === 0 && state.regenTimer > 5 && state.player.health < PLAYER.health) {
      state.player.health = Math.min(PLAYER.health, state.player.health + 1.5 * dt);
    }

    // Busted or wasted?
    if (state.player.health <= 0) {
      state.gameOver = 'wasted';
      state.cash = Math.max(0, state.cash - 200);
      snd.fail();
      flags |= EVENT_WASTED;
    } else if (state.bustMeter >= 1.5) {
      state.gameOver = 'busted';
      state.cash = Math.max(0, state.cash - 300);
      snd.arrest();
      flags |= EVENT_BUSTED;
    }

    // The camera chases the player, clamped to the city.
    const p = state.player;
    const tx = clamp(p.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
    const ty = clamp(p.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
    state.camera.x += (tx - state.camera.x) * Math.min(1, dt * 6);
    state.camera.y += (ty - state.camera.y) * Math.min(1, dt * 6);

    if (state.totalEarned > state.best) state.best = state.totalEarned;
    return flags;
  }

  reset();
  return { state, reset, step, applySave, respawn, startMission: (audio) => startMission(state, audio) };
}

export { STEP };
