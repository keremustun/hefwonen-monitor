// One listing on a rental site, normalized across sources. Fields a site
// doesn't show are "".
export interface Listing {
  slug: string; // unique per source, used as key in state.json
  title: string;
  postcode: string;
  city: string;
  type: string;
  subtype: string;
  status: string;
  rooms: string;
  area: string;
  price: string;
  available?: string; // e.g. "1-12-2026"
  url: string;
}

// Words in a type or title that mean it's not a home (shops, garages, parking spots).
const NON_HOME = ["bedrijf", "winkel", "parkeer", "garage", "berging", "kantoor"];

export function containsNonHome(text: string): boolean {
  const t = text.toLowerCase();
  return NON_HOME.some((w) => t.includes(w));
}
