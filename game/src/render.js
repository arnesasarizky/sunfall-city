// Sunfall City — the renderer: one canvas, one follow camera, a whole
// golden-hour harbour town painted from plain state every frame.
// draw(state) reads:
//   state.city     a buildCity() city
//   state.player   { x, y, angle, color, onFoot } (drawn only when onFoot;
//                  while driving, world keeps Juno's car in state.cars with
//                  driver 'player')
//   state.cars     cars { x, y, angle, color, kind, driver, dead }
//   state.cops     cruisers, same car shape (may also live in state.cars)
//   state.peds     peds { x, y, angle, color, state, rival }
//   state.tracers  [{ x1, y1, x2, y2, life }] — life counts down from ~0.09
//   state.particles[{ x, y, life, maxLife, color, size }]
//   state.camera   { x, y } view centre (clamped to the world here)
//   state.objective{ x, y } | null — a pillar of light on the goal
//   state.time     seconds, for water shimmer and lamp glow

import { COLORS } from './config.js';

const TRACER_FULL = 0.09;

function rr(g, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + q, y);
  g.arcTo(x + w, y, x + w, y + h, q);
  g.arcTo(x + w, y + h, x, y + h, q);
  g.arcTo(x, y + h, x, y, q);
  g.arcTo(x, y, x + w, y, q);
  g.closePath();
}

function shade(hex) {
  // Cheap darker twin of a #rrggbb colour for roofs/cabins.
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return '#5a4632';
  const r = Math.max(0, ((n >> 16) & 255) - 45);
  const gg = Math.max(0, ((n >> 8) & 255) - 45);
  const b = Math.max(0, (n & 255) - 45);
  return `rgb(${r}, ${gg}, ${b})`;
}

export function createRenderer(canvas) {
  const g = canvas.getContext('2d');

  function draw(state) {
    const { city, time } = state;
    const vw = canvas.width;
    const vh = canvas.height;
    // Camera: centre on state.camera, kept inside the world where it fits.
    const cx = vw >= city.w ? city.w / 2 : Math.max(vw / 2, Math.min(city.w - vw / 2, state.camera.x));
    const cy = vh >= city.h ? city.h / 2 : Math.max(vh / 2, Math.min(city.h - vh / 2, state.camera.y));
    const ox = cx - vw / 2; // world coords of the view's top-left
    const oy = cy - vh / 2;
    const inView = (x, y, m) => x > ox - m && x < ox + vw + m && y > oy - m && y < oy + vh + m;

    g.save();
    // Open water everywhere; land painted over it.
    g.fillStyle = COLORS.waterDeep;
    g.fillRect(0, 0, vw, vh);
    g.translate(-ox, -oy);

    drawGround(state, inView);
    if (state.objective) drawObjective(state.objective, time);
    drawBuildings(city, inView);
    drawProps(city, time, inView);
    drawTracers(state.tracers || []);
    for (const car of state.cars || []) if (inView(car.x, car.y, 70)) drawCar(car, false);
    for (const cop of state.cops || []) if (inView(cop.x, cop.y, 70)) drawCar(cop, true);
    for (const ped of state.peds || []) if (inView(ped.x, ped.y, 30)) drawPed(ped, false);
    if (state.player && state.player.onFoot && inView(state.player.x, state.player.y, 30)) {
      drawPed(state.player, true);
    }
    drawParticles(state.particles || []);
    g.restore();

    drawGrade(vw, vh);
  }

  function drawGround(state, inView) {
    const { city, time } = state;
    const H = city.h;
    // Landmass: block ground up to the sand, sand to the boardwalk.
    g.fillStyle = COLORS.block;
    g.fillRect(0, 0, city.beach.x0, H);
    g.fillStyle = COLORS.sand;
    g.fillRect(city.beach.x0, 0, city.boardwalk.x1 - city.beach.x0, H);
    g.fillStyle = COLORS.sandWet;
    g.fillRect(city.boardwalk.x0 - 10, 0, 10, H);
    // Boardwalk planks.
    g.fillStyle = COLORS.boardwalk;
    g.fillRect(city.boardwalk.x0, 0, city.boardwalk.x1 - city.boardwalk.x0, H);
    g.strokeStyle = 'rgba(90, 60, 35, 0.35)';
    g.lineWidth = 1;
    g.beginPath();
    for (let y = 12; y < H; y += 24) {
      g.moveTo(city.boardwalk.x0, y);
      g.lineTo(city.boardwalk.x1, y);
    }
    g.stroke();
    // Water: a deep base with slow bright shimmer drifting on time.
    g.fillStyle = COLORS.water;
    g.globalAlpha = 0.5;
    g.fillRect(city.water.x0, 0, city.water.x1 - city.water.x0, H);
    g.globalAlpha = 1;
    g.strokeStyle = COLORS.waterShine;
    g.globalAlpha = 0.35;
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < 26; i += 1) {
      const y = ((i * 173 + Math.floor(time * 12)) % (H + 60)) - 30;
      const x = city.water.x0 + 18 + ((i * 389) % Math.max(30, city.water.x1 - city.water.x0 - 50));
      const len = 14 + (i % 4) * 7;
      g.moveTo(x, y);
      g.lineTo(x + len, y);
    }
    g.stroke();
    g.globalAlpha = 1;
    // The pier deck, out over the water.
    g.fillStyle = COLORS.pier;
    g.fillRect(city.pier.x, city.pier.y, city.pier.w, city.pier.h);
    g.strokeStyle = 'rgba(80, 55, 30, 0.5)';
    g.lineWidth = 1;
    g.strokeRect(city.pier.x, city.pier.y, city.pier.w, city.pier.h);
    // Lots (plazas, parking, groves) sit on the blocks.
    for (const lot of city.lots) {
      if (!inView(lot.x + lot.w / 2, lot.y + lot.h / 2, Math.max(lot.w, lot.h))) continue;
      g.fillStyle = lot.ground === 'plaza' ? COLORS.plaza : lot.ground === 'parking' ? COLORS.parking : COLORS.grove;
      g.fillRect(lot.x, lot.y, lot.w, lot.h);
      if (lot.ground === 'parking') {
        g.strokeStyle = 'rgba(240, 230, 210, 0.4)';
        g.lineWidth = 2;
        g.beginPath();
        for (let x = lot.x + 14; x < lot.x + lot.w - 6; x += 26) {
          g.moveTo(x, lot.y + 6);
          g.lineTo(x, lot.y + 22);
          g.moveTo(x, lot.y + lot.h - 22);
          g.lineTo(x, lot.y + lot.h - 6);
        }
        g.stroke();
      }
    }
    // Sidewalk aprons first (a wider pale strip), road surface on top.
    const sw = city.sidewalkW;
    const rw = city.roadW;
    g.fillStyle = COLORS.sidewalk;
    for (const x of city.roadsX) g.fillRect(x - rw / 2 - sw, 0, rw + sw * 2, H);
    for (const y of city.roadsY) g.fillRect(0, y - rw / 2 - sw, city.boardwalk.x0, rw + sw * 2);
    g.fillStyle = COLORS.road;
    for (const x of city.roadsX) g.fillRect(x - rw / 2, 0, rw, H);
    for (const y of city.roadsY) g.fillRect(0, y - rw / 2, city.boardwalk.x0, rw);
    // Edge lines and dashed centrelines.
    g.strokeStyle = COLORS.roadEdge;
    g.lineWidth = 3;
    g.beginPath();
    for (const x of city.roadsX) {
      g.moveTo(x - rw / 2, 0); g.lineTo(x - rw / 2, H);
      g.moveTo(x + rw / 2, 0); g.lineTo(x + rw / 2, H);
    }
    for (const y of city.roadsY) {
      g.moveTo(0, y - rw / 2); g.lineTo(city.boardwalk.x0, y - rw / 2);
      g.moveTo(0, y + rw / 2); g.lineTo(city.boardwalk.x0, y + rw / 2);
    }
    g.stroke();
    g.strokeStyle = COLORS.lane;
    g.lineWidth = 3;
    g.setLineDash([18, 22]);
    g.beginPath();
    for (const x of city.roadsX) { g.moveTo(x, 0); g.lineTo(x, H); }
    for (const y of city.roadsY) { g.moveTo(0, y); g.lineTo(city.boardwalk.x0, y); }
    g.stroke();
    g.setLineDash([]);
  }

  function drawObjective(obj, time) {
    const pulse = 0.75 + Math.sin(time * 4) * 0.25;
    const grad = g.createLinearGradient(obj.x, obj.y - 190, obj.x, obj.y);
    grad.addColorStop(0, 'rgba(255, 214, 120, 0)');
    grad.addColorStop(1, `rgba(255, 214, 120, ${0.5 * pulse})`);
    g.fillStyle = grad;
    g.fillRect(obj.x - 13, obj.y - 190, 26, 190);
    g.strokeStyle = `rgba(255, 224, 150, ${0.85 * pulse})`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(obj.x, obj.y, 17 + Math.sin(time * 4) * 3, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#ffe9b0';
    g.beginPath();
    g.arc(obj.x, obj.y, 4.5, 0, Math.PI * 2);
    g.fill();
  }

  function drawBuildings(city, inView) {
    for (const b of city.buildings) {
      if (!inView(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
      // Long low sun throws every shadow east.
      g.fillStyle = 'rgba(60, 30, 20, 0.28)';
      g.fillRect(b.x + 9, b.y + 11, b.w, b.h);
      g.fillStyle = b.color;
      g.fillRect(b.x, b.y, b.w, b.h);
      const inset = 6 + (b.floors || 1) * 2;
      g.fillStyle = b.kind === 'garage' ? COLORS.garageDoor : (b.floors > 3 ? COLORS.roofDark : COLORS.roof);
      g.fillRect(b.x + inset, b.y + inset, Math.max(4, b.w - inset * 2), Math.max(4, b.h - inset * 2));
      if (b.kind === 'garage') {
        g.fillStyle = COLORS.sun;
        g.font = 'bold 13px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText('SUNFALL GARAGE', b.x + b.w / 2, b.y + b.h + 16);
        g.fillStyle = '#ffd98e';
        g.fillRect(b.x + b.w / 2 - 16, b.y + b.h - 4, 32, 5);
      } else {
        // A few lit windows catching the evening.
        g.fillStyle = 'rgba(255, 214, 130, 0.75)';
        const cols = Math.max(1, Math.floor(b.w / 26));
        const rows = Math.max(1, Math.floor(b.h / 26));
        for (let i = 0; i < cols; i += 1) {
          for (let j = 0; j < rows; j += 1) {
            if ((i * 7 + j * 13 + Math.floor(b.x + b.y)) % 3 === 0) {
              g.fillRect(b.x + 9 + i * 26, b.y + 9 + j * 26, 7, 5);
            }
          }
        }
      }
    }
  }

  function drawProps(city, time, inView) {
    for (const p of city.props) {
      if (!inView(p.x, p.y, 40)) continue;
      if (p.kind === 'palm') {
        g.strokeStyle = COLORS.palmTrunk;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.quadraticCurveTo(p.x + 3, p.y - 9, p.x + 6, p.y - 15);
        g.stroke();
        g.strokeStyle = COLORS.palm;
        g.lineWidth = 2.5;
        g.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + 0.4;
          g.moveTo(p.x + 6, p.y - 15);
          g.quadraticCurveTo(
            p.x + 6 + Math.cos(a) * 9, p.y - 15 + Math.sin(a) * 6 - 3,
            p.x + 6 + Math.cos(a) * 15, p.y - 15 + Math.sin(a) * 10 + 4,
          );
        }
        g.stroke();
      } else if (p.kind === 'lamp') {
        g.strokeStyle = COLORS.lamp;
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x, p.y - 13);
        g.stroke();
        const glow = 0.55 + Math.sin(time * 2 + p.x) * 0.1;
        g.fillStyle = `rgba(255, 205, 110, ${glow})`;
        g.beginPath();
        g.arc(p.x, p.y - 15, 4, 0, Math.PI * 2);
        g.fill();
      } else if (p.kind === 'bench') {
        g.fillStyle = '#7c5a3c';
        g.fillRect(p.x - 8, p.y - 3, 16, 6);
        g.fillStyle = 'rgba(60, 30, 20, 0.25)';
        g.fillRect(p.x - 8, p.y + 3, 16, 2);
      }
    }
  }

  function drawTracers(tracers) {
    g.lineWidth = 2;
    for (const t of tracers) {
      const a = Math.max(0, Math.min(1, t.life / TRACER_FULL));
      g.strokeStyle = `rgba(255, 236, 170, ${a * 0.9})`;
      g.beginPath();
      g.moveTo(t.x1, t.y1);
      g.lineTo(t.x2, t.y2);
      g.stroke();
    }
  }

  function drawCar(car, forceCop) {
    const isCop = forceCop || car.driver === 'cop' || car.kind === 'cruiser';
    g.save();
    g.translate(car.x, car.y);
    g.rotate(car.angle);
    g.fillStyle = 'rgba(50, 25, 15, 0.3)';
    rr(g, -20, -8, 46, 24, 7);
    g.fill();
    g.fillStyle = car.dead ? '#4a423e' : (isCop ? '#2e3440' : car.color);
    rr(g, -23, -12, 46, 24, 7);
    g.fill();
    // Cabin glass and a darker rear deck.
    g.fillStyle = car.dead ? '#37312e' : '#bfe0e8';
    rr(g, -6, -9, 15, 18, 4);
    g.fill();
    g.fillStyle = car.dead ? '#2e2a27' : (isCop ? '#232833' : shade(car.color || '#d9d3c3'));
    rr(g, -15, -10, 9, 20, 3);
    g.fill();
    if (isCop && !car.dead) {
      // Light bar: red one side, blue the other.
      g.fillStyle = '#e33f3f';
      g.fillRect(-4, -8, 8, 6);
      g.fillStyle = '#3f6fe3';
      g.fillRect(-4, 2, 8, 6);
    }
    // Headlights at the nose (+x), tail lights behind.
    g.fillStyle = '#ffeeb8';
    g.fillRect(21, -9, 3, 5);
    g.fillRect(21, 4, 3, 5);
    g.fillStyle = 'rgba(255, 120, 90, 0.9)';
    g.fillRect(-24, -9, 2.5, 5);
    g.fillRect(-24, 4, 2.5, 5);
    if (car.dead) {
      g.fillStyle = 'rgba(30, 28, 26, 0.85)';
      g.beginPath();
      g.arc(14, -4, 6, 0, Math.PI * 2);
      g.arc(6, 5, 4.5, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  function drawPed(ped, isPlayer) {
    g.save();
    g.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      g.rotate(ped.angle || 0);
      g.fillStyle = 'rgba(50, 25, 15, 0.25)';
      g.beginPath();
      g.ellipse(1, 2, 13, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ped.color;
      g.beginPath();
      g.ellipse(0, 0, 12, 5.5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e8c39a';
      g.beginPath();
      g.arc(-11, 0, 3.6, 0, Math.PI * 2);
      g.fill();
      g.restore();
      return;
    }
    g.fillStyle = 'rgba(50, 25, 15, 0.28)';
    g.beginPath();
    g.ellipse(1.5, 2.5, 8, 5.5, 0, 0, Math.PI * 2);
    g.fill();
    if (ped.rival) {
      g.strokeStyle = '#7fd4c9';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, 10.5, 0, Math.PI * 2);
      g.stroke();
    }
    if (isPlayer) {
      g.strokeStyle = '#fff3d6';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, 10.5, 0, Math.PI * 2);
      g.stroke();
    }
    g.rotate(ped.angle || 0);
    g.fillStyle = ped.color;
    g.beginPath();
    g.arc(0, 0, 7.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8c39a';
    g.beginPath();
    g.arc(2.5, 0, 3.8, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function drawParticles(particles) {
    for (const p of particles) {
      const a = Math.max(0, Math.min(1, p.life / (p.maxLife || 1)));
      g.globalAlpha = a;
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, (p.size || 3) * (0.5 + a * 0.5), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  function drawGrade(vw, vh) {
    // Golden-hour wash: warm heart, dusky vignette corners.
    const grad = g.createRadialGradient(
      vw / 2, vh / 2, Math.min(vw, vh) * 0.42,
      vw / 2, vh / 2, Math.max(vw, vh) * 0.78,
    );
    grad.addColorStop(0, 'rgba(255, 140, 50, 0)');
    grad.addColorStop(1, 'rgba(120, 40, 60, 0.30)');
    g.fillStyle = grad;
    g.fillRect(0, 0, vw, vh);
    g.fillStyle = 'rgba(255, 166, 66, 0.07)';
    g.fillRect(0, 0, vw, vh);
  }

  return { draw };
}
