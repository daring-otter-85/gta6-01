// Drawing only: the world's state and the current screen in, pixels out. The camera
// shows a 1280x720 window of the 3200x2400 city, scaled to fit the browser window.
// Sun-soaked palette, long building shadows, and a HUD with health, cash, wanted stars,
// a mission banner, a minimap and the controls hint.

import { FONT, PALETTE, ROAD, VIEW, WATER, WORLD } from './config.js';
import { missionMarker, objectiveText, currentDialogue, missionPrompt } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_BUSTED = 'busted';

const MINIMAP = { x: 16, y: 532, w: 232, h: 172 };

const fonts = new Map();
function fontFor(size) {
  if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
  return fonts.get(size);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, dpr: 1 };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    view.dpr = dpr;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  /** Canvas CSS pixels to logical 1280x720 coordinates. */
  function toLogical(px, py) {
    return { x: (px * view.dpr - view.x) / view.scale, y: (py * view.dpr - view.y) / view.scale };
  }

  function text(value, x, y, size, color, align, baseline) {
    ctx.font = fontFor(size);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = baseline || 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function drawCarShape(car, isPlayer) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Wheels.
    ctx.fillStyle = '#141414';
    ctx.fillRect(-20, -15, 12, 6);
    ctx.fillRect(-20, 9, 12, 6);
    ctx.fillRect(10, -15, 12, 6);
    ctx.fillRect(10, 9, 12, 6);
    // Body.
    ctx.fillStyle = car.color;
    roundRect(ctx, -27, -13, 54, 26, 7);
    ctx.fill();
    // Roof and windshield.
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(-6, -11, 16, 22);
    ctx.fillStyle = 'rgba(20,30,40,0.75)';
    ctx.fillRect(12, -10, 6, 20);
    ctx.fillStyle = 'rgba(20,30,40,0.55)';
    ctx.fillRect(-24, -10, 5, 20);
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(25, -10, 3, 5);
    ctx.fillRect(25, 5, 3, 5);
    if (car.police) {
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(-27, -13, 20, 26);
      const flash = Math.floor(performance.now() / 260) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#2f7bff';
      ctx.fillRect(-4, -13, 8, 5);
      ctx.fillStyle = flash ? '#2f7bff' : '#ff3b30';
      ctx.fillRect(-4, 8, 8, 5);
      text('PD', -14, 5, 11, '#20242c', 'center', 'middle');
    }
    if (isPlayer) {
      ctx.strokeStyle = '#ffd94f';
      ctx.lineWidth = 2;
      roundRect(ctx, -29, -15, 58, 30, 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPedShape(x, y, angle, color, down) {
    if (down) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(x, y, 14, 7, angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, 12, 6, angle, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x, y + 3, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * 12, y + Math.sin(angle) * 12);
    ctx.stroke();
  }

  function drawWorld(state) {
    const cam = state.camera;
    const shake = state.fx.shake;
    const sx = shake > 0 ? (Math.random() - 0.5) * shake * 22 : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake * 22 : 0;
    ctx.save();
    ctx.translate(-cam.x + sx, -cam.y + sy);

    const vx0 = cam.x - 40;
    const vy0 = cam.y - 40;
    const vx1 = cam.x + VIEW.width + 40;
    const vy1 = cam.y + VIEW.height + 40;

    // Ground: grass, then the beach, the sea and the parks.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(vx0, WATER.beachY, vx1 - vx0, WATER.southY - WATER.beachY);
    ctx.fillStyle = PALETTE.sea;
    ctx.fillRect(vx0, WATER.southY, vx1 - vx0, WORLD.height - WATER.southY);
    ctx.fillRect(WATER.eastX, vy0, WORLD.width - WATER.eastX, vy1 - vy0);
    ctx.fillStyle = PALETTE.seaDeep;
    for (let y = WATER.southY + 30; y < WORLD.height; y += 46) {
      ctx.fillRect(vx0, y, vx1 - vx0, 3);
    }
    for (let x = WATER.eastX + 40; x < WORLD.width; x += 60) {
      ctx.fillRect(x, vy0, 3, vy1 - vy0);
    }
    for (const park of state.city.parks) {
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(park.x + 80, park.y + 90, 26, 0, Math.PI * 2);
      ctx.arc(park.x + 300, park.y + 240, 34, 0, Math.PI * 2);
      ctx.fill();
    }

    // Roads: pale sidewalks, dark asphalt, dashed centre lines.
    const half = ROAD.width / 2;
    for (const vx of ROAD.vertical) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(vx - half - 16, vy0, ROAD.width + 32, vy1 - vy0);
      ctx.fillStyle = PALETTE.asphalt;
      ctx.fillRect(vx - half, vy0, ROAD.width, vy1 - vy0);
      ctx.fillStyle = PALETTE.asphaltLine;
      for (let y = Math.floor(vy0 / 44) * 44; y < vy1; y += 44) ctx.fillRect(vx - 2, y, 4, 22);
    }
    for (const hy of ROAD.horizontal) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(vx0, hy - half - 16, vx1 - vx0, ROAD.width + 32);
      ctx.fillStyle = PALETTE.asphalt;
      ctx.fillRect(vx0, hy - half, vx1 - vx0, ROAD.width);
      ctx.fillStyle = PALETTE.asphaltLine;
      for (let x = Math.floor(vx0 / 44) * 44; x < vx1; x += 44) ctx.fillRect(x, hy - 2, 22, 4);
    }

    // Harbor piers.
    ctx.fillStyle = '#8a6a42';
    for (const pier of state.city.piers) ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (const pier of state.city.piers) {
      for (let x = pier.x + 10; x < pier.x + pier.w; x += 24) ctx.fillRect(x, pier.y, 2, pier.h);
    }

    // Buildings with long sun shadows and roof detail.
    const shadow = state.dusk > 0.5 ? 26 : 12;
    for (const b of state.city.buildings) {
      if (b.x > vx1 || b.x + b.w < vx0 || b.y > vy1 || b.y + b.h < vy0) continue;
      ctx.fillStyle = 'rgba(40, 26, 12, 0.3)';
      ctx.fillRect(b.x + shadow, b.y + shadow, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(b.x + 8, b.y + 8, 14, 10);
      ctx.fillRect(b.x + b.w - 24, b.y + b.h - 18, 14, 10);
      if (b.tall) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(b.x + b.w - 14, b.y, 14, b.h);
      }
      if (b.label) {
        ctx.fillStyle = 'rgba(20,16,12,0.85)';
        ctx.fillRect(b.x + 4, b.y + b.h / 2 - 11, b.w - 8, 22);
        text(b.label, b.x + b.w / 2, b.y + b.h / 2 + 5, 13, '#ffe9a8', 'center', 'middle');
      }
    }

    // Skid marks.
    ctx.strokeStyle = 'rgba(20,18,16,0.4)';
    ctx.lineWidth = 4;
    for (const s of state.fx.skids) {
      ctx.globalAlpha = Math.min(1, s.life / 2);
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Pickups.
    for (const pk of state.pickups) {
      if (pk.hidden) continue;
      if (pk.kind === 'cash') {
        ctx.fillStyle = '#3fae5a';
        ctx.beginPath();
        ctx.arc(pk.x, pk.y, 11, 0, Math.PI * 2);
        ctx.fill();
        text('$', pk.x, pk.y + 5, 14, '#fff', 'center', 'middle');
      } else {
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(pk.x - 11, pk.y - 11, 22, 22);
        ctx.fillStyle = '#d23b2e';
        ctx.fillRect(pk.x - 3, pk.y - 8, 6, 16);
        ctx.fillRect(pk.x - 8, pk.y - 3, 16, 6);
      }
    }

    // Mission marker: a pulsing gold ring and a beam of light.
    const marker = missionMarker(state);
    if (marker && !marker.car) {
      const pulse = 1 + Math.sin(state.time * 4) * 0.12;
      ctx.strokeStyle = PALETTE.marker;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 34 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 217, 79, 0.16)';
      ctx.fillRect(marker.x - 3, marker.y - 320, 6, 320);
      ctx.fillStyle = PALETTE.marker;
      ctx.save();
      ctx.translate(marker.x, marker.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-11, -11, 22, 22);
      ctx.restore();
      if (marker.start) {
        text('★', marker.x, marker.y - 44, 22, PALETTE.marker, 'center', 'middle');
      }
    }

    // Cars: parked and traffic, then the police, then the player's car.
    for (const car of state.cars) drawCarShape(car, false);
    for (const car of state.policeCars) drawCarShape(car, false);
    const p = state.player;
    if (p.car) drawCarShape(p.car, true);

    // Pedestrians, foot cops and the crew to take down.
    for (const ped of state.peds) drawPedShape(ped.x, ped.y, ped.angle, ped.color, ped.down);
    for (const cop of state.cops) {
      drawPedShape(cop.x, cop.y, cop.angle, '#2a3a5a', false);
      ctx.fillStyle = '#1c2940';
      ctx.beginPath();
      ctx.arc(cop.x, cop.y - 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const e of state.enemies) {
      if (!e.alive) continue;
      drawPedShape(e.x, e.y, e.angle, PALETTE.enemy, false);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.angle) * 24, e.y + Math.sin(e.angle) * 24);
      ctx.stroke();
      // Health ticks above the head.
      ctx.fillStyle = '#20242c';
      ctx.fillRect(e.x - 14, e.y - 24, 28, 5);
      ctx.fillStyle = '#e5534b';
      ctx.fillRect(e.x - 14, e.y - 24, 28 * (e.hp / 3), 5);
    }

    // Milo on foot, gun out where the mouse points.
    if (!p.car) {
      const blink = p.health < 30 && Math.floor(state.time * 6) % 2 === 0;
      if (!blink) {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 4, 11, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.playerShirt;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.player;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + Math.cos(p.angle) * 24, p.y + Math.sin(p.angle) * 24);
        ctx.stroke();
        if (p.muzzle > 0) {
          ctx.fillStyle = '#ffe08a';
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(p.angle) * 28, p.y + Math.sin(p.angle) * 28, 8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Bullets as tracers.
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = 2;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.stroke();
    }

    // Particles.
    for (const pt of state.fx.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Dusk: a warm wash over the whole frame.
    if (state.dusk > 0) {
      ctx.fillStyle = `rgba(255, 110, 40, ${0.14 * state.dusk})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.fillStyle = `rgba(60, 20, 60, ${0.08 * state.dusk})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  function drawMinimap(state) {
    const m = MINIMAP;
    const sx = m.w / WORLD.width;
    const sy = m.h / WORLD.height;
    ctx.fillStyle = 'rgba(16, 18, 22, 0.78)';
    ctx.fillRect(m.x - 4, m.y - 4, m.w + 8, m.h + 8);
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.x, m.y, m.w, m.h);
    ctx.clip();
    ctx.fillStyle = '#5d7a44';
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.fillStyle = '#2f7fa8';
    ctx.fillRect(m.x + WATER.eastX * sx, m.y, m.w - WATER.eastX * sx, m.h);
    ctx.fillRect(m.x, m.y + WATER.southY * sy, m.w, m.h - WATER.southY * sy);
    ctx.fillStyle = '#e8cf9a';
    ctx.fillRect(m.x, m.y + WATER.beachY * sy, m.w, (WATER.southY - WATER.beachY) * sy);
    ctx.strokeStyle = '#3d3a38';
    ctx.lineWidth = 2;
    for (const vx of ROAD.vertical) {
      ctx.beginPath();
      ctx.moveTo(m.x + vx * sx, m.y);
      ctx.lineTo(m.x + vx * sx, m.y + m.h);
      ctx.stroke();
    }
    for (const hy of ROAD.horizontal) {
      ctx.beginPath();
      ctx.moveTo(m.x, m.y + hy * sy);
      ctx.lineTo(m.x + m.w, m.y + hy * sy);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (const car of state.cars) ctx.fillRect(m.x + car.x * sx - 1, m.y + car.y * sy - 1, 2, 2);
    const flash = Math.floor(state.time * 3) % 2 === 0;
    for (const car of state.policeCars) {
      ctx.fillStyle = flash ? '#ff3b30' : '#2f7bff';
      ctx.beginPath();
      ctx.arc(m.x + car.x * sx, m.y + car.y * sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const marker = missionMarker(state);
    if (marker && !marker.car) {
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.arc(m.x + marker.x * sx, m.y + marker.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const p = state.player;
    ctx.fillStyle = '#fff';
    ctx.save();
    ctx.translate(m.x + p.x * sx, m.y + p.y * sy);
    ctx.rotate(p.angle);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      m.x + state.camera.x * sx, m.y + state.camera.y * sy,
      VIEW.width * sx, VIEW.height * sy,
    );
    ctx.restore();
    text('SOLMAR BAY', m.x, m.y - 8, 12, PALETTE.text, 'left', 'alphabetic');
  }

  function drawHud(state, ui) {
    const p = state.player;
    ctx.textBaseline = 'alphabetic';
    // Top-left: health, cash, ammo.
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, 12, 12, 250, 86, 10);
    ctx.fill();
    text('MILO KADE', 24, 36, 15, PALETTE.text, 'left');
    ctx.fillStyle = '#20242c';
    ctx.fillRect(24, 46, 180, 12);
    ctx.fillStyle = p.health > 40 ? '#4fc25f' : '#e5534b';
    ctx.fillRect(24, 46, 180 * Math.max(0, p.health / 100), 12);
    text(`$${state.cash.toLocaleString('en-US')}`, 24, 84, 22, '#7de08a', 'left');
    if (!p.car) {
      text(p.reloadTimer > 0 ? 'RELOADING…' : `AMMO ${p.ammo} / 12`, 150, 84, 15, PALETTE.text, 'left');
    } else {
      const mph = Math.round(Math.abs(p.car.speed) * 0.12);
      text(`${mph} mph`, 150, 84, 15, PALETTE.text, 'left');
    }

    // Top-right: wanted stars.
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, VIEW.width - 212, 12, 200, 52, 10);
    ctx.fill();
    text('WANTED', VIEW.width - 200, 34, 13, PALETTE.muted, 'left');
    for (let i = 0; i < 5; i += 1) {
      text('★', VIEW.width - 200 + i * 34, 58, 26, i < state.wanted ? '#ffd94f' : 'rgba(255,255,255,0.25)', 'left');
    }

    // Top-centre: the mission banner.
    const objective = objectiveText(state);
    ctx.font = fontFor(17);
    const ow = ctx.measureText(objective).width + 36;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, (VIEW.width - ow) / 2, 12, ow, 40, 10);
    ctx.fill();
    text(objective, VIEW.width / 2, 39, 17, PALETTE.text, 'center', 'middle');

    // Busted meter, when the law is closing in.
    if (state.bustMeter > 0.05) {
      ctx.fillStyle = PALETTE.hudPanel;
      roundRect(ctx, VIEW.width / 2 - 150, 60, 300, 26, 8);
      ctx.fill();
      text('BUSTED', VIEW.width / 2 - 138, 78, 14, '#ff6b5e', 'left');
      ctx.fillStyle = '#20242c';
      ctx.fillRect(VIEW.width / 2 - 70, 66, 200, 12);
      ctx.fillStyle = '#ff6b5e';
      ctx.fillRect(VIEW.width / 2 - 70, 66, 200 * Math.min(1, state.bustMeter / 1.5), 12);
    }

    // Off-screen mission marker arrow.
    const marker = missionMarker(state);
    if (marker && !marker.car) {
      const mx = marker.x - state.camera.x;
      const my = marker.y - state.camera.y;
      if (mx < 0 || my < 0 || mx > VIEW.width || my > VIEW.height) {
        const cx = Math.max(30, Math.min(VIEW.width - 30, mx));
        const cy = Math.max(70, Math.min(VIEW.height - 30, my));
        const a = Math.atan2(my - cy, mx - cx);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.fillStyle = PALETTE.marker;
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-10, -10);
        ctx.lineTo(-10, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        const distM = Math.round(Math.hypot(marker.x - p.x, marker.y - p.y) / 10);
        text(`${distM}m`, cx, cy - 16, 14, PALETTE.marker, 'center', 'middle');
      }
    }

    drawMinimap(state);

    // Bottom-right: speed and the controls hint.
    if (p.car) {
      const mph = Math.round(Math.abs(p.car.speed) * 0.12);
      text(`${mph}`, VIEW.width - 24, VIEW.height - 104, 44, PALETTE.text, 'right');
      text('mph', VIEW.width - 24, VIEW.height - 78, 15, PALETTE.muted, 'right');
    }
    text('WASD drive / walk · E steal car · Space handbrake · Click shoot · Shift run', VIEW.width - 24, VIEW.height - 16, 13, 'rgba(255,248,234,0.75)', 'right');
    text('Esc pause · M mute · R restart job', VIEW.width - 24, VIEW.height - 34, 13, 'rgba(255,248,234,0.55)', 'right');
    if (ui.muted) text('MUTED', 24, VIEW.height - 16, 13, PALETTE.muted, 'left');

    // "Press E" prompt.
    const prompt = missionPrompt(state);
    if (prompt) {
      ctx.font = fontFor(18);
      const pw = ctx.measureText(prompt).width + 36;
      ctx.fillStyle = 'rgba(20,18,16,0.8)';
      roundRect(ctx, (VIEW.width - pw) / 2, VIEW.height - 150, pw, 40, 10);
      ctx.fill();
      text(prompt, VIEW.width / 2, VIEW.height - 123, 18, PALETTE.marker, 'center', 'middle');
    } else if (!p.car) {
      const near = state.cars.find((c) => Math.hypot(c.x - p.x, c.y - p.y) < 78);
      if (near) {
        text('Press E to get in', VIEW.width / 2, VIEW.height - 123, 18, PALETTE.text, 'center', 'middle');
      }
    }

    // Dialogue box.
    const line = currentDialogue(state);
    if (line) {
      ctx.fillStyle = 'rgba(20,18,16,0.82)';
      roundRect(ctx, VIEW.width / 2 - 320, VIEW.height - 210, 640, 52, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.marker;
      ctx.fillRect(VIEW.width / 2 - 320, VIEW.height - 210, 5, 52);
      text(`${line.who}:`, VIEW.width / 2 - 300, VIEW.height - 190, 15, PALETTE.marker, 'left');
      text(line.text, VIEW.width / 2 - 300, VIEW.height - 168, 16, PALETTE.text, 'left');
    }

    // Toast message from the loop (mission complete, saved, ...).
    if (ui.message) {
      ctx.font = fontFor(20);
      const mw = ctx.measureText(ui.message).width + 40;
      ctx.fillStyle = 'rgba(20,18,16,0.85)';
      roundRect(ctx, (VIEW.width - mw) / 2, 108, mw, 42, 10);
      ctx.fill();
      text(ui.message, VIEW.width / 2, 136, 20, '#7de08a', 'center', 'middle');
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 30 + 70;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    ctx.fillStyle = 'rgba(16, 14, 12, 0.88)';
    roundRect(ctx, x, y, width, height, 14);
    ctx.fill();
    ctx.strokeStyle = accent || PALETTE.marker;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, width, height, 14);
    ctx.stroke();
    text(title, VIEW.width / 2, y + 66, 44, PALETTE.text, 'center', 'middle');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, y + 118 + i * 30, 17, 'rgba(255,248,234,0.85)', 'center', 'middle');
    }
    text(prompt, VIEW.width / 2, y + height - 34, 19, accent || PALETTE.marker, 'center', 'middle');
  }

  function drawTitle(state, ui) {
    drawWorld(state);
    ctx.fillStyle = 'rgba(20, 14, 8, 0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    text('SOLMAR BAY', VIEW.width / 2, 130, 72, '#ffd94f', 'center', 'middle');
    text('A sun-soaked open-world crime story', VIEW.width / 2, 176, 22, PALETTE.text, 'center', 'middle');
    const lines = [
      'Milo Kade is back in Solmar Bay, broke and out of options.',
      'Aunt Rosa has work for a wheelman who can still drive.',
      'Steal cars. Outrun the police. Run five jobs. Get paid.',
      '',
      'WASD / arrows — walk & drive      E — steal / exit car',
      'Mouse + click — aim & shoot       Space — handbrake      Shift — run',
      'Esc / P — pause      M — mute      R — restart the job',
    ];
    if (ui.hasSave) {
      lines.push('');
      lines.push(`Continue: job ${ui.saveMission + 1} of 5 · $${ui.saveCash.toLocaleString('en-US')} in hand · best $${ui.saveBest.toLocaleString('en-US')}`);
    }
    const panelH = lines.length * 30 + 96;
    const py = 220;
    ctx.fillStyle = 'rgba(16, 14, 12, 0.82)';
    roundRect(ctx, (VIEW.width - 720) / 2, py, 720, panelH, 14);
    ctx.fill();
    ctx.strokeStyle = PALETTE.marker;
    ctx.lineWidth = 2;
    roundRect(ctx, (VIEW.width - 720) / 2, py, 720, panelH, 14);
    ctx.stroke();
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, py + 40 + i * 30, 17, 'rgba(255,248,234,0.9)', 'center', 'middle');
    }
    text(
      ui.hasSave ? 'Enter — new story · C — Continue' : 'Press Enter or click to start',
      VIEW.width / 2, py + panelH - 26, 20, PALETTE.marker, 'center', 'middle',
    );
  }

  /** Paint one frame: the world, then the HUD or a screen panel. */
  function draw(state, screen, ui) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1a140e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
      return;
    }
    drawWorld(state);
    drawHud(state, ui);
    if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(20,14,8,0.5)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('PAUSED', ['The bay will wait for you.', `Cash $${state.cash.toLocaleString('en-US')} · Job ${Math.min(state.mission.index + 1, 5)} of 5`], 'Press P or Esc to resume');
    } else if (screen === SCREEN_WASTED) {
      ctx.fillStyle = 'rgba(40,8,8,0.55)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('WASTED', ['Milo went down. The crew scraped him off Palm Row.', 'You lost $200. The job is still waiting at its marker.'], 'Press Enter to get back up', '#e5534b');
    } else if (screen === SCREEN_BUSTED) {
      ctx.fillStyle = 'rgba(8,12,40,0.55)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('BUSTED', ['The Solmar Bay PD took Milo in. Bail was not cheap.', 'You lost $300. The job is still waiting at its marker.'], 'Press Enter to walk free', '#5f8fd9');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toLogical, view };
}
