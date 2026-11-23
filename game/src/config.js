// Solmar Bay — every tuning number and colour in one place. The world is a fixed 3200x2400
// coastal city; the camera shows a 1280x720 window of it, scaled to the browser window.

export const VIEW = { width: 1280, height: 720 };
export const WORLD = { width: 3200, height: 2400 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const ROAD = {
  width: 96,
  vertical: [300, 800, 1300, 1800, 2300, 2800],
  horizontal: [250, 700, 1150, 1600, 2050],
};

/** Water on the east edge, sand and sea along the south edge. */
export const WATER = { eastX: 3060, southY: 2340, beachY: 2220 };
export const HARBOR = { x0: 2848, x1: 3060, y0: 300, y1: 800 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 175,
  runSpeed: 265,
  health: 100,
  magSize: 12,
  reloadTime: 1.1,
  bulletSpeed: 950,
  bulletRange: 620,
  fireDelay: 0.14,
};

export const CAR = {
  length: 54,
  width: 26,
  accel: 560,
  brake: 900,
  maxSpeed: 640,
  maxReverse: 220,
  steer: 2.6,
  grip: 6.5,
};

export const TRAFFIC_COUNT = 26;
export const PED_COUNT = 42;
export const MAX_POLICE_CARS = 6;

export const WANTED = {
  decayDelay: 9,
  steal: 1,
  shoot: 1,
  killPed: 1,
  ramCop: 2,
  max: 5,
};

export const PALETTE = {
  sky: '#ffd9a0',
  grass: '#8fae5d',
  sand: '#e8cf9a',
  sea: '#2f7fa8',
  seaDeep: '#1f5f86',
  sidewalk: '#c9bda6',
  asphalt: '#3d3a38',
  asphaltLine: '#e8d27a',
  building: ['#e8a87c', '#d98c7a', '#e6c07a', '#a8b8c8', '#c98f9e', '#9db98a', '#d9b48f', '#b8a8cc'],
  downtown: ['#7a8ba0', '#8a7a9a', '#6a7a8a', '#9a8a6a'],
  warehouse: ['#8a7a6a', '#7a6a5a', '#9a8a7a'],
  house: ['#e8c8a0', '#d8b090', '#c8a878', '#e0b8b0'],
  park: '#7fae62',
  player: '#ffcf3f',
  playerShirt: '#2f6fd0',
  police: '#20242c',
  policeLight: ['#ff3b30', '#2f7bff'],
  ped: ['#d94f4f', '#4f8fd9', '#5fb85f', '#d9a04f', '#9a6fd9', '#e8e0d0', '#4fb8a8'],
  traffic: ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#6c3483', '#aab7b8', '#2e4053', '#d35400', '#7d3c98'],
  text: '#fff8ea',
  darkText: '#241f1a',
  muted: '#8b8578',
  hudPanel: 'rgba(20, 18, 16, 0.62)',
  marker: '#ffd94f',
  enemy: '#c22e2e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'solmar-bay.save.v1';

export const CREW = {
  hero: 'Milo Kade',
  fixer: 'Aunt Rosa',
  driver: 'Juno Park',
  hacker: 'Theo Marsh',
  muscle: 'Big Sal',
  rival: 'Vince Corso',
};
