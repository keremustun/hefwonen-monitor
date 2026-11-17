import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseVerwelius } from "../src/verwelius.ts";
import { getSources } from "../src/sources.ts";

const html = readFileSync("test/fixtures/verwelius.html", "utf8");
const all = parseVerwelius(html);
const verwelius = getSources({}).find((s) => s.id === "verwelius")!;

describe("parseVerwelius (fixture van 17-11-2026)", () => {
  test("vindt alle 16 aanbiedingen, net als de filtertelling op de site", () => {
    expect(all).toHaveLength(16);
  });

  test("elke aanbieding heeft slug, titel, plaats en link", () => {
    for (const l of all) {
      expect(l.slug).toMatch(/^[a-z0-9-]+\/l\d+c\d+$/);
      expect(l.title).not.toBe("");
      expect(l.city).not.toBe("");
      expect(l.url).toBe(`https://huurportaal.verwelius.nl/${l.slug}`);
    }
  });

  test("parset een bekende woning correct", () => {
    expect(all.find((l) => l.slug === "ketelmeer-29/l197c16")).toMatchObject({
      title: "Ketelmeer 29",
      city: "Barendrecht",
      status: "Onder optie",
      rooms: "4",
      area: "109 m²",
      price: "€ 1350",
      available: "1-12-2026",
    });
  });

  test("alleen Barendrecht-woningen zijn relevant, en dan meteen alarm", () => {
    const relevant = all.filter(verwelius.relevant);
    expect(relevant.map((l) => l.title).sort()).toEqual(["Ketelmeer 29", "Ketelmeer 30"]);
    expect(relevant.every(verwelius.urgent)).toBe(true);
  });

  test("garages en parkeerplekken tellen nooit als woning", () => {
    const sources = getSources({ VERWELIUS_PLAATSEN: all.map((l) => l.city).join(",") });
    const v = sources.find((s) => s.id === "verwelius")!;
    const titles = all.filter(v.relevant).map((l) => l.title.toLowerCase());
    expect(titles.some((t) => t.includes("garage") || t.includes("parkeer"))).toBe(false);
    expect(titles.length).toBeGreaterThan(5);
  });
});
