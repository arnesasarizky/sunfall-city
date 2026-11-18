// Sunfall City — the screenshot scenes behind ?shot=cover|chase|street|mission
// (with &seed=N). Each scene resets the world and then plays it forward with
// scripted inputs through the real step() — Juno really talks to Odie, really
// steals the car, really earns the stars — so the frozen frame is a moment
// the game itself produced, and the same seed always produces the same one.

import { STEP } from './config.js';
import { ACTION_CONFIRM, ACTION_INTERACT } from './input.js';
import { steerToward, wrapAngle } from './vehicles.js';

function snap(over = {}) {
  return {
    dir: { x: 0, y: 0 },
    sprint: false,
    actions: 0,
    mouse: { x: 0, y: 0, down: false },
    fire: false,
    ...over,
  };
}

function tick(world, over) {
  world.step(STEP, snap(over));
}

function ticks(world, n, over) {
  for (let i = 0; i < n; i += 1) tick(world, over);
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Walk Juno toward a point, sidestepping when a wall pins her. Returns
 * true when she gets within arriveDist of the target.
 */
function walkToward(world, tx, ty, maxSteps, arriveDist = 24) {
  const s = world.state;
  let lastX = s.player.x;
  let lastY = s.player.y;
  let sideSteps = 0;
  let sideSign = 1;
  for (let i = 0; i < maxSteps; i += 1) {
    const p = s.player;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d < arriveDist) return true;
    let dir = { x: dx / d, y: dy / d };
    if (sideSteps > 0) {
      dir = { x: -dir.y * sideSign, y: dir.x * sideSign };
      sideSteps -= 1;
    }
    tick(world, { dir });
    if (i % 40 === 39) {
      if (Math.hypot(p.x - lastX, p.y - lastY) < 6) {
        sideSteps = 42;
        sideSign = -sideSign;
      }
      lastX = p.x;
      lastY = p.y;
    }
  }
  return dist(s.player, { x: tx, y: ty }) < arriveDist;
}

function walkRoute(world, points, stepsPerLeg = 60 * 30) {
  for (const pt of points) {
    walkToward(world, pt.x, pt.y, stepsPerLeg, 26);
  }
}

/**
 * Drive Juno's car toward a point; reverse out when the nose is pinned.
 * `abort`, when given, is polled each tick and ends the drive early.
 * Returns the number of ticks used.
 */
function driveToward(world, tx, ty, maxSteps, arriveDist = 52, abort = null) {
  const s = world.state;
  let reverseSteps = 0;
  let crawl = 0;
  let stuckCount = 0;
  for (let i = 0; i < maxSteps; i += 1) {
    const car = s.player.car;
    if (!car || car.dead) return i;
    if (Math.hypot(tx - car.x, ty - car.y) < arriveDist) return i;
    if (abort && abort()) return i;
    let steer = steerToward(car, tx, ty);
    let dirY = -1;
    if (reverseSteps > 0) {
      steer = -steer;
      dirY = 1;
      reverseSteps -= 1;
    } else {
      const d = Math.hypot(tx - car.x, ty - car.y);
      const off = Math.abs(wrapAngle(Math.atan2(ty - car.y, tx - car.x) - car.angle));
      if (off > 2.3 && d > 70) {
        // Facing away from the target: forward throttle only drives the
        // nose further off line. Back around until roughly facing it.
        steer = -steer;
        dirY = 1;
      } else {
        // Cornering speed control: the turning radius grows with speed
        // (130 px wide at full tilt — into the buildings), and drag is
        // too weak to slow the car on a trailing throttle, so brake
        // actively down to the speed the turn can actually make. Every
        // waypoint is also a corner, so approach each one slowly.
        let want = off > 1.15 ? 105 : off > 0.5 ? 165 : 999;
        if (d < 130) want = Math.min(want, 90);
        if (car.speed > want + 25) dirY = 0.6;
        else if (car.speed < want - 35) dirY = -1;
        else dirY = -0.25;
      }
    }
    tick(world, { dir: { x: steer, y: dirY } });
    if (Math.abs(car.speed) < 9 && reverseSteps <= 0) {
      crawl += 1;
      if (crawl > 55) {
        // Back out for longer each time: ramming the same wall twice
        // with the same short reverse in between changes nothing.
        stuckCount += 1;
        reverseSteps = 42 + stuckCount * 36;
        crawl = 0;
      }
    } else {
      crawl = 0;
    }
  }
  return maxSteps;
}

/**
 * Drive to a point the way a person would: out to the nearest east-west
 * street, along it to the target's avenue, down the avenue, then in —
 * every turn happens at an intersection, where there is room to make it.
 * Stops early once within stopDist of the final target (freeze-frames).
 */
function driveRoute(world, tx, ty, maxSteps = 60 * 50, stopDist = 0) {
  const s = world.state;
  const car = s.player.car;
  if (!car) return;
  const nearest = (list, v) => list.reduce((best, n) => (Math.abs(n - v) < Math.abs(best - v) ? n : best), list[0]);
  const streetY = nearest(s.city.roadsY, car.y);
  const avenueX = nearest(s.city.roadsX, tx);
  const nearTarget = () => stopDist > 0 && Math.hypot(tx - s.player.x, ty - s.player.y) < stopDist;
  // Waypoints sit in the traffic lane for their direction of travel
  // (offset +23 with the flow, like the traffic AI's lanes): driving
  // down the centre line means meeting every oncoming car head-on.
  const laneH = avenueX >= car.x ? 23 : -23;
  const laneV = ty >= streetY ? 23 : -23;
  const laneH2 = tx >= avenueX ? 23 : -23;
  const legs = [
    { x: car.x, y: streetY + laneH },
    { x: avenueX + laneV, y: streetY + laneH },
    { x: avenueX + laneV, y: ty + laneH2 },
    { x: tx, y: ty },
  ];
  let budget = maxSteps;
  for (const leg of legs) {
    if (budget <= 0 || nearTarget()) break;
    budget -= driveToward(world, leg.x, leg.y, budget, 46, nearTarget);
  }
}

function nearestStealable(world, from) {
  let best = null;
  let bestDist = Infinity;
  // Parked cars hold still for the walk over; traffic is a last resort.
  for (const wantParked of [true, false]) {
    for (const car of world.state.cars) {
      if (car.dead || car.driver === 'cop' || car.driver === 'player') continue;
      if ((car.driver === 'parked') !== wantParked) continue;
      const d = dist(from, car);
      if (d < bestDist) { best = car; bestDist = d; }
    }
    if (best) return best;
  }
  return best;
}

/** Walk to the nearest stealable car and climb in. Returns the car. */
function stealNearestCar(world) {
  const s = world.state;
  const car = nearestStealable(world, s.player);
  if (!car) return null;
  // The car is parked and stationary. Walk (with the anti-wedge
  // sidestep) most of the way, then close in and pull the door handle.
  walkToward(world, car.x, car.y, 60 * 30, 34);
  for (let i = 0; i < 90 && !s.player.car; i += 1) {
    const d = dist(s.player, car);
    if (d < 52) {
      tick(world, { actions: ACTION_INTERACT });
    } else {
      tick(world, {
        dir: { x: (car.x - s.player.x) / d, y: (car.y - s.player.y) / d },
        sprint: true,
      });
    }
  }
  ticks(world, 3);
  return s.player.car;
}

/**
 * Walk to the nearest roadside and jack a passing traffic car. A car
 * already on the road grid makes the long drives that follow far more
 * reliable than escaping a parking lot.
 */
/** If the current ride is a wreck (or there is none), get Juno driving. */
function recoverCar(world) {
  const s = world.state;
  if (s.player.car && !s.player.car.dead) return s.player.car;
  if (s.player.car) {
    tick(world, { actions: ACTION_INTERACT }); // climb out of the wreck
    ticks(world, 3);
  }
  return stealNearestCar(world);
}

/** Talk to Odie and click through the briefing until a stage is live. */
function startCurrentMission(world) {
  const s = world.state;
  tick(world, { actions: ACTION_INTERACT });
  for (let i = 0; i < 14 && s.dialogue; i += 1) {
    tick(world, { actions: ACTION_CONFIRM });
    ticks(world, 2);
  }
}

// ---------------------------------------------------------- the scenes

/** Cover: mid-delivery on the first job, timer running, city around her. */
function shotCover(world) {
  const s = world.state;
  world.reset({ cash: 0, missionIndex: 0, best: 0 });
  s.screen = 'play';
  startCurrentMission(world); // Borrowed Wheels: goto the coupe lot
  const lot = s.objective;
  if (lot) {
    stealNearestCar(world);
    if (s.player.car) {
      driveRoute(world, lot.x, lot.y, 60 * 55);
      ticks(world, 3); // the tick that notices she reached the coupe
    }
    if (s.stageTimeLeft === null && (!s.player.car || s.player.car.dead)) {
      recoverCar(world); // the first ride did not survive the trip
      if (s.player.car) {
        driveRoute(world, lot.x, lot.y, 60 * 55);
        ticks(world, 3);
      }
    }
  }
  // The delivery clock is now running: head for the garage, freeze en route.
  if (s.player.car && s.stageTimeLeft !== null) {
    const door = s.city.garage.door;
    driveRoute(world, door.x, door.y, 60 * 5, 330);
  }
  ticks(world, 2);
}

/** Chase: three stars earned in the open, cruisers closing on the car. */
function shotChase(world) {
  const s = world.state;
  world.reset({ cash: 0, missionIndex: 0, best: 0 });
  s.screen = 'play';
  stealNearestCar(world);
  if (s.player.car) {
    // Position first, crime second: heat decays in under a minute, so the
    // shooting happens at the final location, seconds before the freeze.
    driveRoute(world, 1500, 570, 60 * 14);
    recoverCar(world);
    // Settle onto the eastbound lane at the firing spot, wherever the
    // route actually left her.
    if (s.player.car) driveToward(world, 1500, 593, 60 * 6, 40);
    // Empty the pistol toward the east until the law takes an interest.
    for (let i = 0; i < 60 * 8 && s.wanted.stars < 3; i += 1) {
      tick(world, { fire: true, aim: { x: s.player.x + 320, y: s.player.y } });
    }
    // Roll slowly east along the street and let the law close in on the
    // road — cruisers that try to cut across city blocks wedge on the
    // buildings, but on the street they run her down at full tilt. The
    // odd shot keeps the heat fresh; rolling keeps the bust meter still.
    for (let i = 0; i < 60 * 16; i += 1) {
      const car = s.player.car;
      if (!car || s.cops.length === 0) break;
      let near = Infinity;
      for (const c of s.cops) near = Math.min(near, dist(c, car));
      if (near < 255 || car.x > 1880) break;
      tick(world, {
        dir: { x: steerToward(car, 2150, 593), y: -0.5 },
        fire: i % 90 === 0,
        aim: { x: car.x + 320, y: car.y },
      });
    }
    // Stop-and-go: short halts let the cruisers pull up alongside, but
    // never long enough at a crawl for the bust meter to fill.
    for (let phase = 0; phase < 3 && s.player.car && s.cops.length > 0; phase += 1) {
      const car = s.player.car;
      for (let i = 0; i < 14; i += 1) {
        tick(world, { dir: { x: 0, y: car.speed > 4 ? 0.7 : 0 } });
      }
      driveToward(world, 1980, 593, 26, 30);
    }
    // And run again, cruisers right behind her.
    if (s.player.car) driveToward(world, 2150, 593, 34, 20);
  }
  ticks(world, 2);
}

/** Street: on foot on the boardwalk strip, a stealable car at the kerb. */
function shotStreet(world) {
  const s = world.state;
  world.reset({ cash: 0, missionIndex: 0, best: 0 });
  s.screen = 'play';
  // The parked car nearest the boardwalk strip, at the pier's end of town.
  let target = null;
  let targetDist = Infinity;
  for (const car of s.cars) {
    if (car.driver !== 'parked' || car.dead) continue;
    const d = dist(car, { x: 2180, y: 880 });
    if (d < targetDist) { target = car; targetDist = d; }
  }
  if (!target) target = nearestStealable(world, { x: 2180, y: 880 });
  if (target) {
    walkRoute(world, [
      { x: s.player.x, y: 512 }, // the north sidewalk of the middle street
      { x: 2050, y: 512 },
      { x: 2050, y: target.y },
      { x: target.x - 58, y: target.y },
    ]);
    // Turn to face the car, one short step's worth of direction.
    const p = s.player;
    const d = Math.hypot(target.x - p.x, target.y - p.y) || 1;
    tick(world, { dir: { x: (target.x - p.x) / d, y: (target.y - p.y) / d } });
  }
  ticks(world, 70); // let the crowd drift through the frame
}

/** Mission: out on Gullwing Pier, walking to the glowing package. */
function shotMission(world) {
  const s = world.state;
  world.reset({ cash: 400, missionIndex: 1, best: 400 }); // a returning career
  s.screen = 'play';
  startCurrentMission(world); // Salt and Static: pickup at the pier end
  const goal = s.objective;
  if (goal) {
    walkRoute(world, [
      { x: s.player.x, y: 512 },
      { x: 2195, y: 512 },
      { x: 2195, y: 880 },
      { x: Math.max(2260, goal.x - 150), y: goal.y },
    ], 60 * 40);
  }
  ticks(world, 2);
}

const SCENES = {
  cover: shotCover,
  chase: shotChase,
  street: shotStreet,
  mission: shotMission,
};

/**
 * Stage one deterministic screenshot scene on a world created for it.
 * Unknown names fall back to the cover scene.
 */
export function stageShot(name, world) {
  const scene = SCENES[name] || SCENES.cover;
  scene(world);
  world.state.screen = 'play';
}
