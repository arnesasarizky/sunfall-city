// Career persistence: cash earned, how far the mission chain has progressed,
// and the best cash total Juno has ever held. Stored in localStorage; if that
// is unavailable (private windows, blocked storage) an in-memory copy keeps
// the game working for the session.

import { SAVE_KEY } from './config.js';

const DEFAULTS = { cash: 0, missionIndex: 0, best: 0 };
let memory = { ...DEFAULTS };

function clean(value) {
  const cash = Math.max(0, Math.floor(Number(value?.cash) || 0));
  const missionIndex = Math.max(0, Math.floor(Number(value?.missionIndex) || 0));
  const best = Math.max(0, Math.floor(Number(value?.best) || 0));
  return { cash, missionIndex, best: Math.max(best, cash) };
}

/** The stored career, or a fresh one when nothing was ever saved. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) memory = clean(JSON.parse(raw));
  } catch {
    // Storage unreadable: fall through with the in-memory copy.
  }
  return { ...memory };
}

/**
 * Store the career. Numbers are floored and clamped at zero, and `best` only
 * ever grows. Returns the object actually stored.
 */
export function storeSave(save) {
  const next = clean({ ...memory, ...save });
  next.best = Math.max(memory.best, next.best);
  memory = next;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(memory));
  } catch {
    // Storage unwritable: the in-memory copy above still holds it.
  }
  return { ...memory };
}

/** Wipe the career back to a fresh start. */
export function clearSave() {
  memory = { ...DEFAULTS };
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to remove if storage is unavailable.
  }
  return { ...memory };
}
