// Sunfall City — combat: a hitscan pistol and a close-up fist swing.
// Both take a world-ish object { city, peds, cars, player? } and a shooter /
// attacker with { x, y, angle } (the shooter may also carry `car`, the car
// they are sitting in, which is never its own target). Buildings block the
// bullet; the nearest thing in the line of fire takes the round.

import { groundAt } from './city.js';
import { damagePed } from './people.js';
import { damageCar, wrapAngle } from './vehicles.js';

export const COMBAT = {
  pistolRange: 460,
  pistolDamage: 34,
  pistolCarDamage: 12,
  meleeRange: 48,
  meleeDamage: 22,
  meleeCarDamage: 6,
  meleeArc: 1.15,
};

const PED_HIT_R = 13;
const CAR_HIT_R = 25;
const RAY_STEP = 6;

/**
 * Fire one pistol round from the shooter along their facing.
 * Returns { tracer: {x1, y1, x2, y2, kind}, hit, downed } where kind is
 * 'ped' | 'car' | 'wall' | 'none' — where the round ended up.
 */
export function tryShoot(world, shooter) {
  const { city, peds, cars, player } = world;
  const dx = Math.cos(shooter.angle);
  const dy = Math.sin(shooter.angle);
  let endX = shooter.x + dx * COMBAT.pistolRange;
  let endY = shooter.y + dy * COMBAT.pistolRange;
  let kind = 'none';
  let hit = null;
  let downed = false;

  // Walk the ray; the first thing touched — wall, body or bodywork — wins.
  const steps = Math.floor(COMBAT.pistolRange / RAY_STEP);
  for (let i = 1; i <= steps; i += 1) {
    const px = shooter.x + dx * i * RAY_STEP;
    const py = shooter.y + dy * i * RAY_STEP;
    if (groundAt(city, px, py) === 'building') {
      endX = px; endY = py; kind = 'wall';
      break;
    }
    let struck = false;
    for (const ped of peds || []) {
      if (ped === shooter || ped.state === 'down') continue;
      const ox = ped.x - px;
      const oy = ped.y - py;
      if (ox * ox + oy * oy < PED_HIT_R * PED_HIT_R) {
        hit = ped; kind = 'ped'; struck = true;
        break;
      }
    }
    if (!struck && player && player !== shooter && player.onFoot) {
      const ox = player.x - px;
      const oy = player.y - py;
      if (ox * ox + oy * oy < PED_HIT_R * PED_HIT_R) {
        hit = player; kind = 'ped'; struck = true;
      }
    }
    if (!struck) {
      for (const car of cars || []) {
        if (car === shooter.car || car.dead) continue;
        const ox = car.x - px;
        const oy = car.y - py;
        if (ox * ox + oy * oy < CAR_HIT_R * CAR_HIT_R) {
          hit = car; kind = 'car'; struck = true;
          break;
        }
      }
    }
    if (struck) { endX = px; endY = py; break; }
  }

  if (kind === 'ped' && hit) {
    downed = damagePed(hit, COMBAT.pistolDamage, shooter.x, shooter.y);
  } else if (kind === 'car' && hit) {
    downed = damageCar(hit, COMBAT.pistolCarDamage);
  }
  return {
    tracer: { x1: shooter.x, y1: shooter.y, x2: endX, y2: endY, kind },
    hit,
    downed,
  };
}

/**
 * Swing a fist in the attacker's front arc. Returns { hit, downed } for
 * the nearest target caught, or null when the swing hits only air.
 */
export function tryMelee(world, attacker) {
  const { peds, cars, player } = world;
  let best = null;
  let bestDist = COMBAT.meleeRange;
  const consider = (obj, isCar) => {
    const ox = obj.x - attacker.x;
    const oy = obj.y - attacker.y;
    const dist = Math.hypot(ox, oy);
    if (dist > bestDist || dist < 1) return;
    const diff = Math.abs(wrapAngle(Math.atan2(oy, ox) - attacker.angle));
    if (diff > COMBAT.meleeArc) return;
    best = obj;
    bestDist = dist;
    best.isCar = isCar;
  };
  for (const ped of peds || []) {
    if (ped === attacker || ped.state === 'down') continue;
    consider(ped, false);
  }
  if (player && player !== attacker && player.onFoot) consider(player, false);
  for (const car of cars || []) {
    if (car === attacker.car || car.dead) continue;
    consider(car, true);
  }
  if (!best) return null;
  const downed = best.isCar
    ? damageCar(best, COMBAT.meleeCarDamage)
    : damagePed(best, COMBAT.meleeDamage, attacker.x, attacker.y);
  return { hit: best, downed };
}
