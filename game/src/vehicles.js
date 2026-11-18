// Sunfall City — cars: spawning, grip-model driving physics and the traffic
// AI that keeps the streets moving. A car is a plain object:
//   { x, y, angle, speed, color, kind, driver, health, maxHealth, dead,
//     topSpeed, cruiseSpeed, axis, dir, road, turnCooldown }
// angle is in radians with 0 = east and positive turning toward south
// (screen coordinates, y down). driver is 'traffic' | 'parked' | 'cop' |
// 'player' | null. axis/dir/road describe the lane a traffic car follows:
// axis 'v' runs along an avenue whose centre x is `road`, dir +1 heads
// south; axis 'h' runs along a street whose centre y is `road`, dir +1
// heads east.

import { CAR } from './config.js';
import { collideMove, isRoad, randomRoadPoint } from './city.js';

/** Lane offset from a road centre line: a quarter of the road width. */
const LANE = 23;
/** How far ahead a traffic car looks for something in its way. */
const LOOK_AHEAD = 78;

export const CAR_COLORS = [
  '#c94f42', '#e0a458', '#7fa6a3', '#5d7fa3', '#d9d3c3',
  '#8a6fa8', '#4f7d5a', '#cf7d9b', '#767d84', '#b85c38',
];

const KINDS = ['sedan', 'coupe', 'hatch', 'van', 'pickup'];

/** Wrap an angle to [-PI, PI). */
export function wrapAngle(a) {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

/** The steering input (-1..1) that turns a car toward a point. */
export function steerToward(car, tx, ty) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = wrapAngle(want - car.angle);
  return Math.max(-1, Math.min(1, diff * 2.2));
}

/** Make a car of the given kind at a spot. Cop cars get the faster tune. */
export function createCar(x, y, angle, kind, driver) {
  const topSpeed = driver === 'cop' || kind === 'cruiser' ? CAR.copSpeed : CAR.trafficSpeed;
  return {
    x, y, angle,
    speed: 0,
    color: '#d9d3c3',
    kind: kind || 'sedan',
    driver: driver || null,
    health: 100,
    maxHealth: 100,
    dead: false,
    topSpeed,
    cruiseSpeed: topSpeed,
    axis: 'v',
    dir: 1,
    road: x,
    turnCooldown: 0,
  };
}

/** The lane centre coordinate for a car travelling its road. */
function laneCoord(car) {
  // Right-hand traffic: southbound keeps west, northbound east,
  // eastbound keeps south, westbound north.
  return car.axis === 'v' ? car.road - car.dir * LANE : car.road + car.dir * LANE;
}

function placeOnRoad(city, rng) {
  const p = randomRoadPoint(rng, city);
  const car = createCar(p.x, p.y, 0, rng.pick(KINDS), 'traffic');
  car.color = rng.pick(CAR_COLORS);
  car.axis = p.axis;
  car.dir = rng.chance(0.5) ? 1 : -1;
  car.road = p.axis === 'v' ? p.x : p.y;
  const lane = laneCoord(car);
  if (p.axis === 'v') {
    car.x = lane;
    car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    car.y = lane;
    car.angle = car.dir > 0 ? 0 : Math.PI;
  }
  car.cruiseSpeed = CAR.trafficSpeed * rng.range(0.72, 1);
  car.speed = car.cruiseSpeed * rng.range(0.4, 0.9);
  return car;
}

/** A fleet of cars already rolling in their lanes. */
export function spawnTraffic(city, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) cars.push(placeOnRoad(city, rng));
  return cars;
}

/**
 * Stealable cars: parked in parking lots and plaza edges, or nosed to the
 * kerb along a road. Never within 48 px of the player spawn.
 */
export function spawnParked(city, rng, count) {
  const cars = [];
  const lots = city.lots.filter((l) => l.ground === 'parking' || l.ground === 'plaza');
  let guard = 0;
  while (cars.length < count && guard < count * 30) {
    guard += 1;
    let car = null;
    if (lots.length && rng.chance(0.65)) {
      const lot = rng.pick(lots);
      if (lot.w < 40 || lot.h < 30) continue;
      car = createCar(
        rng.range(lot.x + 24, lot.x + lot.w - 24),
        rng.range(lot.y + 16, lot.y + lot.h - 16),
        rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
        rng.pick(KINDS),
        'parked',
      );
    } else {
      const p = randomRoadPoint(rng, city);
      car = createCar(p.x, p.y, p.axis === 'v' ? Math.PI / 2 : 0, rng.pick(KINDS), 'parked');
      // Nudge to the kerb: half a road width plus a bit toward one side.
      const side = rng.chance(0.5) ? 1 : -1;
      if (p.axis === 'v') car.x = p.x + side * (CAR.radius + 26);
      else car.y = p.y + side * (CAR.radius + 26);
      if (!isRoad(city, car.x, car.y) && rng.chance(0.5)) continue;
    }
    const dx = car.x - city.spawn.x;
    const dy = car.y - city.spawn.y;
    if (dx * dx + dy * dy < 48 * 48) continue;
    car.color = rng.pick(CAR_COLORS);
    car.speed = 0;
    cars.push(car);
  }
  return cars;
}

/**
 * Advance one car by dt. steer is -1..1, throttle -1..1 (negative brakes,
 * then reverses). Returns the impact speed when a wall stops the car hard,
 * otherwise 0.
 */
export function stepCar(car, dt, steer, throttle, city) {
  if (car.dead) throttle = Math.min(throttle, 0);
  if (throttle > 0) {
    car.speed += CAR.accel * throttle * dt;
  } else if (throttle < 0) {
    if (car.speed > 4) car.speed -= CAR.brake * -throttle * dt;
    else car.speed += CAR.accel * 0.62 * throttle * dt;
  }
  // Rolling drag, stronger once the engine tune is exceeded.
  car.speed -= car.speed * CAR.drag * dt * (Math.abs(car.speed) > car.topSpeed ? 2.4 : 0.35);
  if (car.speed > car.topSpeed) car.speed = Math.max(car.topSpeed, car.speed - CAR.brake * dt);
  if (car.speed < -CAR.reverseMax) car.speed = -CAR.reverseMax;
  if (throttle === 0 && Math.abs(car.speed) < 3) car.speed = 0;

  const grip = Math.max(-1, Math.min(1, car.speed / 130));
  car.angle = wrapAngle(car.angle + steer * CAR.turnRate * grip * dt);

  const dx = Math.cos(car.angle) * car.speed * dt;
  const dy = Math.sin(car.angle) * car.speed * dt;
  const moved = collideMove(city, car.x, car.y, CAR.radius, dx, dy);
  const want = Math.hypot(dx, dy);
  const got = Math.hypot(moved.x - car.x, moved.y - car.y);
  car.x = moved.x;
  car.y = moved.y;
  if (want > 0.01 && got < want * 0.3 && Math.abs(car.speed) > 85) {
    const impact = Math.abs(car.speed);
    car.speed = 0;
    return impact;
  }
  if (want > 0.01 && got < want * 0.3) car.speed *= 0.4;
  return 0;
}

/** True when a blocker sits in the lane ahead of the car. */
function blockedAhead(car, blockers) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const b of blockers) {
    const rx = b.x - car.x;
    const ry = b.y - car.y;
    const along = rx * fx + ry * fy;
    if (along < 6 || along > LOOK_AHEAD) continue;
    const across = Math.abs(rx * -fy + ry * fx);
    if (across < 26) return along;
  }
  return 0;
}

/**
 * Drive a traffic car for one tick: hold the lane, queue behind blockers
 * (an array of {x, y}: other cars, the player, crossing peds), turn at
 * intersections and turn around at the end of a street. Returns impact
 * speed exactly like stepCar.
 */
export function updateTrafficCar(car, dt, city, rng, blockers) {
  car.turnCooldown = Math.max(0, car.turnCooldown - dt);
  if (car.dead) return stepCar(car, dt, 0, -0.4, city);

  // Keep centred in the lane.
  let steer = 0;
  const lane = laneCoord(car);
  if (car.axis === 'v') steer = Math.max(-1, Math.min(1, (lane - car.x) * 0.06)) * (car.dir > 0 ? 1 : -1) * -1;
  else steer = Math.max(-1, Math.min(1, (lane - car.y) * 0.06)) * (car.dir > 0 ? 1 : -1);
  // (The sign juggling above just points the nose along dir while the car
  // drifts back to its lane line.)

  // Cross streets invite a turn.
  const crosses = car.axis === 'v' ? city.roadsY : city.roadsX;
  const along = car.axis === 'v' ? car.y : car.x;
  if (car.turnCooldown <= 0) {
    for (const c of crosses) {
      if (Math.abs(along - c) < 9 && rng.chance(0.4)) {
        const oldAxis = car.axis;
        car.axis = oldAxis === 'v' ? 'h' : 'v';
        car.road = c;
        car.dir = rng.chance(0.5) ? 1 : -1;
        car.angle = car.axis === 'v'
          ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
          : (car.dir > 0 ? 0 : Math.PI);
        car.turnCooldown = 2.5;
        break;
      }
    }
  }

  // Streets die at the boardwalk and avenues at the world edge: U-turn.
  if (car.axis === 'h' && (car.x > city.boardwalk.x0 - 70 || car.x < 34)) {
    car.dir = car.x < 34 ? 1 : -1;
    car.angle = car.dir > 0 ? 0 : Math.PI;
    car.turnCooldown = 1.5;
  }
  if (car.axis === 'v' && (car.y > city.h - 40 || car.y < 40)) {
    car.dir = car.y < 40 ? 1 : -1;
    car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    car.turnCooldown = 1.5;
  }

  let throttle = 1;
  const gap = blockedAhead(car, blockers || []);
  if (gap) throttle = gap < 42 ? -0.7 : 0.15;
  if (car.speed > car.cruiseSpeed) throttle = Math.min(throttle, 0);
  return stepCar(car, dt, steer, throttle, city);
}

/** Hurt a car. Returns true when this damage wrecks it. */
export function damageCar(car, amt) {
  if (car.dead) return false;
  car.health -= amt;
  if (car.health <= 0) {
    car.health = 0;
    car.dead = true;
    car.speed = 0;
    return true;
  }
  return false;
}
