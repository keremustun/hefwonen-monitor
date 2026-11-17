// Woning Alerts. Entry point for GitHub Actions (or any machine with Node 23.6+):
//   node src/main.ts [run|test-alarm|test-normal]
// State is kept in state.json next to this repo's root; the workflow commits it.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { diff, type State } from "./diff.ts";
import { notifyListing, publish, type NotifyConfig } from "./notify.ts";
import { getSources, type Source } from "./sources.ts";

const STATE_FILE = new URL("../state.json", import.meta.url);
const DAY_MS = 24 * 3600 * 1000;

interface SourceState {
  listings: State | null; // null = never checked yet
  lastWarning?: number;
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
  const all = await src.fetch();
  // Every site always lists something (also garages etc.), so 0 means a broken scraper.
  if (all.length === 0) throw new Error("0 aanbiedingen gevonden (site down of layout veranderd?)");
  const homes = all.filter(src.relevant);

  if (!st.listings) {
    st.listings = diff({}, homes, now).state;
    console.log(`[${src.name}] Eerste run: ${homes.length} woningen opgeslagen, geen meldingen.`);
    return;
  }

  const { added, state, changed } = diff(st.listings, homes, now);
  for (const l of added) {
    const urgent = src.urgent(l);
    await notifyListing(cfg, src.name, l, urgent);
    console.log(`[${src.name}] Nieuw: ${l.title} (${l.postcode || l.city})${urgent ? " -> ALARM" : ""}`);
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
    } catch (err) {
      console.error(`[${src.name}]`, err);
      process.exitCode = 1;
      if (now - (st.lastWarning ?? 0) >= DAY_MS) {
        st.lastWarning = now;
        await publish(cfg, {
          title: `⚠️ Woning Alerts: probleem met ${src.name}`,
          message: String(err instanceof Error ? err.message : err),
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
