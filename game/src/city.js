// Solmar Bay itself: the road grid, the blocks between the roads, the buildings in them,
// the harbor piers, the beach and the sea, plus the geometry helpers the world and the
// renderer share (is this point on a road, where is the nearest road, push a circle out of
// a building). Everything is built from the seeded random generator, so one seed builds
// one city.

import { HARBOR, PALETTE, ROAD, WATER, WORLD } from './config.js';

// Bands of buildable land between the roads (road half-width kept clear on each side).
const COLS = [[40, 252], [348, 752], [848, 1252], [1348, 1752], [1848, 2252], [2348, 2752], [2848, 3012]];
const ROWS = [[40, 202], [298, 652], [748, 1102], [1198, 1552], [1648, 2002], [2098, 2200]];

function districtOf(x, y) {
  if (x > 2300 && y < 900) return 'harbor';
  if (y > 2050) return 'beach';
  if (x >= 800 && x <= 2300 && y >= 250 && y <= 1600) return 'downtown';
  if (x < 800) return 'suburbs';
  return 'uptown';
}

export function buildCity(rng) {
  const buildings = [];
  const parks = [];
  const piers = [];

  // Two green squares the city breathes in.
  parks.push({ x: 348, y: 1198, w: 404, h: 354 });
  parks.push({ x: 1848, y: 1648, w: 404, h: 354 });

  function inPark(x0, y0, x1, y1) {
    return parks.some((p) => x0 < p.x + p.w && x1 > p.x && y0 < p.y + p.h && y1 > p.y);
  }

  for (let c = 0; c < COLS.length; c += 1) {
    for (let r = 0; r < ROWS.length; r += 1) {
      const [x0, x1] = COLS[c];
      const [y0, y1] = ROWS[r];
      const district = districtOf((x0 + x1) / 2, (y0 + y1) / 2);
      // Rosa's garage block is laid out by hand below; the harbor blocks hold warehouses.
      if (c === 2 && r === 2) continue;
      if (inPark(x0, y0, x1, y1)) continue;
      if (district === 'harbor') {
        buildings.push({
          x: x0 + 8, y: y0 + 10, w: x1 - x0 - 16, h: y1 - y0 - 20,
          color: rng.pick(PALETTE.warehouse), tall: false, kind: 'warehouse',
        });
        continue;
      }
      const count = district === 'downtown' ? 2 : rng.chance(0.5) ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const w = district === 'suburbs' ? rng.range(70, 120) : rng.range(90, 170);
        const h = district === 'suburbs' ? rng.range(60, 100) : rng.range(80, 160);
        const palette = district === 'downtown' ? PALETTE.downtown
          : district === 'suburbs' ? PALETTE.house : PALETTE.building;
        const bx = x0 + rng.range(6, Math.max(7, x1 - x0 - w - 6));
        const by = y0 + rng.range(6, Math.max(7, y1 - y0 - h - 6));
        if (i === 1) {
          const first = buildings[buildings.length - 1];
          if (first && bx < first.x + first.w + 14 && bx + w > first.x - 14
            && by < first.y + first.h + 14 && by + h > first.y - 14) continue;
        }
        buildings.push({
          x: Math.round(bx), y: Math.round(by), w: Math.round(w), h: Math.round(h),
          color: rng.pick(palette), tall: district === 'downtown', kind: district,
        });
      }
    }
  }

  // Landmarks the story walks through, each with a painted sign.
  buildings.push({ x: 900, y: 1240, w: 150, h: 80, color: '#b8452f', tall: false, kind: 'garage', label: "ROSA'S" });
  buildings.push({ x: 1100, y: 1250, w: 90, h: 60, color: '#4f7a9a', tall: false, kind: 'shop', label: 'TUNER' });
  buildings.push({ x: 1860, y: 760, w: 100, h: 64, color: '#c98a4f', tall: false, kind: 'shop', label: 'DINER' });
  buildings.push({ x: 2360, y: 760, w: 120, h: 80, color: '#8a94a0', tall: false, kind: 'bank', label: 'BANK' });
  buildings.push({ x: 860, y: 300, w: 120, h: 64, color: '#a88ab0', tall: false, kind: 'shop', label: 'MOTEL' });
  buildings.push({ x: 340, y: 2140, w: 80, h: 56, color: '#7a6a4f', tall: false, kind: 'shack', label: 'SHACK' });
  buildings.push({ x: 2860, y: 760, w: 130, h: 90, color: '#6a7a6a', tall: false, kind: 'warehouse', label: 'VAULT' });

  // Wooden piers reaching into the eastern sea.
  piers.push({ x: 2900, y: 340, w: 150, h: 26 });
  piers.push({ x: 2900, y: 520, w: 150, h: 26 });
  piers.push({ x: 2900, y: 700, w: 150, h: 26 });

  const half = ROAD.width / 2;

  function isRoad(x, y) {
    if (x < 0 || y < 0 || x > WORLD.width || y > WORLD.height) return false;
    for (const vx of ROAD.vertical) if (Math.abs(x - vx) < half) return true;
    for (const hy of ROAD.horizontal) if (Math.abs(y - hy) < half) return true;
    return false;
  }

  function onWater(x, y) {
    return x >= WATER.eastX || y >= WATER.southY;
  }

  function onBeach(x, y) {
    return y >= WATER.beachY && y < WATER.southY;
  }

  /** The closest point on the road network to (x, y). */
  function nearestRoadPoint(x, y) {
    let bestV = ROAD.vertical[0];
    for (const vx of ROAD.vertical) if (Math.abs(vx - x) < Math.abs(bestV - x)) bestV = vx;
    let bestH = ROAD.horizontal[0];
    for (const hy of ROAD.horizontal) if (Math.abs(hy - y) < Math.abs(bestH - y)) bestH = hy;
    if (Math.abs(bestV - x) <= Math.abs(bestH - y)) return { x: bestV, y: Math.max(30, Math.min(WORLD.height - 30, y)) };
    return { x: Math.max(30, Math.min(WORLD.width - 30, x)), y: bestH };
  }

  function randomRoadPoint() {
    if (rng.chance(0.5)) {
      return { x: rng.pick(ROAD.vertical), y: rng.range(60, 2180), axis: 'v', dir: rng.chance(0.5) ? 1 : -1 };
    }
    return { x: rng.range(60, 2980), y: rng.pick(ROAD.horizontal), axis: 'h', dir: rng.chance(0.5) ? 1 : -1 };
  }

  /**
   * Push a circle of radius r at (x, y) out of every building it overlaps.
   * Returns true when something was hit, and writes the corrected position into out.
   */
  function collide(x, y, r, out) {
    let hit = false;
    out.x = x;
    out.y = y;
    for (const b of buildings) {
      if (out.x + r <= b.x || out.x - r >= b.x + b.w || out.y + r <= b.y || out.y - r >= b.y + b.h) continue;
      hit = true;
      const pushLeft = (out.x + r) - b.x;
      const pushRight = (b.x + b.w) - (out.x - r);
      const pushUp = (out.y + r) - b.y;
      const pushDown = (b.y + b.h) - (out.y - r);
      const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
      if (min === pushLeft) out.x = b.x - r;
      else if (min === pushRight) out.x = b.x + b.w + r;
      else if (min === pushUp) out.y = b.y - r;
      else out.y = b.y + b.h + r;
    }
    return hit;
  }

  function hitsBuilding(x, y, r) {
    for (const b of buildings) {
      if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
    }
    return null;
  }

  return {
    buildings, parks, piers,
    isRoad, onWater, onBeach, nearestRoadPoint, randomRoadPoint, collide, hitsBuilding,
    districtAt: districtOf,
    playerStart: { x: 1300, y: 1230 },
    garage: { x: 1300, y: 1150 },
  };
}
