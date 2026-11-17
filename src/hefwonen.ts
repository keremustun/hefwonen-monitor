import { parseNuxt, type NuxtBlob } from "./nuxt.ts";
import type { Listing } from "./listing.ts";

export const BASE_URL = "https://huuraanbod.hefwonen.nl";
export const HEFWONEN_URL = `${BASE_URL}/huuraanbod`;

// A value in the minified blob: a string literal, an identifier or a number.
const TOKEN = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[A-Za-z_$][\w$]*|-?\d+(?:\.\d+)?|!0|!1`;

// Listing objects look like `...media:[]},title:X,slug:Y,stage:`. The nested
// project object also has `title:..,slug:..,stage:` but is preceded by `id:`,
// so requiring `}` right before `,title:` selects only the listings.
const LISTING_START = new RegExp(String.raw`\},title:(${TOKEN}),slug:(${TOKEN}),stage:`, "g");
const STATUS = new RegExp(String.raw`status:\{label:(${TOKEN})`);
const PRICE = new RegExp(String.raw`handover:\{price:(${TOKEN}),price_formatted:(${TOKEN})`);
const ROOMS = new RegExp(String.raw`number_of_rooms:(${TOKEN})`);
const AREA = new RegExp(String.raw`living_area_formatted:(${TOKEN})`);
const TYPE = new RegExp(String.raw`characteristic:\{type:(${TOKEN}),subtype:(${TOKEN})`);
// Key order inside `address:{...}` varies per listing, so read fields by key.
const ADDRESS_BLOCK = /address:\{([^{}]*)\}/;
const field = (block: string, key: string) =>
  block.match(new RegExp(String.raw`(?:^|,)${key}:(${TOKEN})`))?.[1];

export function parseListings(html: string): Listing[] {
  const nuxt = parseNuxt(html);
  const { body } = nuxt;
  const str = (token: string | undefined) => asString(nuxt, token);

  const starts = [...body.matchAll(LISTING_START)];
  const seen = new Set<string>();
  const listings: Listing[] = [];

  starts.forEach((m, idx) => {
    const segEnd = idx + 1 < starts.length ? starts[idx + 1].index! : body.length;
    const seg = body.slice(m.index!, segEnd);
    const slug = str(m[2]);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const addr = seg.match(ADDRESS_BLOCK)?.[1] ?? "";
    const type = seg.match(TYPE);
    listings.push({
      slug,
      title: str(m[1]),
      postcode: str(field(addr, "postal_code")),
      city: str(field(addr, "location")),
      type: str(type?.[1]),
      subtype: str(type?.[2]),
      status: str(seg.match(STATUS)?.[1]),
      rooms: str(seg.match(ROOMS)?.[1]),
      area: str(seg.match(AREA)?.[1]),
      price: str(seg.match(PRICE)?.[2]),
      url: `${HEFWONEN_URL}/${slug}`,
    });
  });

  return listings;
}

function asString(nuxt: NuxtBlob, token: string | undefined): string {
  if (token === undefined) return "";
  const v = nuxt.resolve(token);
  return v === null || v === undefined ? "" : String(v);
}

export async function fetchHefwonen(): Promise<Listing[]> {
  const res = await fetch(HEFWONEN_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "Accept-Language": "nl-NL,nl;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`Hefwonen gaf HTTP ${res.status}`);
  return parseListings(await res.text());
}
