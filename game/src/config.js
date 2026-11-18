// Sunfall City — shared tuning constants.
// Everything gameplay-related that another module might need lives here so the
// numbers stay in one place: world size, the street grid, movement speeds,
// the wanted system and the money.

export const WORLD = { w: 2400, h: 1800 };

/** Fixed simulation step, in seconds. The world advances in these ticks. */
export const STEP = 1 / 60;

export const SAVE_KEY = 'sunfall-city-save-v1';

/**
 * The street plan. Avenues run north-south at the listed centre x positions,
 * streets run east-west at the listed centre y positions; both are roadW wide
 * with a sidewalkW pavement on each side. East of beachX the land gives way to
 * sand, then the boardwalk, then open water at waterX. The pier juts into the
 * water at pierY and ends at pierEndX.
 */
export const CITY = {
  roadW: 92,
  sidewalkW: 14,
  avenuesX: [170, 570, 970, 1370, 1770],
  streetsY: [170, 570, 970, 1370, 1640],
  beachX: 2030,
  waterX: 2268,
  boardwalkW: 46,
  pierY: 880,
  pierW: 44,
  pierEndX: 2372,
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 168,
  sprintSpeed: 268,
};

export const CAR = {
  radius: 21,
  accel: 340,
  brake: 520,
  reverseMax: 120,
  drag: 0.55,
  turnRate: 2.45,
  trafficSpeed: 235,
  copSpeed: 305,
};

/**
 * Wanted system. Heat is the raw score; every heatPerStar points of it light
 * one star. A crime only counts in full when somebody sees it (a pedestrian
 * or officer within witnessRadius), and heat cools at decayPerSec once the
 * player breaks line of sight. copCounts[stars] is how many patrol cars the
 * city sends out at that level.
 */
export const WANTED = {
  maxStars: 5,
  heatPerStar: 10,
  decayPerSec: 0.55,
  witnessRadius: 240,
  crimeHeat: { carjack: 10, assault: 10, shot: 6, collision: 4, rivalDown: 12 },
  bustRadius: 46,
  bustFillSec: 1.6,
  copCounts: [0, 1, 2, 3, 5, 7],
};

export const PRICES = {
  bustFinePerStar: 120,
  bustFineMin: 50,
  wastedBill: 150,
  missionRewards: [400, 650, 800, 1100, 1600],
};

/** Golden-hour palette: warm stucco, low sun, teal water. */
export const COLORS = {
  sky: '#f7b267',
  sun: '#ffd98e',
  water: '#2f7d99',
  waterDeep: '#256a85',
  waterShine: '#7fc4cf',
  sand: '#ecc987',
  sandWet: '#dfba72',
  boardwalk: '#a9805a',
  pier: '#96754e',
  road: '#4d4149',
  roadEdge: '#3c333b',
  lane: '#e8cf8f',
  sidewalk: '#c9ae8d',
  curb: '#b39876',
  block: '#97795a',
  plaza: '#d3b58c',
  parking: '#6b5a63',
  grove: '#7d9b57',
  grass: '#8aa860',
  palm: '#3e8e4f',
  palmTrunk: '#8a6844',
  lamp: '#5d4a3a',
  garage: '#e2703a',
  garageDoor: '#7a4a35',
  roof: '#8a4f3a',
  roofDark: '#74422f',
};

export const BUILDING_COLORS = [
  '#e8a87c', '#d98e6a', '#f0bc8a', '#c97b5a',
  '#e5c07f', '#dba06b', '#ef9d76', '#c98d64',
];

export const BUILDING_KINDS = ['shop', 'hotel', 'office', 'house', 'warehouse', 'cafe'];
