// The story: five jobs for the fixer Aunt Rosa, from a first drive to a harbor heist.
// A mission is a list of stages; each stage is one job to do (reach a place, get in a
// car, grab something, lose the cops, take down a crew). The world calls updateMission
// every step; stages complete themselves when the player does the thing, the reward
// lands in cash, and the next job opens at its own marker. Between jobs the city is
// free roam.

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    reward: 300,
    start: { x: 1300, y: 1150 },
    intro: [
      { who: 'Aunt Rosa', text: "Milo. You're back in Solmar Bay, and the bay remembers you." },
      { who: 'Aunt Rosa', text: 'Prove you can still drive. Take the car by my garage to the Sunset Diner.' },
    ],
    outro: { who: 'Aunt Rosa', text: 'Smooth. Like you never left. There will be more work, Milo.' },
    stages: [
      { type: 'enterCar', text: 'Get in the car parked by Rosa\u2019s garage' },
      { type: 'driveTo', at: { x: 1800, y: 700 }, r: 90, text: 'Drive to the Sunset Diner' },
    ],
  },
  {
    id: 'the-pickup',
    title: 'The Pickup',
    reward: 500,
    start: { x: 1800, y: 700 },
    intro: [
      { who: 'Aunt Rosa', text: 'A package is waiting at the warehouse on Palm Row. No questions.' },
      { who: 'Juno Park', text: "I'll watch the scanners. You just drive, Milo." },
    ],
    outro: { who: 'Aunt Rosa', text: 'Package delivered, nobody hurt. That is how we work.' },
    stages: [
      { type: 'driveTo', at: { x: 2300, y: 1600 }, r: 90, text: 'Pick up the package at the warehouse' },
      { type: 'driveTo', at: { x: 800, y: 250 }, r: 90, text: 'Deliver it to the Coral Motel' },
    ],
  },
  {
    id: 'hot-pursuit',
    title: 'Hot Pursuit',
    reward: 800,
    start: { x: 800, y: 250 },
    intro: [
      { who: 'Theo Marsh', text: 'The bank on Harbor Row. Alarm goes in ninety seconds, tops.' },
      { who: 'Aunt Rosa', text: 'Grab the cash, then vanish. The beach shack is yours if you make it.' },
    ],
    outro: { who: 'Aunt Rosa', text: 'You lost them. The bay is yours again, Milo.' },
    stages: [
      { type: 'driveTo', at: { x: 2300, y: 700 }, r: 90, text: 'Get to the bank on Harbor Row' },
      { type: 'grab', at: { x: 2300, y: 700 }, r: 100, wanted: 3, text: 'Grab the cash from the bank' },
      { type: 'escape', at: { x: 300, y: 2050 }, text: 'Lose the cops, then reach the beach shack' },
      { type: 'driveTo', at: { x: 300, y: 2050 }, r: 90, text: 'Reach the beach shack' },
    ],
  },
  {
    id: 'rooftop-trouble',
    title: 'Rooftop Trouble',
    reward: 1200,
    start: { x: 300, y: 2050 },
    intro: [
      { who: 'Big Sal', text: "Vince Corso's crew is waiting in the alley off Palm Row. Four of them." },
      { who: 'Big Sal', text: 'You go in on foot. I watch the street. Make it quick, Milo.' },
    ],
    outro: { who: 'Big Sal', text: "Corso's boys won't be back. The alley is ours now." },
    stages: [
      { type: 'driveTo', at: { x: 1300, y: 1600 }, r: 110, text: 'Meet Big Sal at the alley off Palm Row' },
      {
        type: 'eliminate', count: 4, at: { x: 1300, y: 1600 },
        spawn: [
          { x: 1240, y: 1560 }, { x: 1360, y: 1560 }, { x: 1300, y: 1660 }, { x: 1240, y: 1660 },
        ],
        text: 'Take down all four of Corso\u2019s crew',
      },
    ],
  },
  {
    id: 'the-harbor-heist',
    title: 'The Harbor Heist',
    reward: 2500,
    start: { x: 1300, y: 1600 },
    intro: [
      { who: 'Aunt Rosa', text: 'The vault truck docks at the harbor tonight. One truck, one crew, one shot.' },
      { who: 'Theo Marsh', text: 'Harbor patrol will be all over you. Drive like the bay is burning.' },
    ],
    outro: { who: 'Aunt Rosa', text: 'Two and a half grand, and the whole harbor saw nothing. Welcome home, Milo.' },
    stages: [
      { type: 'driveTo', at: { x: 2800, y: 700 }, r: 110, text: 'Drive to the harbor vault' },
      { type: 'grab', at: { x: 2800, y: 700 }, r: 110, wanted: 4, text: 'Crack the vault truck and take the cash' },
      { type: 'escape', at: { x: 1300, y: 1150 }, text: 'Shake the harbor patrol' },
      { type: 'driveTo', at: { x: 1300, y: 1150 }, r: 90, text: 'Bring the money home to Rosa\u2019s garage' },
    ],
  },
];

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** The marker the minimap and the world should point at, or null. */
export function missionMarker(state) {
  const m = state.mission;
  if (m.index >= MISSIONS.length) return null;
  const def = MISSIONS[m.index];
  if (!m.active) return { x: def.start.x, y: def.start.y, start: true, title: def.title };
  const stage = def.stages[m.stage];
  if (!stage) return null;
  if (stage.type === 'enterCar') return { x: state.player.x, y: state.player.y, car: true };
  if (stage.at) return { x: stage.at.x, y: stage.at.y, start: false, title: def.title };
  return null;
}

/** The objective line the HUD banner shows. */
export function objectiveText(state) {
  const m = state.mission;
  if (m.index >= MISSIONS.length) return 'Story complete — Solmar Bay is yours. Free roam.';
  const def = MISSIONS[m.index];
  if (!m.active) return `Next job: ${def.title} — head to the gold marker`;
  const stage = def.stages[m.stage];
  if (!stage) return def.title;
  if (stage.type === 'eliminate') {
    return `${stage.text} (${m.enemiesLeft} left)`;
  }
  return `${def.title} — ${stage.text}`;
}

/** The prompt shown when the player stands at a job's start marker. */
export function missionPrompt(state) {
  const m = state.mission;
  if (m.active || m.index >= MISSIONS.length) return null;
  const def = MISSIONS[m.index];
  if (dist(state.player.x, state.player.y, def.start.x, def.start.y) < 130) {
    return `Press E — start job: ${def.title}`;
  }
  return null;
}

/** The dialogue line showing now, or null. */
export function currentDialogue(state) {
  const m = state.mission;
  if (!m.dialogue || m.dialogIdx >= m.dialogue.length) return null;
  return m.dialogue[m.dialogIdx];
}

function enterStage(state, audio) {
  const m = state.mission;
  const def = MISSIONS[m.index];
  const stage = def.stages[m.stage];
  if (!stage) return;
  m.stageTimer = 0;
  if (stage.type === 'eliminate') {
    m.enemiesLeft = stage.count;
    for (const spot of stage.spawn) {
      state.enemies.push({
        x: spot.x, y: spot.y, hp: 3, angle: 0,
        shootCd: 1 + Math.random(), alive: true,
      });
    }
  }
  if (stage.wanted) {
    state.events.push({ type: 'setWanted', amount: stage.wanted });
  }
  if (audio) audio.blip();
}

export function startMission(state, audio) {
  const m = state.mission;
  if (m.active || m.index >= MISSIONS.length) return;
  const def = MISSIONS[m.index];
  m.active = true;
  m.stage = 0;
  m.dialogue = def.intro.slice();
  m.dialogIdx = 0;
  m.dialogTimer = 0;
  enterStage(state, audio);
}

function completeMission(state, audio) {
  const m = state.mission;
  const def = MISSIONS[m.index];
  state.cash += def.reward;
  state.events.push({ type: 'cash', amount: def.reward });
  m.dialogue = [def.outro];
  m.dialogIdx = 0;
  m.dialogTimer = 0;
  m.active = false;
  m.stage = 0;
  m.index += 1;
  if (m.index >= MISSIONS.length) state.storyDone = true;
  if (audio) audio.jingle();
}

/** Advance the active mission one step; stage completions and rewards happen here. */
export function updateMission(state, dt, audio) {
  const m = state.mission;
  if (m.dialogue && m.dialogIdx < m.dialogue.length) {
    m.dialogTimer += dt;
    if (m.dialogTimer > 4.5) {
      m.dialogTimer = 0;
      m.dialogIdx += 1;
    }
  }
  if (!m.active || m.index >= MISSIONS.length) return;
  const def = MISSIONS[m.index];
  const stage = def.stages[m.stage];
  if (!stage) return;
  m.stageTimer += dt;
  const p = state.player;
  let done = false;
  if (stage.type === 'enterCar') done = p.car !== null;
  else if (stage.type === 'driveTo' || stage.type === 'reach' || stage.type === 'pickup' || stage.type === 'grab') {
    done = dist(p.x, p.y, stage.at.x, stage.at.y) < stage.r;
  } else if (stage.type === 'escape') {
    done = state.wanted === 0 && m.stageTimer > 2;
  } else if (stage.type === 'eliminate') {
    done = m.enemiesLeft <= 0;
  }
  if (!done) return;
  if (stage.type === 'grab') {
    state.events.push({ type: 'cashBurst', x: stage.at.x, y: stage.at.y });
  }
  m.stage += 1;
  if (m.stage >= def.stages.length) {
    completeMission(state, audio);
  } else {
    enterStage(state, audio);
  }
}
