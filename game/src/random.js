// A small seeded random generator (mulberry32). The whole city and every
// scripted scene derive from one of these, so a given seed always produces
// the same Sunfall City.

export function createRandom(seed) {
  let state = (seed >>> 0) || 1;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    seed: seed >>> 0,
    next,
    /** Float in [a, b). */
    range(a, b) {
      return a + next() * (b - a);
    },
    /** Integer in [a, b], both ends included. */
    int(a, b) {
      return a + Math.floor(next() * (b - a + 1));
    },
    pick(array) {
      return array[Math.floor(next() * array.length)];
    },
    chance(p) {
      return next() < p;
    },
  };
}
