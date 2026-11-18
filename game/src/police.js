// Sunfall City — the law: a wanted state (heat, stars, a bust meter) and
// the cruisers that answer it. Heat is earned by crime — in full only when
// somebody sees it — and cools once the player stays out of trouble and
// out of sight. A cruiser that holds position next to a slow or on-foot
// player fills the bust meter; a full meter is a bust.

import { CAR, WANTED } from './config.js';
import { randomRoadPoint } from './city.js';
import { createCar, stepCar, steerToward } from './vehicles.js';

/** A clean record: no heat, no stars, nowhere the law is looking. */
export function createWanted() {
  return { heat: 0, stars: 0, bustMeter: 0, lastKnown: null, sinceCrime: 0 };
}

/** Stars for a heat score: one per heatPerStar, capped at maxStars. */
export function starsForHeat(heat) {
  return Math.min(WANTED.maxStars, Math.floor(heat / WANTED.heatPerStar));
}

/** True when any witness {x, y} is within radius of the point. */
export function isWitnessed(witnesses, x, y, radius) {
  const r = radius === undefined ? WANTED.witnessRadius : radius;
  for (const w of witnesses || []) {
    const dx = w.x - x;
    const dy = w.y - y;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

/**
 * Charge a crime against the wanted state. `crime` is a key of
 * WANTED.crimeHeat ('carjack', 'assault', 'shot', 'collision',
 * 'rivalDown') or a raw heat number. An unwitnessed crime counts at 35%.
 * Returns the heat actually added.
 */
export function addHeat(wanted, crime, witnessed) {
  const base = typeof crime === 'number' ? crime : (WANTED.crimeHeat[crime] || 0);
  const added = base * (witnessed ? 1 : 0.35);
  wanted.heat += added;
  wanted.sinceCrime = 0;
  wanted.stars = starsForHeat(wanted.heat);
  return added;
}

/**
 * Cool the wanted state down. opts is either a boolean (hidden) or
 * { hidden, playerPos }: while the player is visible their position is
 * remembered as lastKnown; while hidden the heat cools three times as
 * fast. Decay only starts after a short grace since the last crime, and
 * at zero stars the bust meter drains away.
 */
export function updateWanted(wanted, dt, opts) {
  const hidden = typeof opts === 'boolean' ? opts : !!(opts && opts.hidden);
  const playerPos = opts && typeof opts === 'object' ? opts.playerPos : null;
  wanted.sinceCrime += dt;
  if (playerPos && !hidden && wanted.stars > 0) {
    wanted.lastKnown = { x: playerPos.x, y: playerPos.y };
  }
  if (wanted.sinceCrime > 2.5 && wanted.heat > 0) {
    wanted.heat = Math.max(0, wanted.heat - WANTED.decayPerSec * dt * (hidden ? 3 : 1));
    wanted.stars = starsForHeat(wanted.heat);
    if (wanted.stars === 0) wanted.lastKnown = null;
  }
  if (wanted.stars === 0) {
    wanted.bustMeter = Math.max(0, wanted.bustMeter - dt / WANTED.bustFillSec);
  }
}

/**
 * Keep the fleet at copCounts[stars] live cruisers: wrecked cars are
 * struck off, fresh ones roll in at road points well away from the
 * player, and when the heat drops the farthest extras peel off. Mutates
 * and returns the cops array.
 */
export function ensureCopCount(cops, city, rng, wanted, playerPos) {
  for (let i = cops.length - 1; i >= 0; i -= 1) {
    if (cops[i].dead) cops.splice(i, 1);
  }
  const target = WANTED.copCounts[wanted.stars] || 0;
  while (cops.length < target) {
    let spot = null;
    for (let tries = 0; tries < 12; tries += 1) {
      const p = randomRoadPoint(rng, city);
      const dx = p.x - playerPos.x;
      const dy = p.y - playerPos.y;
      spot = p;
      if (dx * dx + dy * dy > 430 * 430) break;
    }
    const cop = createCar(spot.x, spot.y, spot.axis === 'v' ? Math.PI / 2 : 0, 'cruiser', 'cop');
    cop.color = '#2b3440';
    cop.axis = spot.axis;
    cop.road = spot.axis === 'v' ? spot.x : spot.y;
    cop.topSpeed = CAR.copSpeed;
    cop.cruiseSpeed = CAR.copSpeed;
    cops.push(cop);
  }
  while (cops.length > target) {
    let far = 0;
    let farDist = -1;
    for (let i = 0; i < cops.length; i += 1) {
      const dx = cops[i].x - playerPos.x;
      const dy = cops[i].y - playerPos.y;
      const d = dx * dx + dy * dy;
      if (d > farDist) { farDist = d; far = i; }
    }
    cops.splice(far, 1);
  }
  return cops;
}

/**
 * Drive every cruiser for one tick and work the bust meter.
 * ctx: { city, rng, wanted, player, playerVisible, blockers }
 *   player: { x, y, angle, onFoot, speed, car } — position is the car
 *     position while driving; speed is the player's ground speed.
 *   playerVisible: whether any cruiser can currently see the player.
 *   blockers: {x, y} array the cruisers slow for (traffic, the player).
 * Returns 'busted' on the tick the meter fills, otherwise null.
 */
export function updateCops(cops, dt, ctx) {
  const { city, wanted, player, playerVisible, blockers } = ctx;
  if (playerVisible && wanted.stars > 0) {
    wanted.lastKnown = { x: player.x, y: player.y };
  }
  const target = playerVisible ? player : wanted.lastKnown;
  const playerSpeed = player.onFoot ? 0 : Math.abs(player.speed || 0);

  let nearest = Infinity;
  for (const cop of cops) {
    const dx = player.x - cop.x;
    const dy = player.y - cop.y;
    const dist = Math.hypot(dx, dy);
    if (dist < nearest) nearest = dist;
    if (cop.dead) continue;
    if (!target) {
      stepCar(cop, dt, 0, cop.speed > 10 ? -0.3 : 0, city);
      continue;
    }
    // Hold station when close enough to make the arrest.
    const holding = dist < WANTED.bustRadius + CAR.radius && (player.onFoot || playerSpeed < 30);
    let throttle = 1;
    if (holding) throttle = cop.speed > 4 ? -0.8 : 0;
    else if (dist < 60) throttle = 0.4;
    // Do not plough through traffic to get there.
    if (blockers) {
      const fx = Math.cos(cop.angle);
      const fy = Math.sin(cop.angle);
      for (const b of blockers) {
        if (b === cop) continue;
        const rx = b.x - cop.x;
        const ry = b.y - cop.y;
        const along = rx * fx + ry * fy;
        if (along > 4 && along < 52 && Math.abs(rx * -fy + ry * fx) < 24) {
          throttle = Math.min(throttle, along < 30 ? -0.5 : 0.1);
          break;
        }
      }
    }
    stepCar(cop, dt, steerToward(cop, target.x, target.y), throttle, city);
  }

  // The meter: a cruiser in arm's reach of a slow or on-foot player.
  const inReach = nearest < WANTED.bustRadius + CAR.radius;
  if (inReach && (player.onFoot || playerSpeed < 30) && wanted.stars > 0) {
    wanted.bustMeter += dt / WANTED.bustFillSec;
  } else {
    wanted.bustMeter -= dt / (WANTED.bustFillSec * 1.6);
  }
  wanted.bustMeter = Math.max(0, Math.min(1, wanted.bustMeter));
  if (wanted.bustMeter >= 1) {
    wanted.bustMeter = 0;
    return 'busted';
  }
  return null;
}
