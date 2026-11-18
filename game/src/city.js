// Sunfall City itself: a seeded procedural street grid on a golden-hour
// coast. Avenues and streets cross the western land; to the east the blocks
// give out to sand, a boardwalk, a pier and open water. One block holds the
// Sunfall Garage, Juno's home base, with its door on the south side and the
// player spawn on the apron in front of it.
//
// Everything is derived from the rng handed to buildCity, in a fixed order,
// so a seed always builds the same city.

import { WORLD, CITY, COLORS, BUILDING_COLORS, BUILDING_KINDS } from './config.js';

const ROAD_HALF = CITY.roadW / 2;

// The garage plot, inside the block between avenues 170/570 and streets
// 170/570: building at the north of the plot, parking apron to its south.
const GARAGE_RECT = { x: 258, y: 246, w: 158, h: 104 };
const GARAGE_RESERVE = { x: 238, y: 226, w: 198, h: 208 };

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function blockInners(boundaries, limit) {
  // Inner buildable spans between consecutive boundaries (world edge, road
  // centres, or the far limit), inset past each road and its sidewalk.
  const spans = [];
  for (let i = 0; i + 1 < boundaries.length; i += 1) {
    const left = boundaries[i];
    const right = boundaries[i + 1];
    const x0 = left === 0 ? 10 : left + ROAD_HALF + CITY.sidewalkW;
    const x1 = right === limit ? limit - 10 : right - ROAD_HALF - CITY.sidewalkW;
    if (x1 - x0 >= 56) spans.push([x0, x1]);
  }
  return spans;
}

/**
 * Build the city for a seeded rng (see createRandom).
 * Returns { w, h, roadsX, roadsY, roadW, sidewalkW,
 *   buildings: [{x,y,w,h,kind,color,floors}] (one has kind 'garage'),
 *   lots: [{x,y,w,h,ground}] with ground 'plaza'|'parking'|'grove',
 *   props: [{x,y,kind}] with kind 'palm'|'lamp'|'bench' (never colliding),
 *   beach: {x0,x1}, water: {x0,x1}, boardwalk: {x0,x1},
 *   pier: {x,y,w,h}, garage: {x,y,w,h, door:{x,y}, apron:{x,y,w,h}},
 *   spawn: {x,y} }.
 */
export function buildCity(rng) {
  const beach = { x0: CITY.beachX, x1: CITY.waterX };
  const water = { x0: CITY.waterX, x1: WORLD.w };
  const boardwalk = { x0: CITY.waterX - CITY.boardwalkW, x1: CITY.waterX };
  const pier = {
    x: boardwalk.x0,
    y: CITY.pierY - CITY.pierW / 2,
    w: CITY.pierEndX - boardwalk.x0,
    h: CITY.pierW,
  };

  const garage = {
    ...GARAGE_RECT,
    door: { x: GARAGE_RECT.x + GARAGE_RECT.w / 2, y: GARAGE_RECT.y + GARAGE_RECT.h },
    apron: { x: GARAGE_RECT.x, y: GARAGE_RECT.y + GARAGE_RECT.h, w: GARAGE_RECT.w, h: 64 },
  };
  const spawn = { x: garage.door.x, y: garage.apron.y + 38 };

  const buildings = [{
    ...GARAGE_RECT, kind: 'garage', color: COLORS.garage, floors: 1,
  }];
  const lots = [{ ...garage.apron, ground: 'parking' }];

  const cols = blockInners([0, ...CITY.avenuesX, CITY.beachX], CITY.beachX);
  const rows = blockInners([0, ...CITY.streetsY, WORLD.h], WORLD.h);
  for (const [bx0, bx1] of cols) {
    for (const [by0, by1] of rows) {
      const bw = bx1 - bx0;
      const bh = by1 - by0;
      const nx = bw > 260 ? rng.int(2, 3) : rng.int(1, 2);
      const ny = bh > 260 ? rng.int(2, 3) : rng.int(1, 2);
      for (let i = 0; i < nx; i += 1) {
        for (let j = 0; j < ny; j += 1) {
          const cell = {
            x: bx0 + (bw / nx) * i + 6,
            y: by0 + (bh / ny) * j + 6,
            w: bw / nx - 12,
            h: bh / ny - 12,
          };
          if (cell.w < 34 || cell.h < 34) continue;
          if (intersects(cell, GARAGE_RESERVE)) continue;
          if (rng.chance(0.78)) {
            const kind = rng.pick(BUILDING_KINDS);
            buildings.push({
              x: cell.x + rng.range(0, 8),
              y: cell.y + rng.range(0, 8),
              w: cell.w - rng.range(0, 10),
              h: cell.h - rng.range(0, 10),
              kind,
              color: rng.pick(BUILDING_COLORS),
              floors: kind === 'house' ? rng.int(1, 2) : rng.int(1, 6),
            });
          } else {
            lots.push({ ...cell, ground: rng.pick(['plaza', 'parking', 'grove']) });
          }
        }
      }
    }
  }

  const props = [];
  // Street lamps along both sidewalks of every avenue.
  for (const ax of CITY.avenuesX) {
    for (let y = 96; y < WORLD.h; y += 184) {
      if (rng.chance(0.55)) props.push({ x: ax - ROAD_HALF - CITY.sidewalkW / 2, y: y + rng.range(-8, 8), kind: 'lamp' });
      if (rng.chance(0.55)) props.push({ x: ax + ROAD_HALF + CITY.sidewalkW / 2, y: y + rng.range(-8, 8), kind: 'lamp' });
    }
  }
  // Palms and benches along the boardwalk.
  for (let y = 60; y < WORLD.h; y += 108) {
    if (rng.chance(0.7)) props.push({ x: boardwalk.x0 + 9, y: y + rng.range(-10, 10), kind: 'palm' });
    if (rng.chance(0.4)) props.push({ x: boardwalk.x1 - 9, y: y + rng.range(-14, 14), kind: 'bench' });
  }
  // Palms scattered on the sand (never on the pier deck).
  for (let i = 0; i < 26; i += 1) {
    const x = rng.range(beach.x0 + 14, boardwalk.x0 - 10);
    const y = rng.range(24, WORLD.h - 24);
    if (y > pier.y - 30 && y < pier.y + pier.h + 30) continue;
    props.push({ x, y, kind: 'palm' });
  }
  // Groves get a few palms each; plazas get a bench or two.
  for (const lot of lots) {
    if (lot.ground === 'grove') {
      const n = rng.int(2, 4);
      for (let i = 0; i < n; i += 1) {
        props.push({ x: rng.range(lot.x + 8, lot.x + lot.w - 8), y: rng.range(lot.y + 8, lot.y + lot.h - 8), kind: 'palm' });
      }
    } else if (lot.ground === 'plaza' && rng.chance(0.8)) {
      props.push({ x: rng.range(lot.x + 10, lot.x + lot.w - 10), y: rng.range(lot.y + 10, lot.y + lot.h - 10), kind: 'bench' });
    }
  }

  return {
    w: WORLD.w,
    h: WORLD.h,
    roadsX: [...CITY.avenuesX],
    roadsY: [...CITY.streetsY],
    roadW: CITY.roadW,
    sidewalkW: CITY.sidewalkW,
    buildings,
    lots,
    props,
    beach,
    water,
    boardwalk,
    pier,
    garage,
    spawn,
  };
}

function onPier(city, x, y) {
  const p = city.pier;
  return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
}

/** True when (x, y) is on a road surface. Streets run east to the boardwalk. */
export function isRoad(city, x, y) {
  if (y < 0 || y > city.h) return false;
  for (const ax of city.roadsX) {
    if (Math.abs(x - ax) <= ROAD_HALF) return true;
  }
  if (x <= city.boardwalk.x1) {
    for (const sy of city.roadsY) {
      if (Math.abs(y - sy) <= ROAD_HALF) return true;
    }
  }
  return false;
}

/** True when (x, y) is on a sidewalk flanking a road. */
export function isSidewalk(city, x, y) {
  const outer = ROAD_HALF + city.sidewalkW;
  for (const ax of city.roadsX) {
    const d = Math.abs(x - ax);
    if (d > ROAD_HALF && d <= outer && y >= 0 && y <= city.h) return true;
  }
  if (x < city.beach.x0) {
    for (const sy of city.roadsY) {
      const d = Math.abs(y - sy);
      if (d > ROAD_HALF && d <= outer) return true;
    }
  }
  return false;
}

/**
 * What the ground is at (x, y): one of 'road', 'sidewalk', 'boardwalk',
 * 'sand', 'pier', 'water', 'plaza', 'parking', 'grove', 'building', 'block'
 * (plain block ground), or 'void' outside the world.
 */
export function groundAt(city, x, y) {
  if (x < 0 || y < 0 || x > city.w || y > city.h) return 'void';
  if (onPier(city, x, y)) return 'pier';
  if (x >= city.water.x0) return 'water';
  if (x >= city.boardwalk.x0) return 'boardwalk';
  if (x >= city.beach.x0) return 'sand';
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return 'building';
  }
  if (isRoad(city, x, y)) return 'road';
  if (isSidewalk(city, x, y)) return 'sidewalk';
  for (const lot of city.lots) {
    if (x >= lot.x && x <= lot.x + lot.w && y >= lot.y && y <= lot.y + lot.h) return lot.ground;
  }
  return 'block';
}

/**
 * True when a circle of radius r at (x, y) would hit something solid: a
 * building, the world edge, or the sea (the pier deck is walkable).
 */
export function collides(city, x, y, r) {
  if (x - r < 0 || y - r < 0 || x + r > city.w || y + r > city.h) return true;
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  if (x + r > city.water.x0 && !onPier(city, x, y)) return true;
  return false;
}

/**
 * Move a circle of radius r from (x, y) by (dx, dy), sliding along whatever
 * it hits (axes are resolved separately). Returns the new { x, y }.
 * Designed for per-step deltas, not teleports.
 */
export function collideMove(city, x, y, r, dx, dy) {
  let nx = x + dx;
  if (collides(city, nx, y, r)) nx = x;
  let ny = y + dy;
  if (collides(city, nx, ny, r)) ny = y;
  return { x: nx, y: ny };
}

/** A random point on a road: { x, y, axis } with axis 'v' or 'h'. */
export function randomRoadPoint(rng, city) {
  if (rng.chance(0.5)) {
    return { x: rng.pick(city.roadsX), y: rng.range(40, city.h - 40), axis: 'v' };
  }
  return { x: rng.range(40, city.boardwalk.x0 - 20), y: rng.pick(city.roadsY), axis: 'h' };
}

/**
 * A random point a pedestrian could stand on (sidewalk, boardwalk, sand or
 * plaza): { x, y, ground }. Falls back to the garage apron.
 */
export function randomWalkPoint(rng, city) {
  for (let i = 0; i < 40; i += 1) {
    const x = rng.range(20, city.water.x0 - 10);
    const y = rng.range(20, city.h - 20);
    const ground = groundAt(city, x, y);
    if (ground === 'sidewalk' || ground === 'boardwalk' || ground === 'sand' || ground === 'plaza') {
      return { x, y, ground };
    }
  }
  return { x: city.spawn.x, y: city.spawn.y, ground: 'parking' };
}
