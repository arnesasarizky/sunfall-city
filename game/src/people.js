// Sunfall City — people: pedestrians who stroll the pavements and the
// boardwalk, panic and run when the city turns violent, and Juno herself.
// A ped is a plain object:
//   { x, y, angle, speed, state, color, health, maxHealth, rival,
//     target, threat, calm }
// state is 'walk' | 'flee' | 'down'. target is the {x, y} a walker is
// ambling toward; threat is the {x, y} a fleeing ped is running away from;
// calm counts down the seconds before a scared ped settles back to walking.

import { PLAYER } from './config.js';
import { collideMove, randomWalkPoint } from './city.js';
import { wrapAngle } from './vehicles.js';

export const PED_RADIUS = 11;

const PED_COLORS = [
  '#e8e3d8', '#c96f4a', '#5d8aa8', '#e0b84f', '#7fae6e',
  '#b85c7d', '#8d7fb8', '#4a4a55', '#d98e6a', '#6eb8a6',
];
const RIVAL_COLORS = ['#3a3f4a', '#4a3a44', '#2f4442', '#54423a'];

const WALK_SPEED = 74;
const FLEE_SPEED = 252;

/** A fresh pedestrian at a point. rival marks a Glass Eel. */
export function spawnPedAt(city, rng, x, y, rival) {
  return {
    x, y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    state: 'walk',
    color: rival ? rng.pick(RIVAL_COLORS) : rng.pick(PED_COLORS),
    health: rival ? 60 : 30,
    maxHealth: rival ? 60 : 30,
    rival: !!rival,
    target: null,
    threat: null,
    calm: 0,
  };
}

/** Scatter pedestrians over the sidewalks, boardwalk and sand. */
export function spawnPeds(city, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const p = randomWalkPoint(rng, city);
    peds.push(spawnPedAt(city, rng, p.x, p.y, false));
  }
  return peds;
}

/** Juno Marchetti, standing on the garage apron where the game begins. */
export function createPlayer(city) {
  return {
    x: city.spawn.x,
    y: city.spawn.y,
    angle: -Math.PI / 2,
    speed: 0,
    state: 'walk',
    color: '#e2703a',
    health: 100,
    maxHealth: 100,
    rival: false,
    target: null,
    threat: null,
    calm: 0,
    radius: PLAYER.radius,
    name: 'Juno',
    onFoot: true,
    car: null,
  };
}

function movePed(city, ped, dt, speed) {
  const dx = Math.cos(ped.angle) * speed * dt;
  const dy = Math.sin(ped.angle) * speed * dt;
  const moved = collideMove(city, ped.x, ped.y, PED_RADIUS, dx, dy);
  const stuck = Math.abs(moved.x - ped.x) < Math.abs(dx) * 0.25
    && Math.abs(moved.y - ped.y) < Math.abs(dy) * 0.25
    && (Math.abs(dx) + Math.abs(dy)) > 0.01;
  ped.x = moved.x;
  ped.y = moved.y;
  ped.speed = speed;
  return stuck;
}

/**
 * Advance every ped one tick.
 * opts: { city, rng, danger, player, playerWanted }
 *   danger: array of {x, y, r} — gunshots, crashes, speeding cars; a ped
 *     inside a danger radius runs from its centre.
 *   player / playerWanted: when the player is wanted (stars > 0) and gets
 *     close, peds clear off — they want no part of it.
 */
export function updatePeds(peds, dt, opts) {
  const { city, rng, danger, player, playerWanted } = opts;
  for (const ped of peds) {
    if (ped.state === 'down') { ped.speed = 0; continue; }

    // Notice trouble.
    let threat = null;
    if (danger) {
      for (const d of danger) {
        const dx = ped.x - d.x;
        const dy = ped.y - d.y;
        if (dx * dx + dy * dy < d.r * d.r) { threat = d; break; }
      }
    }
    if (!threat && playerWanted && player) {
      const dx = ped.x - player.x;
      const dy = ped.y - player.y;
      if (dx * dx + dy * dy < 130 * 130) threat = player;
    }
    if (threat) {
      ped.state = 'flee';
      ped.threat = { x: threat.x, y: threat.y };
      ped.calm = 2.6;
      ped.target = null;
    }

    if (ped.state === 'flee') {
      ped.calm -= dt;
      const from = ped.threat || ped;
      const away = Math.atan2(ped.y - from.y, ped.x - from.x);
      // Blend in a little wander so crowds do not run in lockstep.
      ped.angle = away + Math.sin(ped.x * 0.05 + ped.y * 0.03) * 0.35;
      const stuck = movePed(city, ped, dt, FLEE_SPEED);
      if (stuck) ped.angle = away + (rng.chance(0.5) ? 1.4 : -1.4);
      if (ped.calm <= 0) { ped.state = 'walk'; ped.threat = null; }
      continue;
    }

    // Walking: amble toward a target; pick a new one on arrival or when
    // the current one has been underfoot too long.
    if (!ped.target || rng.chance(dt * 0.05)) {
      const p = randomWalkPoint(rng, city);
      ped.target = { x: p.x, y: p.y };
    }
    const dx = ped.target.x - ped.x;
    const dy = ped.target.y - ped.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 14) { ped.target = null; ped.speed = 0; continue; }
    const want = Math.atan2(dy, dx);
    ped.angle += wrapAngle(want - ped.angle) * Math.min(1, dt * 6);
    const stuck = movePed(city, ped, dt, WALK_SPEED * rng.range(0.85, 1.1));
    if (stuck) ped.target = null;
  }
}

/**
 * Hurt a ped; srcX/srcY (optional) is where the hurt came from. Returns
 * true when the ped goes down. A survivor runs from the source.
 */
export function damagePed(ped, amt, srcX, srcY) {
  if (ped.state === 'down') return false;
  ped.health -= amt;
  if (ped.health <= 0) {
    ped.health = 0;
    ped.state = 'down';
    ped.speed = 0;
    return true;
  }
  ped.state = 'flee';
  ped.calm = 3;
  ped.threat = srcX !== undefined ? { x: srcX, y: srcY } : null;
  return false;
}

/** Panic every ped within r of a point. Returns how many were scared. */
export function scarePeds(peds, x, y, r) {
  let n = 0;
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - x;
    const dy = ped.y - y;
    if (dx * dx + dy * dy < r * r) {
      ped.state = 'flee';
      ped.threat = { x, y };
      ped.calm = 2.6;
      ped.target = null;
      n += 1;
    }
  }
  return n;
}
