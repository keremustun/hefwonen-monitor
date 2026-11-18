// Verwelius huurportaal: plain server-rendered HTML, all listings on one page.
// Each listing is a `<div class="item lijst">` card; parking spots have an
// extra class (`item lijst parkeerplaats`), which we keep as the type.
import { containsNonHome, type Listing } from "./listing.ts";

export const VERWELIUS_URL = "https://huurportaal.verwelius.nl/aanbod-huurportaal";

const CARD_START = /<div class="item lijst([^"]*)">/;

function text(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<sup>2<\/sup>/g, "²")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&euro;/g, "€")
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const grab = (card: string, re: RegExp) => text(card.match(re)?.[1]);

export function parseVerwelius(html: string): Listing[] {
  const listings: Listing[] = [];
  const seen = new Set<string>();

  // split() with a capture group yields [before, class1, card1, class2, card2, ...].
  const parts = html.split(CARD_START);
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const extraClass = parts[i].trim();
    const card = parts[i + 1];
    const url = card.match(/<a href="([^"]+)" class="link"/)?.[1] ?? "";
    // https://huurportaal.verwelius.nl/ketelmeer-29/l197c16 -> ketelmeer-29/l197c16
    const slug = url.replace(/^https?:\/\/[^/]+\//, "").replace(/\/$/, "");
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    listings.push({
      slug,
      title: grab(card, /<div class="boven">\s*<h3>([\s\S]*?)<\/h3>/),
      postcode: "",
      city: grab(card, /<span class="plaats">([\s\S]*?)<\/span>/),
      type: extraClass,
      subtype: "",
      status: grab(card, /<span class="label">([\s\S]*?)<\/span>/),
      rooms: grab(card, /<span class="kamers">[\s\S]*?Kamers\s*([\s\S]*?)<\/span>/),
      area: grab(card, /<span class="woonopp">[\s\S]*?Woonopp\.\s*([\s\S]*?)<\/span>/),
      price: grab(card, /<div class="onder">\s*<h3>([\s\S]*?)\s*Per maand/i),
      available: grab(card, /<span class="beschikbaar">([\s\S]*?)<\/span>/),
      url,
    });
  }
  return listings;
}

export function isVerweliusHome(l: Listing): boolean {
  return !containsNonHome(`${l.title} ${l.type}`);
}

export function inCities(l: Listing, cities: string[]): boolean {
  const c = l.city.trim().toLowerCase();
  return cities.some((x) => x.trim().toLowerCase() === c);
}

export async function fetchVerwelius(): Promise<Listing[]> {
  const res = await fetch(VERWELIUS_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "Accept-Language": "nl-NL,nl;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`Verwelius gaf HTTP ${res.status}`);
  const html = await res.text();
  const listings = parseVerwelius(html);
  if (listings.length === 0) {
    // The site sometimes returns an empty page; log what it was, for diagnosis.
    const title = text(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
    throw new Error(`0 aanbiedingen op Verwelius (pagina ${html.length} tekens, titel "${title}")`);
  }
  return listings;
}
