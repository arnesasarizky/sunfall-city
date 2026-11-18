// Sunfall City — the world: one seeded city, its traffic, crowds, cops and
// crime, and the five-job story that runs through it. createWorld(rng)
// returns { state, reset, step, dismiss, continueFreeRoam, onSave }.
//
// state is the plain object render.js and hud.js read every frame:
//   { city, player, cars, cops, peds, wanted, tracers, particles, camera,
//     objective, time, screen, cash, mission, missionIndex, stageTimeLeft,
//     dialogue, screenText }
//
// step(dt, input, audio) advances one tick. `input` is a snapshot built by
// main.js each tick:
//   { dir: {x, y}, sprint, actions, mouse: {x, y, down}, fire, aim? }
// with actions a bitmask of ACTION_* from input.js plus ACTION_MELEE below,
// and mouse/aim already converted to world coordinates. This module never
// touches window/document; audio is an optional createAudio() object.

import { PLAYER, CAR, PRICES, WANTED } from './config.js';
import { buildCity, collideMove, groundAt } from './city.js';
import { spawnTraffic, spawnParked, stepCar, updateTrafficCar, damageCar } from './vehicles.js';
import { createPlayer, spawnPeds, spawnPedAt, updatePeds, scarePeds, PED_RADIUS } from './people.js';
import { tryShoot, tryMelee } from './combat.js';
import { createWanted, addHeat, isWitnessed, updateWanted, ensureCopCount, updateCops } from './police.js';
import { buildMissions } from './missions.js';
import { ACTION_INTERACT, ACTION_CONFIRM } from './input.js';

/** Extra action bit main.js sets for the K key (input.js owns 1/2/4/8). */
export const ACTION_MELEE = 16;

const TRAFFIC_COUNT = 14;
const PARKED_COUNT = 10;
const PED_COUNT = 26;
const PLAYER_CAR_TOP = 322; // Juno's right foot beats the traffic tune.
const TALK_RANGE = 82;
const ENTER_RANGE = 62;
const FIRE_PERIOD = 0.26;
const MELEE_PERIOD = 0.38;

const NO_AUDIO = {
  start() {}, shoot() {}, melee() {}, hit() {}, pickup() {}, cash() {},
  setSiren() {}, setEngine() {}, toggleMute() { return false; }, muted: false,
};

const ABORT_LINES = [
  'Too slow, Juno. The moment is gone — come back and we try again.',
  'That one got away from us. Shake it off and see me at the garage.',
];

export function createWorld(rng) {
  const state = {
    city: null, player: null, cars: [], cops: [], peds: [],
    wanted: createWanted(), tracers: [], particles: [],
    camera: { x: 0, y: 0 }, objective: null, time: 0,
    screen: 'title', cash: 0, missionIndex: 0, best: 0,
    mission: null, stageTimeLeft: null, dialogue: null, screenText: '',
  };

  let missions = [];
  let stage = null;
  let dialogueQueue = [];
  let afterDialogue = null; // 'intro' | 'outro' | 'abort'
  let stageRivals = [];
  let stageSawStars = false;
  let fireCd = 0;
  let meleeCd = 0;
  let hurtCd = 0;
  let crashHeatCd = 0;
  let lastHurtAt = -99;

  const world = {
    state,
    onSave: null,
    reset,
    step,
    dismiss,
    continueFreeRoam,
  };
  return world;

  // ---------------------------------------------------------- lifecycle

  function reset(save) {
    const city = buildCity(rng);
    missions = buildMissions(city);
    state.city = city;
    state.player = createPlayer(city);
    state.cars = [...spawnTraffic(city, rng, TRAFFIC_COUNT), ...spawnParked(city, rng, PARKED_COUNT)];
    state.cops = [];
    state.peds = spawnPeds(city, rng, PED_COUNT);
    state.wanted = createWanted();
    state.tracers = [];
    state.particles = [];
    state.time = 0;
    state.cash = Math.max(0, Math.floor(save?.cash || 0));
    state.best = Math.max(0, Math.floor(save?.best || 0));
    state.missionIndex = Math.min(missions.length, Math.max(0, Math.floor(save?.missionIndex || 0)));
    state.mission = null;
    state.stageTimeLeft = null;
    state.dialogue = null;
    state.screenText = '';
    state.screen = 'title';
    state.camera = { x: state.player.x, y: state.player.y };
    stage = null;
    dialogueQueue = [];
    afterDialogue = null;
    stageRivals = [];
    fireCd = 0; meleeCd = 0; hurtCd = 0; crashHeatCd = 0;
    refreshObjective();
  }

  function emitSave() {
    state.best = Math.max(state.best, state.cash);
    if (typeof world.onSave === 'function') {
      world.onSave({ cash: state.cash, missionIndex: state.missionIndex, best: state.best });
    }
  }

  /** Busted/wasted follow-up: Juno wakes at the garage, the law forgets. */
  function dismiss() {
    releaseCar();
    clearStageRivals();
    state.player = createPlayer(state.city);
    state.wanted = createWanted();
    state.cops = [];
    state.mission = null;
    stage = null;
    state.stageTimeLeft = null;
    state.dialogue = null;
    dialogueQueue = [];
    afterDialogue = null;
    state.screenText = '';
    state.camera = { x: state.player.x, y: state.player.y };
    state.screen = 'play';
    refreshObjective();
  }

  /** After the career-complete screen: keep driving, no more jobs. */
  function continueFreeRoam() {
    state.screen = 'play';
    refreshObjective();
  }

  // ---------------------------------------------------------- helpers

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function witnesses() {
    const list = [];
    for (const p of state.peds) if (p.state !== 'down') list.push(p);
    for (const c of state.cops) list.push(c);
    return list;
  }

  function crime(kind, x, y) {
    addHeat(state.wanted, kind, isWitnessed(witnesses(), x, y));
  }

  function combatWorld() {
    return { city: state.city, peds: state.peds, cars: [...state.cars, ...state.cops], player: state.player };
  }

  function burst(x, y, color, n, size) {
    for (let i = 0; i < n; i += 1) {
      const a = rng.range(0, Math.PI * 2);
      const s = rng.range(20, 120);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rng.range(0.25, 0.6), maxLife: 0.6, color, size: size || 3,
      });
    }
  }

  function refreshObjective() {
    if (state.dialogue) { state.objective = null; return; }
    if (stage) {
      state.objective = stage.type === 'escape'
        ? null
        : { x: stage.x, y: stage.y, label: stage.label };
      return;
    }
    if (!state.mission && state.missionIndex < missions.length) {
      const door = state.city.garage.door;
      state.objective = { x: door.x, y: door.y, label: 'Talk to Odie' };
      return;
    }
    state.objective = null;
  }

  function releaseCar() {
    const p = state.player;
    if (p && p.car) {
      p.car.driver = 'parked';
      if (p.car.savedTop !== undefined) { p.car.topSpeed = p.car.savedTop; delete p.car.savedTop; }
      p.car = null;
    }
    if (p) p.onFoot = true;
  }

  function clearStageRivals() {
    if (stageRivals.length) {
      const gone = new Set(stageRivals);
      state.peds = state.peds.filter((p) => !gone.has(p));
      stageRivals = [];
    }
  }

  // ---------------------------------------------------------- missions

  function startMission() {
    const def = missions[state.missionIndex];
    if (!def) return;
    state.mission = def;
    stage = null;
    dialogueQueue = [...def.intro];
    afterDialogue = 'intro';
    advanceDialogue();
  }

  function advanceDialogue() {
    state.dialogue = dialogueQueue.shift() || null;
    if (state.dialogue) { refreshObjective(); return; }
    const done = afterDialogue;
    afterDialogue = null;
    if (done === 'intro') activateStage(0);
    else if (done === 'outro') finishCareerStep();
    else if (done === 'abort') { state.mission = null; refreshObjective(); }
    else refreshObjective();
  }

  function activateStage(index) {
    stage = state.mission.stages[index];
    state.stageTimeLeft = stage.time !== undefined ? stage.time : null;
    stageSawStars = state.wanted.stars > 0;
    clearStageRivals();
    if (stage.type === 'shootout') {
      for (let i = 0; i < (stage.count || 0); i += 1) {
        let spot = null;
        for (let tries = 0; tries < 10 && !spot; tries += 1) {
          const x = stage.x + rng.range(-84, 84);
          const y = stage.y + rng.range(-84, 84);
          if (groundAt(state.city, x, y) !== 'building') spot = { x, y };
        }
        if (!spot) spot = { x: stage.x, y: stage.y };
        const rival = spawnPedAt(state.city, rng, spot.x, spot.y, true);
        rival.shootCd = rng.range(0.4, 1.3);
        state.peds.push(rival);
        stageRivals.push(rival);
      }
    }
    refreshObjective();
  }

  function completeStage(audio) {
    if (stage.type === 'pickup') {
      audio.pickup();
      if (stage.heat) crime(stage.heat, stage.x, stage.y);
    }
    if (state.mission.stages.indexOf(stage) + 1 >= state.mission.stages.length) {
      state.cash += state.mission.reward;
      audio.cash();
      stage = null;
      state.stageTimeLeft = null;
      dialogueQueue = [...state.mission.outro];
      afterDialogue = 'outro';
      advanceDialogue();
    } else {
      activateStage(state.mission.stages.indexOf(stage) + 1);
    }
  }

  function abortMission() {
    clearStageRivals();
    stage = null;
    state.stageTimeLeft = null;
    dialogueQueue = [{ who: 'Odie', text: rng.pick(ABORT_LINES) }];
    afterDialogue = 'abort';
    advanceDialogue();
  }

  function finishCareerStep() {
    state.mission = null;
    state.missionIndex += 1;
    emitSave();
    if (state.missionIndex >= missions.length) {
      state.screen = 'end';
      state.screenText = 'Every job done. The harbour is still standing.';
    }
    refreshObjective();
  }

  function checkStage(dt, audio) {
    if (!stage) return;
    const p = state.player;
    if (state.stageTimeLeft !== null) {
      state.stageTimeLeft -= dt;
      if (state.stageTimeLeft <= 0) { abortMission(); return; }
    }
    switch (stage.type) {
      case 'goto':
      case 'pickup':
        if (dist(p, stage) < stage.radius) completeStage(audio);
        break;
      case 'deliver':
        if (p.car && dist(p, stage) < stage.radius) completeStage(audio);
        break;
      case 'escape':
        if (state.wanted.stars > 0) stageSawStars = true;
        if (stageSawStars && state.wanted.stars === 0) completeStage(audio);
        break;
      case 'shootout':
        if (stageRivals.every((r) => r.state === 'down')) completeStage(audio);
        break;
      case 'finale':
        if (p.car && dist(p, stage) < stage.radius && state.wanted.stars >= (stage.minStars || 0)) {
          completeStage(audio);
        }
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------- the tick

  function step(dt, input, audio) {
    audio = audio || NO_AUDIO;
    const p = state.player;
    state.time += dt;
    fireCd = Math.max(0, fireCd - dt);
    meleeCd = Math.max(0, meleeCd - dt);
    hurtCd = Math.max(0, hurtCd - dt);
    crashHeatCd = Math.max(0, crashHeatCd - dt);
    const danger = [];

    const actions = input?.actions || 0;

    // Dialogue owns the interact/confirm buttons while it is up.
    if (state.dialogue) {
      if (actions & (ACTION_INTERACT | ACTION_CONFIRM)) advanceDialogue();
    } else if (state.mission) {
      checkStage(dt, audio);
    }

    stepPlayer(dt, input || {}, audio, danger);
    stepTraffic(dt, danger);
    stepRivals(dt, audio, danger);
    stepPeds(dt, danger);
    stepPolice(dt, audio);
    stepFx(dt);
    // However the damage arrived, a flatlined Juno is a wasted Juno.
    if (p.health <= 0 && state.screen === 'play') hurtPlayer(0, p.x + 10, p.y);

    audio.setSiren(state.wanted.stars);
    audio.setEngine(p.car ? Math.abs(p.car.speed) / (p.car.topSpeed || 1) : 0, !!p.car);
    state.camera.x = p.x;
    state.camera.y = p.y;
    if (p.health > 0 && state.time - lastHurtAt > 6) {
      p.health = Math.min(p.maxHealth, p.health + 4 * dt);
    }
  }

  function stepPlayer(dt, input, audio, danger) {
    const p = state.player;
    const city = state.city;
    const dir = input.dir || { x: 0, y: 0 };
    const actions = input.actions || 0;
    const talking = !!state.dialogue;

    if (p.car) {
      // Driving: vertical input is the throttle, horizontal the wheel.
      // While dialogue is up Juno just holds the brake and listens.
      const car = p.car;
      const impact = talking
        ? stepCar(car, dt, 0, car.speed > 4 ? -0.6 : 0, city)
        : stepCar(car, dt, dir.x, -dir.y, city);
      p.x = car.x; p.y = car.y; p.angle = car.angle; p.speed = Math.abs(car.speed);
      if (impact > 0) {
        damageCar(car, impact * 0.1);
        burst(car.x, car.y, '#e8cf8f', 8, 3);
        audio.hit();
        if (impact > 150 && crashHeatCd <= 0) { crime('collision', car.x, car.y); crashHeatCd = 1.2; }
      }
      runOverCheck(car, danger);
      if (!talking && (actions & ACTION_INTERACT)) exitCar();
      if (input.fire || input.mouse?.down) fireWeapon(input, audio, danger);
      return;
    }

    // On foot.
    if (!talking && (dir.x !== 0 || dir.y !== 0)) {
      const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      const len = Math.hypot(dir.x, dir.y) || 1;
      const moved = collideMove(city, p.x, p.y, PLAYER.radius,
        (dir.x / len) * speed * dt, (dir.y / len) * speed * dt);
      p.x = moved.x; p.y = moved.y;
      p.angle = Math.atan2(dir.y, dir.x);
      p.speed = speed;
    } else {
      p.speed = 0;
    }

    if (talking) return;

    if (actions & ACTION_INTERACT) {
      if (tryInteract()) return;
      swingFist(audio, danger); // nothing to use: throw a punch instead
      return;
    }
    if (actions & ACTION_MELEE) swingFist(audio, danger);
    if (input.fire || input.mouse?.down) fireWeapon(input, audio, danger);
  }

  function tryInteract() {
    const p = state.player;
    const door = state.city.garage.door;
    if (!state.mission && state.missionIndex < missions.length && dist(p, door) < TALK_RANGE) {
      startMission();
      return true;
    }
    // Climb into the nearest stealable car.
    let best = null;
    let bestDist = ENTER_RANGE;
    for (const car of state.cars) {
      if (car.dead || car.driver === 'cop') continue;
      const d = dist(p, car);
      if (d < bestDist) { best = car; bestDist = d; }
    }
    if (best) {
      best.driver = 'player';
      best.savedTop = best.topSpeed;
      best.topSpeed = Math.max(best.topSpeed, PLAYER_CAR_TOP);
      p.car = best;
      p.onFoot = false;
      p.x = best.x; p.y = best.y; p.angle = best.angle;
      crime('carjack', p.x, p.y);
      scarePeds(state.peds, p.x, p.y, 130);
      return true;
    }
    return false;
  }

  function exitCar() {
    const p = state.player;
    const car = p.car;
    releaseCar();
    // Step out on the car's left side, clear of the bodywork.
    const side = car.angle - Math.PI / 2;
    const spot = collideMove(state.city, car.x, car.y, PLAYER.radius,
      Math.cos(side) * (CAR.radius + 16), Math.sin(side) * (CAR.radius + 16));
    p.x = spot.x; p.y = spot.y;
    p.speed = 0;
  }

  function fireWeapon(input, audio, danger) {
    if (fireCd > 0) return;
    const p = state.player;
    let angle = p.angle;
    const aim = input.aim || (input.mouse?.down ? input.mouse : null);
    if (aim) {
      angle = Math.atan2(aim.y - p.y, aim.x - p.x);
      p.angle = angle;
    }
    fireCd = FIRE_PERIOD;
    p.angle = angle;
    // Pass Juno herself as the shooter: combat never targets the shooter,
    // and her `car` property keeps her own ride out of the line of fire.
    const res = tryShoot(combatWorld(), p);
    state.tracers.push({ ...res.tracer, life: 0.09 });
    audio.shoot();
    scarePeds(state.peds, p.x, p.y, 170);
    danger.push({ x: p.x, y: p.y, r: 150 });
    crime('shot', p.x, p.y);
    if (res.downed && res.hit && stageRivals.includes(res.hit)) {
      crime('rivalDown', p.x, p.y);
    }
  }

  function swingFist(audio, danger) {
    if (meleeCd > 0) return;
    meleeCd = MELEE_PERIOD;
    const p = state.player;
    const res = tryMelee(combatWorld(), p);
    audio.melee();
    if (res && res.hit) {
      audio.hit();
      burst(res.hit.x, res.hit.y, '#f7b267', 5, 3);
      if (res.hit.rival !== undefined) { // a ped, not a car
        crime('assault', p.x, p.y);
        if (res.downed && res.hit.rival) crime('rivalDown', p.x, p.y);
      }
      danger.push({ x: p.x, y: p.y, r: 90 });
    }
  }

  function runOverCheck(car, danger) {
    if (Math.abs(car.speed) < 90) return;
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (dist(car, ped) < CAR.radius + PED_RADIUS + 4) {
        ped.health -= 55;
        if (ped.health <= 0) { ped.health = 0; ped.state = 'down'; ped.speed = 0; }
        else { ped.state = 'flee'; ped.calm = 3; ped.threat = { x: car.x, y: car.y }; }
        burst(ped.x, ped.y, '#c94f42', 7, 3);
        crime(ped.rival ? 'rivalDown' : 'assault', car.x, car.y);
        danger.push({ x: car.x, y: car.y, r: 130 });
      }
    }
  }

  function stepTraffic(dt, danger) {
    const p = state.player;
    for (const car of [...state.cars, ...state.cops]) {
      if (car.bumpCd) car.bumpCd = Math.max(0, car.bumpCd - dt);
    }
    const blockers = [...state.cars, ...state.cops];
    if (p.onFoot) blockers.push(p);
    for (const car of state.cars) {
      if (car.driver === 'traffic') {
        const impact = updateTrafficCar(car, dt, state.city, rng, blockers);
        if (impact > 0) {
          damageCar(car, impact * 0.15);
          burst(car.x, car.y, '#e8cf8f', 6, 3);
          danger.push({ x: car.x, y: car.y, r: 110 });
        }
      }
    }
    // Car-car bumps: separate the pair, share the pain.
    const all = [...state.cars, ...state.cops];
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i];
        const b = all[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = CAR.radius * 2 - 4;
        if (d <= 0.01 || d >= min) continue;
        const push = (min - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        if (a.driver !== 'player') {
          const m = collideMove(state.city, a.x, a.y, CAR.radius, -ux * push, -uy * push);
          a.x = m.x; a.y = m.y;
        }
        if (b.driver !== 'player') {
          const m = collideMove(state.city, b.x, b.y, CAR.radius, ux * push, uy * push);
          b.x = m.x; b.y = m.y;
        }
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 150 && (a.bumpCd || 0) <= 0 && (b.bumpCd || 0) <= 0) {
          // One crunch per bump, not one per tick of grinding contact.
          damageCar(a, rel * 0.035);
          damageCar(b, rel * 0.035);
          a.bumpCd = 0.6;
          b.bumpCd = 0.6;
          burst((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffd98e', 6, 3);
          if ((a === p.car || b === p.car) && crashHeatCd <= 0) {
            crime('collision', p.x, p.y);
            crashHeatCd = 1.2;
          }
        }
      }
    }
    // Traffic running Juno down.
    if (p.onFoot && hurtCd <= 0) {
      for (const car of all) {
        if (car.driver === 'player' || car.dead) continue;
        if (Math.abs(car.speed) > 130 && dist(car, p) < CAR.radius + PLAYER.radius + 2) {
          hurtPlayer(car.driver === 'cop' ? 8 : 13, car.x, car.y);
          break;
        }
      }
    }
  }

  function hurtPlayer(amt, srcX, srcY) {
    const p = state.player;
    p.health -= amt;
    lastHurtAt = state.time;
    hurtCd = 0.8;
    burst(p.x, p.y, '#c94f42', 6, 3);
    const a = Math.atan2(p.y - srcY, p.x - srcX);
    const moved = collideMove(state.city, p.x, p.y, PLAYER.radius, Math.cos(a) * 22, Math.sin(a) * 22);
    p.x = moved.x; p.y = moved.y;
    if (p.health <= 0 && state.screen === 'play') {
      p.health = 0;
      state.cash = Math.max(0, state.cash - PRICES.wastedBill);
      state.screen = 'wasted';
      state.screenText = `The hospital bill came to $${PRICES.wastedBill}. Odie is not covering it.`;
      emitSave();
    }
  }

  function stepRivals(dt, audio, danger) {
    const p = state.player;
    for (const rival of stageRivals) {
      if (rival.state === 'down') continue;
      const d = dist(rival, p);
      if (d > 215) {
        rival.angle = Math.atan2(p.y - rival.y, p.x - rival.x);
        const moved = collideMove(state.city, rival.x, rival.y, PED_RADIUS,
          Math.cos(rival.angle) * 148 * dt, Math.sin(rival.angle) * 148 * dt);
        rival.x = moved.x; rival.y = moved.y;
      } else if (d < 110) {
        rival.angle = Math.atan2(rival.y - p.y, rival.x - p.x);
        const moved = collideMove(state.city, rival.x, rival.y, PED_RADIUS,
          Math.cos(rival.angle) * 90 * dt, Math.sin(rival.angle) * 90 * dt);
        rival.x = moved.x; rival.y = moved.y;
      }
      rival.shootCd = (rival.shootCd || 0) - dt;
      if (d < 400 && rival.shootCd <= 0) {
        rival.shootCd = rng.range(0.75, 1.25);
        const aim = Math.atan2(p.y - rival.y, p.x - rival.x) + rng.range(-0.085, 0.085);
        rival.angle = aim;
        const healthBefore = p.health;
        // The rival itself is the shooter, so its own body is no target.
        const res = tryShoot(combatWorld(), rival);
        state.tracers.push({ ...res.tracer, life: 0.09 });
        audio.shoot();
        danger.push({ x: rival.x, y: rival.y, r: 140 });
        if (p.health < healthBefore) {
          lastHurtAt = state.time;
          if (p.health <= 0) hurtPlayer(0, rival.x, rival.y);
        }
      }
    }
  }

  function stepPeds(dt, danger) {
    const p = state.player;
    // Fast cars are danger on wheels, even before they hit anyone.
    for (const car of state.cars) {
      if (Math.abs(car.speed) > 175) danger.push({ x: car.x, y: car.y, r: 95 });
    }
    const crowd = state.peds.filter((ped) => !stageRivals.includes(ped));
    updatePeds(crowd, dt, {
      city: state.city,
      rng,
      danger,
      player: p,
      playerWanted: state.wanted.stars > 0,
    });
  }

  function stepPolice(dt, audio) {
    const p = state.player;
    const pos = { x: p.x, y: p.y };
    ensureCopCount(state.cops, state.city, rng, state.wanted, pos);
    const visible = state.cops.some((c) => dist(c, p) < 340);
    // "Hidden" means nobody at all can see her — dispatch keeps the
    // last-known position fresh while any bystander can (pedestrians
    // phone it in), so cruisers always have somewhere real to drive.
    // Tying this to cop sight alone deadlocked the law: cruisers spawn
    // beyond sight range and would sit parked forever, waiting for a
    // target that could only be set by a cruiser already close.
    const witnessed = visible
      || state.peds.some((w) => w.state !== 'down' && dist(w, p) < WANTED.witnessRadius);
    updateWanted(state.wanted, dt, { hidden: !witnessed, playerPos: pos });
    const blockers = [...state.cars, ...state.cops];
    const result = updateCops(state.cops, dt, {
      city: state.city,
      rng,
      wanted: state.wanted,
      player: { x: p.x, y: p.y, angle: p.angle, onFoot: p.onFoot, speed: p.car ? p.car.speed : 0, car: p.car },
      playerVisible: visible,
      blockers,
    });
    if (result === 'busted' && state.screen === 'play') {
      const fine = Math.max(PRICES.bustFineMin, state.wanted.stars * PRICES.bustFinePerStar);
      state.cash = Math.max(0, state.cash - fine);
      state.screen = 'busted';
      state.screenText = `The fine came to $${fine}. The car, the job, the evening — gone.`;
      audio.hit();
      emitSave();
    }
  }

  function stepFx(dt) {
    for (const t of state.tracers) t.life -= dt;
    state.tracers = state.tracers.filter((t) => t.life > 0);
    for (const pt of state.particles) {
      pt.life -= dt;
      pt.x += (pt.vx || 0) * dt;
      pt.y += (pt.vy || 0) * dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
  }
}
