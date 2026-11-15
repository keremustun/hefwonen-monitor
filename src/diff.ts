import type { Listing } from "./scrape.ts";

// Types on the site that are not homes (shops, garages, parking spots).
const NON_HOME = ["bedrijf", "winkel", "parkeer", "garage", "berging", "kantoor"];

export function isHome(l: Listing): boolean {
  const t = `${l.type} ${l.subtype}`.toLowerCase();
  return !NON_HOME.some((w) => t.includes(w));
}

export function normalizePostcode(pc: string): string {
  return pc.replace(/\s+/g, "").toUpperCase();
}

export function matchesAlarm(l: Listing, prefixes: string[]): boolean {
  const pc = normalizePostcode(l.postcode);
  return prefixes.some((p) => p && pc.startsWith(normalizePostcode(p)));
}

/**
 * Stored state: slug -> entry. `goneAt` is set when a listing disappears from
 * the site. A listing that reappears within REAPPEAR_MS is not "new" (avoids
 * false alarms when the site briefly drops one); after that it is treated as
 * a fresh listing again (e.g. the same address is offered again later).
 */
export interface Entry {
  title: string;
  firstSeen: number;
  goneAt?: number;
}
export type State = Record<string, Entry>;

export const REAPPEAR_MS = 7 * 24 * 3600 * 1000;
export const PRUNE_MS = 30 * 24 * 3600 * 1000;

export interface DiffResult {
  added: Listing[];
  state: State;
  changed: boolean;
}

export function diff(prev: State, current: Listing[], now: number): DiffResult {
  const state: State = {};
  const added: Listing[] = [];
  let changed = false;
  const currentSlugs = new Set(current.map((l) => l.slug));

  for (const l of current) {
    const old = prev[l.slug];
    if (!old || (old.goneAt !== undefined && now - old.goneAt > REAPPEAR_MS)) {
      added.push(l);
      state[l.slug] = { title: l.title, firstSeen: now };
      changed = true;
    } else {
      if (old.goneAt !== undefined) changed = true; // came back: clear goneAt
      state[l.slug] = { title: old.title, firstSeen: old.firstSeen };
    }
  }

  for (const [slug, e] of Object.entries(prev)) {
    if (currentSlugs.has(slug)) continue;
    if (e.goneAt === undefined) {
      state[slug] = { ...e, goneAt: now };
      changed = true;
    } else if (now - e.goneAt <= PRUNE_MS) {
      state[slug] = e;
    } else {
      changed = true; // pruned
    }
  }

  return { added, state, changed };
}
