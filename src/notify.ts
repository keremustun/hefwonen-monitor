import type { Listing } from "./scrape.ts";

export interface NotifyConfig {
  ntfyServer: string; // e.g. https://ntfy.sh
  topic: string;
}

interface NtfyMessage {
  title: string;
  message: string;
  priority: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
  click?: string;
}

export async function publish(cfg: NotifyConfig, msg: NtfyMessage): Promise<void> {
  // JSON publishing (POST to the server root) supports UTF-8 titles/emoji,
  // unlike header-based publishing.
  const res = await fetch(cfg.ntfyServer, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: cfg.topic, ...msg }),
  });
  if (!res.ok) throw new Error(`ntfy gaf HTTP ${res.status}: ${await res.text()}`);
}

export function describe(l: Listing): string {
  const parts = [
    `${l.postcode} ${l.city}`.trim(),
    l.rooms && `${l.rooms} kamers`,
    l.area,
    l.price && `${l.price} p.m.`,
    l.subtype || l.type,
  ].filter(Boolean);
  return parts.join(" · ");
}

export async function notifyListing(cfg: NotifyConfig, l: Listing, urgent: boolean): Promise<void> {
  const pc = l.postcode.replace(/\s+/g, "").slice(0, 4);
  await publish(cfg, {
    title: urgent ? `🚨 ${pc}: ${l.title}` : `Nieuwe woning: ${l.title}`,
    message: `${describe(l)}\n${l.url}`,
    priority: urgent ? 5 : 3,
    tags: urgent ? ["rotating_light", "house"] : ["house"],
    click: l.url,
  });
}
