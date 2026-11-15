// Entry point for GitHub Actions (or any machine with Node 23.6+):
//   node src/main.ts [run|test-alarm|test-normal]
// State is kept in state.json next to this repo's root; the workflow commits it.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fetchListings, OVERVIEW_URL, type Listing } from "./scrape.ts";
import { diff, isHome, matchesAlarm, type State } from "./diff.ts";
import { notifyListing, publish, type NotifyConfig } from "./notify.ts";

const STATE_FILE = new URL("../state.json", import.meta.url);
const DAY_MS = 24 * 3600 * 1000;

interface StateFile {
  listings: State | null;
  lastWarning?: number;
  // Updated once a day so the repo has activity; GitHub disables scheduled
  // workflows in repos without activity for 60 days.
  heartbeat?: string;
}

function env(name: string, required = true): string {
  const v = process.env[name]?.trim() ?? "";
  if (required && !v) throw new Error(`Omgevingsvariabele ${name} ontbreekt`);
  return v;
}

function loadState(): StateFile {
  if (!existsSync(STATE_FILE)) return { listings: null };
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as StateFile;
}

function saveState(s: StateFile): void {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");
}

async function run(cfg: NotifyConfig, file: StateFile, now: number): Promise<void> {
  const homes: Listing[] = (await fetchListings()).filter(isHome);

  if (!file.listings) {
    file.listings = diff({}, homes, now).state;
    console.log(`Eerste run: ${homes.length} woningen opgeslagen, geen meldingen.`);
    return;
  }

  if (homes.length === 0 && Object.values(file.listings).some((e) => e.goneAt === undefined)) {
    throw new Error("0 woningen gevonden terwijl er eerder wel woningen waren (site down of layout veranderd?)");
  }

  const { added, state, changed } = diff(file.listings, homes, now);
  const prefixes = (env("POSTCODE_ALARM", false) || "3085").split(",").map((s) => s.trim()).filter(Boolean);

  for (const l of added) {
    const urgent = matchesAlarm(l, prefixes);
    await notifyListing(cfg, l, urgent);
    console.log(`Nieuw: ${l.title} (${l.postcode})${urgent ? " -> ALARM" : ""}`);
  }
  // Only update after notifying, so a failed notification is retried next run.
  if (changed) file.listings = state;
  console.log(`${homes.length} woningen, ${added.length} nieuw.`);
}

async function main(): Promise<void> {
  const mode = process.argv[2] || "run";
  const cfg: NotifyConfig = {
    ntfyServer: env("NTFY_SERVER", false) || "https://ntfy.sh",
    topic: env("NTFY_TOPIC"),
  };

  if (mode === "test-alarm") {
    await publish(cfg, {
      title: "🚨 TEST 3085: dit is een testalarm",
      message: "Als je dit hoort/ziet werkt het dringende alarm.",
      priority: 5,
      tags: ["rotating_light"],
      click: OVERVIEW_URL,
    });
    return console.log("Testalarm verstuurd");
  }
  if (mode === "test-normal") {
    await publish(cfg, {
      title: "Test: nieuwe woning",
      message: "Dit is een gewone testmelding (zonder mail).",
      priority: 3,
      tags: ["house"],
      click: OVERVIEW_URL,
    });
    return console.log("Testmelding verstuurd");
  }

  const now = Date.now();
  const file = loadState();
  try {
    await run(cfg, file, now);
  } catch (err) {
    console.error(err);
    if (now - (file.lastWarning ?? 0) >= DAY_MS) {
      file.lastWarning = now;
      await publish(cfg, {
        title: "⚠️ Hefwonen-monitor heeft een probleem",
        message: String(err instanceof Error ? err.message : err),
        priority: 3,
        tags: ["warning"],
      }).catch((e) => console.error("Waarschuwing versturen mislukt:", e));
    }
    process.exitCode = 1;
  }
  file.heartbeat = new Date(now).toISOString().slice(0, 10);
  saveState(file);
}

await main();
