// The sites Woning Alerts checks. To add a site: write a fetch/parse module
// and add an entry here. `id` is the key in state.json, so don't change it.
import type { Listing } from "./listing.ts";
import { fetchHefwonen, HEFWONEN_URL } from "./hefwonen.ts";
import { isHome, matchesAlarm } from "./diff.ts";
import { fetchVerwelius, inCities, isVerweliusHome, VERWELIUS_URL } from "./verwelius.ts";

export interface Source {
  id: string;
  name: string;
  url: string;
  /** All listings on the site (also ones we ignore); 0 means the scraper broke. */
  fetch: () => Promise<Listing[]>;
  /** Listings we keep track of and notify about. */
  relevant: (l: Listing) => boolean;
  /** Urgent alarm (ntfy priority 5) instead of a normal notification. */
  urgent: (l: Listing) => boolean;
}

const list = (v: string | undefined, fallback: string) =>
  (v?.trim() || fallback).split(",").map((s) => s.trim()).filter(Boolean);

export function getSources(env: NodeJS.ProcessEnv = process.env): Source[] {
  const alarmPostcodes = list(env.POSTCODE_ALARM, "3085");
  const verweliusCities = list(env.VERWELIUS_PLAATSEN, "Barendrecht");

  return [
    {
      id: "hefwonen",
      name: "Hefwonen",
      url: HEFWONEN_URL,
      fetch: fetchHefwonen,
      relevant: isHome,
      urgent: (l) => matchesAlarm(l, alarmPostcodes),
    },
    {
      id: "verwelius",
      name: "Verwelius",
      url: VERWELIUS_URL,
      fetch: fetchVerwelius,
      relevant: (l) => isVerweliusHome(l) && inCities(l, verweliusCities),
      // Only the chosen cities are tracked at all, so every hit is the real deal.
      urgent: () => true,
    },
  ];
}
