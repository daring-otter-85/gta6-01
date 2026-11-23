// Milo Kade on foot and behind the wheel. On foot he walks, runs and shoots where the
// mouse points; in a car the same keys drive it, with acceleration, steering that follows
// speed, a handbrake that breaks the rear loose, and collisions with buildings, traffic
// and pedestrians. Stealing is here too: E by a car takes it, E in a slow car steps out.

import { CAR, PLAYER, WANTED, WORLD } from './config.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** The nearest drivable car within maxDist of (x, y), or null. */
export function nearestCar(state, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function crashInto(state, speed, fx, audio) {
  if (Math.abs(speed) > 220) {
    fx.addShake(0.35);
    fx.sparks(state.player.x, state.player.y);
    audio.crash();
  } else if (Math.abs(speed) > 90) {
    fx.addShake(0.12);
  }
}

function driveCar(state, input, dt, city, fx, audio) {
  const p = state.player;
  const car = p.car;
  const throttle = -input.my;
  const offRoad = !city.isRoad(car.x, car.y) && !city.onBeach(car.x, car.y);
  const top = offRoad ? CAR.maxSpeed * 0.55 : CAR.maxSpeed;

  if (throttle > 0) car.speed += CAR.accel * throttle * dt;
  else if (throttle < 0) car.speed -= CAR.brake * dt;
  else car.speed -= car.speed * 0.9 * dt;
  if (input.handbrake) {
    car.speed -= car.speed * 2.4 * dt;
    car.drift = Math.min(1, (car.drift || 0) + dt * 3);
  } else {
    car.drift = Math.max(0, (car.drift || 0) - dt * 2);
  }
  car.speed = clamp(car.speed, -CAR.maxReverse, top);

  const steerAmount = CAR.steer * clamp(Math.abs(car.speed) / 260, 0, 1) * (car.drift > 0.4 ? 1.5 : 1);
  car.angle += input.mx * steerAmount * dt * (car.speed >= 0 ? 1 : -1);

  const fxDir = Math.cos(car.angle);
  const fyDir = Math.sin(car.angle);
  const prevX = car.x;
  const prevY = car.y;
  car.x += fxDir * car.speed * dt;
  car.y += fyDir * car.speed * dt;
  car.x = clamp(car.x, 20, WORLD.width - 20);
  car.y = clamp(car.y, 20, WORLD.height - 20);

  // Buildings stop the car hard; water stops it too.
  const out = { x: car.x, y: car.y };
  if (city.collide(car.x, car.y, 20, out) || city.onWater(car.x, car.y)) {
    if (city.onWater(car.x, car.y)) {
      out.x = prevX;
      out.y = prevY;
    }
    car.x = out.x;
    car.y = out.y;
    if (Math.abs(car.speed) > 120) crashInto(state, car.speed, fx, audio);
    car.speed *= -0.25;
  }

  // Skid marks and dust while the handbrake is down at speed.
  if (car.drift > 0.4 && Math.abs(car.speed) > 120) {
    const bx = car.x - fxDir * 20;
    const by = car.y - fyDir * 20;
    const px = -fyDir * 11;
    const py = fxDir * 11;
    fx.skid(bx + px, by + py, bx + px - fxDir * car.speed * dt, by + py - fyDir * car.speed * dt);
    fx.skid(bx - px, by - py, bx - px - fxDir * car.speed * dt, by - py - fyDir * car.speed * dt);
    if (Math.random() < 0.4) fx.smoke(bx, by);
  }

  // Shove traffic cars out of the way; a hard hit slows both down.
  for (const other of state.cars) {
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.01 && d < 46) {
      const push = (46 - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      other.x += nx * push;
      other.y += ny * push;
      car.x -= nx * push * 0.4;
      car.y -= ny * push * 0.4;
      if (Math.abs(car.speed) > 260) {
        other.speed = car.speed * 0.45;
        other.spin = 0.5;
        car.speed *= 0.55;
        crashInto(state, car.speed, fx, audio);
        fx.sparks(other.x, other.y);
      }
    }
  }

  // Running a pedestrian over at speed is a crime the whole street sees.
  for (const ped of state.peds) {
    if (ped.down) continue;
    if (Math.hypot(ped.x - car.x, ped.y - car.y) < 26 && Math.abs(car.speed) > 150) {
      ped.down = true;
      ped.downTimer = 6;
      state.events.push({ type: 'wanted', amount: WANTED.killPed });
      audio.crash();
      fx.addShake(0.3);
      fx.blood(ped.x, ped.y);
    }
  }

  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  audio.engine(Math.abs(car.speed) / CAR.maxSpeed);
}

function walkPlayer(state, input, dt, city, fx, audio) {
  const p = state.player;
  const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const len = Math.hypot(input.mx, input.my);
  if (len > 0) {
    const nx = input.mx / len;
    const ny = input.my / len;
    p.x += nx * speed * dt;
    p.y += ny * speed * dt;
    p.moving = true;
    if (!input.firing) p.angle = Math.atan2(ny, nx);
  } else {
    p.moving = false;
  }
  if (input.firing || input.mouseIn) p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);

  const out = { x: p.x, y: p.y };
  city.collide(p.x, p.y, PLAYER.radius, out);
  p.x = clamp(out.x, 16, WORLD.width - 16);
  p.y = clamp(out.y, 16, WORLD.height - 16);
  if (city.onWater(p.x, p.y)) {
    // The sea is a wall on foot: step back out of it.
    const near = city.nearestRoadPoint(p.x, p.y);
    p.x = near.x;
    p.y = near.y;
  }

  if (p.fireTimer > 0) p.fireTimer -= dt;
  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) p.ammo = PLAYER.magSize;
  }
  if (p.muzzle > 0) p.muzzle -= dt;

  if (input.firing && p.fireTimer <= 0 && p.reloadTimer <= 0) {
    if (p.ammo <= 0) {
      p.reloadTimer = PLAYER.reloadTime;
    } else {
      p.ammo -= 1;
      p.fireTimer = PLAYER.fireDelay;
      p.muzzle = 0.07;
      const a = p.angle;
      state.bullets.push({
        x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22,
        vx: Math.cos(a) * PLAYER.bulletSpeed, vy: Math.sin(a) * PLAYER.bulletSpeed,
        life: PLAYER.bulletRange / PLAYER.bulletSpeed, fromPlayer: true,
      });
      fx.muzzle(p.x + Math.cos(a) * 26, p.y + Math.sin(a) * 26);
      fx.addShake(0.06);
      audio.shot();
      if (state.wanted < WANTED.max) state.events.push({ type: 'wanted', amount: 0, shot: true });
    }
  }
  audio.engine(0);
}

/**
 * One fixed step of the player. `input` carries mx/my axes, run, handbrake, firing,
 * aimX/aimY in world coordinates and enterPressed for E. Events the step raises
 * (wanted changes, car stolen) go on state.events for the world to apply.
 */
export function stepPlayer(state, input, dt, city, fx, audio) {
  const p = state.player;
  if (p.car) {
    if (input.enterPressed && Math.abs(p.car.speed) < 70) {
      const car = p.car;
      car.speed = 0;
      car.parked = true;
      state.cars.push(car);
      p.car = null;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      p.angle = car.angle;
      audio.blip();
      return;
    }
    driveCar(state, input, dt, city, fx, audio);
    return;
  }

  walkPlayer(state, input, dt, city, fx, audio);

  if (input.enterPressed) {
    const car = nearestCar(state, p.x, p.y, 78);
    if (car) {
      const wasDriven = car.driver;
      if (wasDriven) {
        // Yank the driver out: he runs, and the street notices.
        state.peds.push({
          x: car.x + 24, y: car.y + 10, angle: 0, speed: 120,
          axis: 'h', coord: car.y, dir: 1, color: '#d94f4f',
          down: false, downTimer: 0, flee: true, fleeX: p.x, fleeY: p.y,
        });
        state.events.push({ type: 'wanted', amount: WANTED.steal });
      } else if (state.cops.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 380)
        || state.policeCars.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 380)) {
        state.events.push({ type: 'wanted', amount: WANTED.steal });
      }
      state.cars.splice(state.cars.indexOf(car), 1);
      p.car = car;
      car.parked = false;
      car.driver = false;
      audio.blip();
      fx.dust(p.x, p.y);
    }
  }
}

export { angleDiff };
