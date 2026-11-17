import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseListings } from "../src/hefwonen.ts";
import { isHome, matchesAlarm } from "../src/diff.ts";
import { unescapeJs } from "../src/nuxt.ts";

const html = readFileSync("test/fixtures/huuraanbod.html", "utf8");
const all = parseListings(html);
const homes = all.filter(isHome);

describe("parseListings (fixture van 15-11-2026)", () => {
  test("vindt alle 22 woningen, net als de site ('22 woningen gevonden')", () => {
    expect(homes).toHaveLength(22);
  });

  test("elke woning heeft slug, titel, postcode en prijs", () => {
    for (const h of homes) {
      expect(h.slug).toMatch(/^[a-z0-9-]+$/);
      expect(h.title).not.toBe("");
      expect(h.postcode).toMatch(/^\d{4}\s?[A-Z]{2}$/);
      expect(h.price).toMatch(/^€/);
    }
  });

  test("parset een bekende woning correct", () => {
    expect(homes.find((h) => h.slug === "brasemstraat-54")).toMatchObject({
      title: "Brasemstraat 54",
      postcode: "3192 TD",
      city: "Hoogvliet Rotterdam",
      rooms: "4",
      area: "110 m²",
      price: "€ 1.229",
      url: "https://huuraanbod.hefwonen.nl/huuraanbod/brasemstraat-54",
    });
  });

  test("lost geminificeerde variabelen op (postcode via variabele)", () => {
    expect(homes.find((h) => h.slug === "briggemandreef-59")?.postcode).toBe("3235 DZ");
  });

  test("garage met postcode 3085 telt niet als woning (geen vals alarm)", () => {
    const garage = all.find((l) => l.slug === "langenhorst-15")!;
    expect(garage.postcode).toBe("3085 HD");
    expect(isHome(garage)).toBe(false);
  });

  test("3085-woningen worden herkend voor het alarm", () => {
    const alarm = homes.filter((h) => matchesAlarm(h, ["3085"])).map((h) => h.slug);
    expect(alarm.sort()).toEqual(["maldenburg-26", "schuilenburg-15"]);
  });
});

test("unescapeJs", () => {
  expect(unescapeJs(String.raw`https://x.nl/a`)).toBe("https://x.nl/a");
  expect(unescapeJs(String.raw`a\nb\"c`)).toBe('a\nb"c');
});
