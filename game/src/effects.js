// Juice: particles (sparks, smoke, dust, cash), skid marks left by hard driving and
// screen shake. The world spawns them; the renderer draws them. Nothing here knows
// about screens or input.

export function createEffects() {
  const particles = [];
  const skids = [];
  let trauma = 0;

  function burst(x, y, count, color, speed, life, size, gravity) {
    for (let i = 0; i < count; i += 1) {
      if (particles.length > 320) return;
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life * (0.6 + Math.random() * 0.4), maxLife: life,
        size: size * (0.6 + Math.random() * 0.8), color, gravity: gravity || 0,
      });
    }
  }

  return {
    particles,
    skids,
    get shake() {
      return trauma * trauma;
    },
    addShake(amount) {
      trauma = Math.min(1, trauma + amount);
    },
    sparks(x, y) {
      burst(x, y, 10, '#ffd94f', 320, 0.5, 3, 60);
    },
    smoke(x, y) {
      burst(x, y, 6, 'rgba(120, 116, 110, 0.55)', 60, 1.1, 7, -30);
    },
    dust(x, y) {
      burst(x, y, 4, 'rgba(200, 180, 140, 0.6)', 90, 0.7, 5, 0);
    },
    cashBurst(x, y) {
      burst(x, y, 14, '#3fae5a', 200, 0.9, 4, 160);
    },
    blood(x, y) {
      burst(x, y, 8, '#a02020', 180, 0.6, 4, 120);
    },
    muzzle(x, y) {
      burst(x, y, 5, '#ffe08a', 260, 0.16, 3, 0);
    },
    /** A skid segment from the rear wheels, fading over a few seconds. */
    skid(x1, y1, x2, y2) {
      if (skids.length > 240) skids.shift();
      skids.push({ x1, y1, x2, y2, life: 5 });
    },
    step(dt) {
      trauma = Math.max(0, trauma - dt * 1.6);
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - 1.8 * dt;
        p.vy *= 1 - 1.8 * dt;
      }
      for (let i = skids.length - 1; i >= 0; i -= 1) {
        skids[i].life -= dt;
        if (skids[i].life <= 0) skids.splice(i, 1);
      }
    },
  };
}
