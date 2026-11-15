import { describe, expect, test } from "vitest";
import { diff, PRUNE_MS, REAPPEAR_MS } from "../src/diff.ts";
import type { Listing } from "../src/scrape.ts";

const L = (slug: string): Listing => ({
  slug, title: slug, postcode: "3085 AB", city: "Rotterdam", type: "huis", subtype: "",
  status: "", rooms: "3", area: "70 m²", price: "€ 1.000", url: `https://x/${slug}`,
});

describe("diff", () => {
  const t0 = 1_000_000_000_000;

  test("nieuwe slug wordt gemeld", () => {
    const { state } = diff({}, [L("a")], t0);
    const r = diff(state, [L("a"), L("b")], t0 + 300_000);
    expect(r.added.map((l) => l.slug)).toEqual(["b"]);
    expect(r.changed).toBe(true);
  });

  test("geen verandering = niets melden en niet schrijven", () => {
    const { state } = diff({}, [L("a"), L("b")], t0);
    const r = diff(state, [L("b"), L("a")], t0 + 300_000);
    expect(r.added).toEqual([]);
    expect(r.changed).toBe(false);
  });

  test("verdwenen woning wordt niet gemeld maar wel gemarkeerd", () => {
    const { state } = diff({}, [L("a"), L("b")], t0);
    const r = diff(state, [L("a")], t0 + 1);
    expect(r.added).toEqual([]);
    expect(r.state.b.goneAt).toBe(t0 + 1);
  });

  test("woning die kort weg was en terugkomt geeft geen alarm", () => {
    const s1 = diff({}, [L("a")], t0).state;
    const s2 = diff(s1, [], t0 + 1).state;
    const r = diff(s2, [L("a")], t0 + 3600_000);
    expect(r.added).toEqual([]);
    expect(r.state.a.goneAt).toBeUndefined();
  });

  test("woning die lang weg was en opnieuw verschijnt wordt weer gemeld", () => {
    const s1 = diff({}, [L("a")], t0).state;
    const s2 = diff(s1, [], t0 + 1).state;
    const r = diff(s2, [L("a")], t0 + REAPPEAR_MS + 10);
    expect(r.added.map((l) => l.slug)).toEqual(["a"]);
  });

  test("oude verdwenen woningen worden opgeruimd", () => {
    const s1 = diff({}, [L("a")], t0).state;
    const s2 = diff(s1, [], t0 + 1).state;
    const r = diff(s2, [], t0 + PRUNE_MS + 10);
    expect(r.state).toEqual({});
  });
});
