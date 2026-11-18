// Sunfall City — the story: five jobs for Odette "Odie" Crane, the fixer who
// works out of the Sunfall Garage, against the Glass Eels, the crew trying
// to buy the harbour out from under everyone. Juno Marchetti drives.
//
// MISSIONS holds the raw scripts with stage spots named by anchor ('garage',
// 'pierEnd', a building kind like 'cafe', ...). buildMissions(city) walks a
// real city and hands back fresh defs with concrete x/y on every stage, so
// world.js never has to know what an anchor is. Stage shapes:
//   { type:'goto',    x, y, radius, label }            reach the point
//   { type:'pickup',  x, y, radius, label, heat? }     reach it, take the thing
//   { type:'deliver', x, y, radius, label, time }      drive it there, timed
//   { type:'escape',  x, y, radius, label }            complete at 0 stars
//   { type:'shootout',x, y, radius, label, count }     down `count` rivals there
//   { type:'finale',  x, y, radius, label, time, minStars }  timed, stay hot

import { PRICES } from './config.js';

export const MISSIONS = [
  {
    id: 'borrowed-wheels',
    title: 'Borrowed Wheels',
    giver: 'Odie',
    reward: PRICES.missionRewards[0],
    intro: [
      { who: 'Odie', text: 'Juno. A buyer in the marina district wants a coupe, and he does not care whose name is on the papers.' },
      { who: 'Odie', text: 'There is one sitting in a parking lot across town, keys practically in it. Take it. Bring it home to my garage.' },
      { who: 'Juno', text: 'Steal a car, drive it back. My kind of Tuesday.' },
    ],
    outro: [
      { who: 'Odie', text: 'Clean work. The buyer wires the money tonight, and your cut is real this time.' },
      { who: 'Juno', text: 'Keep them coming, Odie.' },
    ],
    stages: [
      { type: 'goto', at: 'farParking', radius: 46, label: 'Reach the marked coupe' },
      { type: 'deliver', at: 'garage', radius: 62, label: 'Deliver the coupe to the Sunfall Garage', time: 150 },
    ],
  },
  {
    id: 'salt-and-static',
    title: 'Salt and Static',
    giver: 'Odie',
    reward: PRICES.missionRewards[1],
    intro: [
      { who: 'Odie', text: 'A courier dropped a package at the end of Gullwing Pier and got nervous about the company there.' },
      { who: 'Odie', text: 'Walk out, pick it up, and run it to the warehouse by the freight yard. Clock is ticking once it is in your hands.' },
      { who: 'Juno', text: 'A package on a pier. Nothing ever goes wrong with those.' },
    ],
    outro: [
      { who: 'Odie', text: 'Radios, sealed and dry. The harbour crews owe us one now.' },
    ],
    stages: [
      { type: 'pickup', at: 'pierEnd', radius: 40, label: 'Pick up the package at the pier end' },
      { type: 'deliver', at: 'warehouse', radius: 58, label: 'Deliver the package to the warehouse', time: 120 },
    ],
  },
  {
    id: 'the-blue-ledger',
    title: 'The Blue Ledger',
    giver: 'Odie',
    reward: PRICES.missionRewards[2],
    intro: [
      { who: 'Odie', text: 'The cafe on Meridian keeps a blue ledger — every bribe the Glass Eels ever paid, in handwriting.' },
      { who: 'Odie', text: 'The owner will hand it over, but the moment you touch it, half the city will want it back. Take it, then lose the law.' },
      { who: 'Juno', text: 'Grab the book and disappear. Got it.' },
    ],
    outro: [
      { who: 'Odie', text: 'This ledger is worth more than gold. You just bought the harbour some breathing room.' },
    ],
    stages: [
      { type: 'pickup', at: 'cafe', radius: 46, label: 'Collect the blue ledger from the cafe', heat: 30 },
      { type: 'escape', at: 'garage', radius: 62, label: 'Lose the police' },
    ],
  },
  {
    id: 'eels-at-the-dock',
    title: 'Eels at the Dock',
    giver: 'Odie',
    reward: PRICES.missionRewards[3],
    intro: [
      { who: 'Odie', text: 'Five Glass Eels are sitting on the dock by the pier, shaking down the night ferries.' },
      { who: 'Odie', text: 'Walk down there and explain, with feeling, that the harbour is not theirs. All five. Make it stick.' },
      { who: 'Juno', text: 'Five of them, one of me. They should have brought more.' },
    ],
    outro: [
      { who: 'Odie', text: 'The ferry crews are singing your name, Juno. The Eels will think twice about that dock.' },
    ],
    stages: [
      { type: 'goto', at: 'pierBase', radius: 52, label: 'Reach the dock by the pier' },
      { type: 'shootout', at: 'pierBase', radius: 90, label: 'Drive off the Glass Eels', count: 5 },
    ],
  },
  {
    id: 'glass-sunset',
    title: 'Glass Sunset',
    giver: 'Odie',
    reward: PRICES.missionRewards[4],
    intro: [
      { who: 'Odie', text: 'Last job, Juno. The Eels are moving their take out of the Hotel Solana tonight — in a bag, by car.' },
      { who: 'Odie', text: 'Lift the bag, and bring it home loud: I want every patrol in Sunfall chasing you and seeing nothing else. Keep the heat on you, two stars or more, and do not be late.' },
      { who: 'Juno', text: 'Steal the money, lead the parade, home by sunset. Done.' },
    ],
    outro: [
      { who: 'Odie', text: 'That was the Eels\u2019 whole season, gone in one drive. The harbour stays ours, Juno.' },
      { who: 'Juno', text: 'Then let\u2019s watch the sun go down on it.' },
    ],
    stages: [
      { type: 'pickup', at: 'hotel', radius: 46, label: 'Lift the money bag from the Hotel Solana', heat: 30 },
      { type: 'finale', at: 'garage', radius: 62, label: 'Bring the bag home — keep the heat on', time: 180, minStars: 2 },
    ],
  },
];

/** A building's doorstep, just south of it and kept inside the world. */
function doorstep(city, b) {
  return {
    x: Math.max(12, Math.min(city.w - 12, b.x + b.w / 2)),
    y: Math.max(12, Math.min(city.h - 12, b.y + b.h + 26)),
  };
}

/** First building of a kind (never the garage), or null. */
function findBuilding(city, kind) {
  for (const b of city.buildings) {
    if (b.kind === kind) return doorstep(city, b);
  }
  return null;
}

/** Any non-garage building's doorstep, as a fallback anchor. */
function anyBuilding(city) {
  for (const b of city.buildings) {
    if (b.kind !== 'garage') return doorstep(city, b);
  }
  return { x: city.spawn.x, y: city.spawn.y };
}

/** The parking lot farthest from the garage (not the garage apron itself). */
function farParking(city) {
  const g = city.garage.door;
  let best = null;
  let bestD = -1;
  for (const lot of city.lots) {
    if (lot.ground !== 'parking') continue;
    const cx = lot.x + lot.w / 2;
    const cy = lot.y + lot.h / 2;
    if (Math.abs(cx - g.x) < 90 && Math.abs(cy - g.y) < 130) continue; // the apron
    const d = (cx - g.x) ** 2 + (cy - g.y) ** 2;
    if (d > bestD) { bestD = d; best = { x: cx, y: cy }; }
  }
  if (best) return best;
  return { x: city.roadsX[city.roadsX.length - 1], y: city.roadsY[1] };
}

function resolveAnchor(city, at) {
  switch (at) {
    case 'garage': return { x: city.garage.door.x, y: city.garage.door.y };
    case 'pierEnd': return { x: city.pier.x + city.pier.w - 18, y: city.pier.y + city.pier.h / 2 };
    case 'pierBase': return { x: city.boardwalk.x0 + 23, y: city.pier.y + city.pier.h / 2 };
    case 'farParking': return farParking(city);
    case 'warehouse': return findBuilding(city, 'warehouse') || anyBuilding(city);
    case 'cafe': return findBuilding(city, 'cafe') || anyBuilding(city);
    case 'hotel': return findBuilding(city, 'hotel') || anyBuilding(city);
    default: return { x: city.spawn.x, y: city.spawn.y };
  }
}

/**
 * Fresh mission defs with every stage anchored to a concrete point in this
 * city: [{ id, title, giver, reward, intro, outro, stages }] where stages
 * carry { type, x, y, radius, label } plus their type's extras
 * (time / heat / count / minStars).
 */
export function buildMissions(city) {
  return MISSIONS.map((m) => ({
    id: m.id,
    title: m.title,
    giver: m.giver,
    reward: m.reward,
    intro: m.intro.map((line) => ({ ...line })),
    outro: m.outro.map((line) => ({ ...line })),
    stages: m.stages.map((s) => {
      const { at, ...rest } = s;
      const p = resolveAnchor(city, at);
      return { ...rest, x: p.x, y: p.y };
    }),
  }));
}
