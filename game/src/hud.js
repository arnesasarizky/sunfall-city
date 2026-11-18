// Sunfall City — the HUD and the screens, drawn over the world each frame.
//
// drawHud(g, state, vw, vh) reads:
//   state.cash          dollars on hand
//   state.mission       { title } | null — the active job
//   state.missionIndex  jobs completed (0..5)
//   state.wanted        { stars, bustMeter } (bustMeter 0..1)
//   state.player        { x, y, angle, health, maxHealth,
//                         car: { health, maxHealth } | null }
//   state.objective     { x, y, label } | null
//   state.stageTimeLeft seconds left on a timed stage, or null
//   state.dialogue      { who, text } | null
//   state.city          for the minimap (w, h, roadsX, roadsY, water, garage)
//   state.cops          [{ x, y }] for minimap blips
//   state.time          seconds, for pulses (optional)
//
// drawScreens(g, state, vw, vh) reads:
//   state.screen        'play' | 'title' | 'paused' | 'busted' | 'wasted' | 'end'
//   state.screenText    detail line for busted / wasted / end (optional)
//   state.cash, state.missionIndex  for the title career line

const FONT = 'system-ui, sans-serif';

function star(g, cx, cy, r, filled) {
  g.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  if (filled) {
    g.fillStyle = '#ffd23e';
    g.fill();
  }
  g.strokeStyle = 'rgba(30, 20, 10, 0.65)';
  g.lineWidth = 1.2;
  g.stroke();
  if (!filled) {
    g.fillStyle = 'rgba(255, 255, 255, 0.25)';
    g.fill();
  }
}

function bar(g, x, y, w, h, frac, fill, label) {
  g.fillStyle = 'rgba(20, 12, 8, 0.62)';
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle = 'rgba(255, 255, 255, 0.18)';
  g.fillRect(x, y, w, h);
  g.fillStyle = fill;
  g.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  g.fillStyle = '#fff6e6';
  g.font = `bold ${h + 1}px ${FONT}`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(label, x + 5, y + h / 2 + 0.5);
  g.textBaseline = 'alphabetic';
}

function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function wrap(g, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export function drawHud(g, state, vw, vh) {
  const time = state.time || 0;
  g.save();
  g.textAlign = 'left';

  // Cash and the current job, top-left.
  g.font = `bold 26px ${FONT}`;
  g.fillStyle = 'rgba(20, 12, 8, 0.45)';
  g.fillText(`$${state.cash}`, 17, 37);
  g.fillStyle = '#ffe9b0';
  g.fillText(`$${state.cash}`, 15, 35);
  if (state.mission) {
    g.font = `bold 14px ${FONT}`;
    g.fillStyle = 'rgba(20, 12, 8, 0.45)';
    g.fillText(state.mission.title.toUpperCase(), 17, 59);
    g.fillStyle = '#fff6e6';
    g.fillText(state.mission.title.toUpperCase(), 15, 57);
  }

  // Objective banner: label, distance, and the clock when there is one.
  if (state.objective && state.player) {
    const o = state.objective;
    const dist = Math.round(Math.hypot(o.x - state.player.x, o.y - state.player.y));
    let text = `${o.label || 'Objective'} — ${dist} m`;
    if (state.stageTimeLeft !== null && state.stageTimeLeft !== undefined) {
      text += ` · ${fmtTime(state.stageTimeLeft)}`;
    }
    g.font = `bold 16px ${FONT}`;
    const w = g.measureText(text).width + 28;
    const x = (vw - w) / 2;
    g.fillStyle = 'rgba(24, 14, 10, 0.68)';
    g.beginPath();
    g.roundRect(x, 14, w, 34, 8);
    g.fill();
    const urgent = state.stageTimeLeft !== null && state.stageTimeLeft !== undefined && state.stageTimeLeft < 15;
    g.fillStyle = urgent ? '#ff7a5c' : '#ffd98e';
    g.textAlign = 'center';
    g.fillText(text, vw / 2, 37);
    g.textAlign = 'left';
  } else if (state.stageTimeLeft !== null && state.stageTimeLeft !== undefined) {
    g.font = `bold 16px ${FONT}`;
    g.fillStyle = state.stageTimeLeft < 15 ? '#ff7a5c' : '#ffd98e';
    g.textAlign = 'center';
    g.fillText(fmtTime(state.stageTimeLeft), vw / 2, 37);
    g.textAlign = 'left';
  }

  // Wanted stars, top-right; they flash while the heat is fresh.
  const stars = state.wanted ? state.wanted.stars : 0;
  const flash = state.wanted && state.wanted.sinceCrime !== undefined && state.wanted.sinceCrime < 2.5
    ? (Math.sin(time * 10) > 0 ? 1 : 0.35)
    : 1;
  g.save();
  g.globalAlpha = flash;
  for (let i = 0; i < 5; i += 1) {
    star(g, vw - 26 - i * 30, 28, 12, i < stars);
  }
  g.restore();
  // Bust meter under the stars while a cruiser is close enough to matter.
  if (state.wanted && state.wanted.bustMeter > 0.01) {
    bar(g, vw - 176, 48, 160, 12, state.wanted.bustMeter, '#e33f3f', 'BUSTED?');
  }

  // Health bottom-left, plus the car's health while Juno is driving.
  const p = state.player;
  if (p) {
    bar(g, 16, vh - 30, 170, 13, p.health / (p.maxHealth || 100), '#7fc24f', 'JUNO');
    if (p.car) {
      bar(g, 16, vh - 52, 170, 13, p.car.health / (p.car.maxHealth || 100), '#5ca8e3', 'RIDE');
    }
  }

  drawMinimap(g, state, vw, vh);
  if (state.dialogue) drawDialogue(g, state.dialogue, vw, vh);
  g.restore();
}

function drawMinimap(g, state, vw, vh) {
  const city = state.city;
  if (!city || !state.player) return;
  const mw = 192;
  const mh = 144;
  const x0 = vw - mw - 14;
  const y0 = vh - mh - 14;
  const sx = mw / city.w;
  const sy = mh / city.h;
  g.save();
  g.fillStyle = 'rgba(20, 12, 8, 0.55)';
  g.fillRect(x0 - 3, y0 - 3, mw + 6, mh + 6);
  g.beginPath();
  g.rect(x0, y0, mw, mh);
  g.clip();
  g.fillStyle = '#2f7d99';
  g.fillRect(x0, y0, mw, mh);
  g.fillStyle = '#97795a';
  g.fillRect(x0, y0, city.boardwalk.x0 * sx, mh);
  g.fillStyle = '#ecc987';
  g.fillRect(x0 + city.beach.x0 * sx, y0, (city.boardwalk.x1 - city.beach.x0) * sx, mh);
  g.strokeStyle = 'rgba(240, 230, 210, 0.55)';
  g.lineWidth = 2;
  g.beginPath();
  for (const x of city.roadsX) { g.moveTo(x0 + x * sx, y0); g.lineTo(x0 + x * sx, y0 + mh); }
  for (const y of city.roadsY) { g.moveTo(x0, y0 + y * sy); g.lineTo(x0 + city.boardwalk.x0 * sx, y0 + y * sy); }
  g.stroke();
  // The garage, home base.
  g.fillStyle = '#e2703a';
  g.fillRect(x0 + city.garage.x * sx - 3, y0 + city.garage.y * sy - 3, 6, 6);
  // The law.
  g.fillStyle = '#7fb2ff';
  for (const cop of state.cops || []) {
    g.beginPath();
    g.arc(x0 + cop.x * sx, y0 + cop.y * sy, 2.6, 0, Math.PI * 2);
    g.fill();
  }
  // The goal, pulsing gold.
  if (state.objective) {
    const pulse = 3 + Math.sin((state.time || 0) * 5) * 1.2;
    g.fillStyle = '#ffd23e';
    g.beginPath();
    g.arc(x0 + state.objective.x * sx, y0 + state.objective.y * sy, pulse, 0, Math.PI * 2);
    g.fill();
  }
  // Juno: a little arrow on her facing.
  const px = x0 + state.player.x * sx;
  const py = y0 + state.player.y * sy;
  g.translate(px, py);
  g.rotate(state.player.angle || 0);
  g.fillStyle = '#fff3d6';
  g.beginPath();
  g.moveTo(6, 0);
  g.lineTo(-4.5, -4);
  g.lineTo(-4.5, 4);
  g.closePath();
  g.fill();
  g.restore();
}

function drawDialogue(g, dialogue, vw, vh) {
  const w = Math.min(680, vw - 40);
  const x = (vw - w) / 2;
  g.font = `15px ${FONT}`;
  const lines = wrap(g, dialogue.text, w - 36);
  const h = 34 + lines.length * 20 + 14;
  const y = vh - h - 16;
  g.fillStyle = 'rgba(22, 13, 10, 0.82)';
  g.beginPath();
  g.roundRect(x, y, w, h, 10);
  g.fill();
  g.strokeStyle = 'rgba(255, 217, 142, 0.5)';
  g.lineWidth = 1.5;
  g.stroke();
  g.font = `bold 13px ${FONT}`;
  g.fillStyle = '#ffd98e';
  g.textAlign = 'left';
  g.fillText(String(dialogue.who || '').toUpperCase(), x + 18, y + 22);
  g.font = `15px ${FONT}`;
  g.fillStyle = '#fff6e6';
  lines.forEach((line, i) => g.fillText(line, x + 18, y + 46 + i * 20));
  g.font = `bold 12px ${FONT}`;
  g.fillStyle = 'rgba(255, 246, 230, 0.75)';
  g.textAlign = 'right';
  g.fillText('E ▸', x + w - 14, y + h - 10);
  g.textAlign = 'left';
}

function centre(g, text, y, font, color) {
  g.font = font;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.fillText(text, 0, y);
  g.textAlign = 'left';
}

export function drawScreens(g, state, vw, vh) {
  const screen = state.screen || 'play';
  if (screen === 'play') return;
  g.save();
  g.translate(vw / 2, 0);

  if (screen === 'title') {
    const grad = g.createLinearGradient(0, 0, 0, vh);
    grad.addColorStop(0, '#3a2340');
    grad.addColorStop(0.55, '#a34a3a');
    grad.addColorStop(0.78, '#f7b267');
    grad.addColorStop(1, '#7a3b2e');
    g.fillStyle = grad;
    g.fillRect(-vw / 2, 0, vw, vh);
    // The sun, low over the water.
    g.fillStyle = '#ffd98e';
    g.beginPath();
    g.arc(0, vh * 0.72, 54, 0, Math.PI * 2);
    g.fill();
    // Skyline silhouette.
    g.fillStyle = 'rgba(38, 20, 30, 0.85)';
    const base = vh * 0.78;
    const blocks = [[-0.46, 120], [-0.34, 190], [-0.22, 90], [-0.1, 160], [0.02, 110], [0.14, 200], [0.27, 95], [0.38, 150]];
    for (const [fx, bh] of blocks) {
      g.fillRect(fx * vw, base - bh, vw * 0.1, bh);
    }
    g.fillRect(-vw / 2, base, vw, vh - base);
    centre(g, 'SUNFALL CITY', vh * 0.3, `bold 64px ${FONT}`, '#fff3d6');
    centre(g, 'Five jobs. One harbour. No brakes.', vh * 0.3 + 34, `16px ${FONT}`, '#ffe9b0');
    centre(g, 'WASD drive · E interact · J shoot · K melee · P pause', vh * 0.52, `14px ${FONT}`, 'rgba(255, 246, 230, 0.85)');
    const pulse = 0.65 + Math.sin((state.time || 0) * 3) * 0.35;
    g.globalAlpha = pulse;
    centre(g, 'PRESS ENTER TO DRIVE', vh * 0.6, `bold 19px ${FONT}`, '#ffd23e');
    g.globalAlpha = 1;
    if ((state.missionIndex || 0) > 0 || (state.cash || 0) > 0) {
      const done = (state.missionIndex || 0) >= 5;
      centre(
        g,
        done ? `Career banked: $${state.cash} — the harbour is safe. Free roam.`
          : `Career: $${state.cash} · next job ${state.missionIndex + 1} of 5`,
        vh * 0.66, `14px ${FONT}`, '#fff6e6',
      );
    }
  } else if (screen === 'paused') {
    g.fillStyle = 'rgba(18, 10, 14, 0.62)';
    g.fillRect(-vw / 2, 0, vw, vh);
    centre(g, 'PAUSED', vh / 2 - 8, `bold 44px ${FONT}`, '#fff3d6');
    centre(g, 'P or Esc to get back to work', vh / 2 + 26, `15px ${FONT}`, 'rgba(255, 246, 230, 0.8)');
  } else if (screen === 'busted') {
    g.fillStyle = 'rgba(16, 14, 34, 0.66)';
    g.fillRect(-vw / 2, 0, vw, vh);
    centre(g, 'BUSTED', vh / 2 - 10, `bold 52px ${FONT}`, '#7fb2ff');
    if (state.screenText) centre(g, state.screenText, vh / 2 + 28, `16px ${FONT}`, '#fff6e6');
  } else if (screen === 'wasted') {
    g.fillStyle = 'rgba(40, 8, 8, 0.66)';
    g.fillRect(-vw / 2, 0, vw, vh);
    centre(g, 'WASTED', vh / 2 - 10, `bold 52px ${FONT}`, '#ff7a5c');
    if (state.screenText) centre(g, state.screenText, vh / 2 + 28, `16px ${FONT}`, '#fff6e6');
  } else if (screen === 'end') {
    g.fillStyle = 'rgba(24, 14, 10, 0.6)';
    g.fillRect(-vw / 2, 0, vw, vh);
    centre(g, 'THE HARBOUR IS OURS', vh * 0.4, `bold 42px ${FONT}`, '#ffd98e');
    centre(g, `Final take: $${state.cash || 0}`, vh * 0.4 + 36, `18px ${FONT}`, '#fff6e6');
    if (state.screenText) centre(g, state.screenText, vh * 0.4 + 64, `15px ${FONT}`, 'rgba(255, 246, 230, 0.85)');
  }
  g.restore();
}
