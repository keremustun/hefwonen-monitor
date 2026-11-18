// Woning Alerts. Entry point for GitHub Actions (or any machine with Node 23.6+):
//   node src/main.ts [run|test-alarm|test-normal]
// State is kept in state.json next to this repo's root; the workflow commits it.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { diff, type State } from "./diff.ts";
import { notifyListing, publish, type NotifyConfig } from "./notify.ts";
import { getSources, type Source } from "./sources.ts";
import { isQuiet } from "./quiet.ts";

// No alarms (only normal notifications) in this window, Dutch time. "" = always alarm.
const quietHours = () => process.env.NACHTRUST ?? "23:00-07:30";

const STATE_FILE = new URL("../state.json", import.meta.url);
const DAY_MS = 24 * 3600 * 1000;
// A site only counts as "down" after this many failed checks in a row
// (~30 min at one check per 5 min). Single misses happen and are ignored.
const DOWN_AFTER = 6;
// Within one check: retry a failed fetch this many times before giving up.
const RETRIES = 2;
const RETRY_DELAY_MS = 5000;

interface SourceState {
  listings: State | null; // null = never checked yet
  lastWarning?: number;
  failStreak?: number; // failed checks in a row
}

async function fetchWithRetry(src: Source) {
  for (let attempt = 0; ; attempt++) {
    try {
      const all = await src.fetch();
      // Every site always lists something (also garages etc.), so 0 means a broken page.
      if (all.length === 0) throw new Error("0 aanbiedingen gevonden (site down of layout veranderd?)");
      return all;
    } catch (err) {
      if (attempt >= RETRIES) throw err;
      console.warn(`[${src.name}] Poging ${attempt + 1} mislukt, opnieuw over ${RETRY_DELAY_MS / 1000}s:`, String(err));
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

interface StateFile {
  sources: Record<string, SourceState>;
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
  if (!existsSync(STATE_FILE)) return { sources: {} };
  const raw = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  if (raw.sources) return raw as StateFile;
  // Old format (only Hefwonen): { listings, lastWarning, heartbeat }.
  return {
    sources: { hefwonen: { listings: raw.listings ?? null, lastWarning: raw.lastWarning } },
    heartbeat: raw.heartbeat,
  };
}

function saveState(s: StateFile): void {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");
}

async function checkSource(cfg: NotifyConfig, src: Source, st: SourceState, now: number): Promise<void> {
  const all = await fetchWithRetry(src);
  const homes = all.filter(src.relevant);

  if (!st.listings) {
    st.listings = diff({}, homes, now).state;
    console.log(`[${src.name}] Eerste run: ${homes.length} woningen opgeslagen, geen meldingen.`);
    return;
  }

  const { added, state, changed } = diff(st.listings, homes, now);
  const quiet = isQuiet(new Date(now), quietHours());
  for (const l of added) {
    // At night an alarm becomes a normal notification (no priority 5).
    const wantsAlarm = src.urgent(l);
    const urgent = wantsAlarm && !quiet;
    await notifyListing(cfg, src.name, l, urgent);
    const tag = urgent ? " -> ALARM" : wantsAlarm ? " -> melding (nachtrust, geen alarm)" : "";
    console.log(`[${src.name}] Nieuw: ${l.title} (${l.postcode || l.city})${tag}`);
  }
  // Only update after notifying, so a failed notification is retried next run.
  if (changed) st.listings = state;
  console.log(`[${src.name}] ${all.length} aanbiedingen, ${homes.length} relevant, ${added.length} nieuw.`);
}

async function main(): Promise<void> {
  const mode = process.argv[2] || "run";
  const cfg: NotifyConfig = {
    ntfyServer: env("NTFY_SERVER", false) || "https://ntfy.sh",
    topic: env("NTFY_TOPIC"),
  };

  if (mode === "test-alarm") {
    // One alarm per source, through the same code path as a real new listing.
    for (const src of getSources()) {
      await notifyListing(cfg, src.name, {
        slug: "test",
        title: "TEST (geen echte woning)",
        postcode: src.id === "hefwonen" ? "3085 AA" : "",
        city: src.id === "hefwonen" ? "Rotterdam" : "Barendrecht",
        type: "",
        subtype: "",
        status: "Testalarm",
        rooms: "3",
        area: "75 m²",
        price: "€ 1.000",
        url: src.url,
      }, true);
      console.log(`Testalarm ${src.name} verstuurd`);
    }
    return;
  }
  if (mode === "test-normal") {
    await publish(cfg, {
      title: "Test: nieuwe woning",
      message: "Dit is een gewone testmelding van Woning Alerts.",
      priority: 3,
      tags: ["house"],
    });
    return console.log("Testmelding verstuurd");
  }

  const now = Date.now();
  const file = loadState();

  // Sources are independent: one broken site must not block the others.
  for (const src of getSources()) {
    const st = (file.sources[src.id] ??= { listings: null });
    try {
      await checkSource(cfg, src, st, now);
      if (st.failStreak) console.log(`[${src.name}] Weer in orde na ${st.failStreak} mislukte check(s).`);
      delete st.failStreak;
    } catch (err) {
      const streak = (st.failStreak = (st.failStreak ?? 0) + 1);
      if (streak < DOWN_AFTER) {
        // Probably a one-off miss: log it, but keep the run green (no Healthchecks/ntfy alert).
        console.warn(`[${src.name}] Check mislukt (${streak}/${DOWN_AFTER} op rij, nog geen alarm):`, err);
        continue;
      }
      console.error(`[${src.name}] ${streak} checks op rij mislukt:`, err);
      process.exitCode = 1; // makes the workflow fail -> Healthchecks.io marks it down
      if (now - (st.lastWarning ?? 0) >= DAY_MS) {
        st.lastWarning = now;
        await publish(cfg, {
          title: `⚠️ Woning Alerts: probleem met ${src.name}`,
          message: `Al ${streak} checks op rij (±${streak * 5} min) mislukt: ${err instanceof Error ? err.message : err}`,
          priority: 3,
          tags: ["warning"],
          click: src.url,
        }).catch((e) => console.error("Waarschuwing versturen mislukt:", e));
      }
    }
  }

  file.heartbeat = new Date(now).toISOString().slice(0, 10);
  saveState(file);
}

await main();
