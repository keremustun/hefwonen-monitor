# Hefwonen-monitor

Checkt elke ~30 minuten https://huuraanbod.hefwonen.nl/huuraanbod op nieuwe woningen.
Het draait gratis op **GitHub Actions** in een privé repo, dus je pc hoeft niet aan.

- Nieuwe woning → een melding in de **ntfy**-app (topic staat in GitHub Secret `NTFY_TOPIC`)
- Nieuwe woning met postcode **3085** → een **dringend alarm** (ntfy-prioriteit 5)
- Garages, parkeerplaatsen en bedrijfsruimtes worden genegeerd
- Als de site stuk is of de layout verandert, krijg je maximaal 1× per dag een ⚠️-melding

## Hoe het werkt
- `.github/workflows/check.yml` draait `node src/main.ts` volgens de planning.
- `src/nuxt.ts` + `src/scrape.ts` lezen alle woningen uit het `window.__NUXT__`-blok van de
  pagina, ook die van pagina 2. Ze voeren de code van de site daarbij niet uit.
- `src/diff.ts` vergelijkt de woningen met `state.json`. Daarna commit de workflow de nieuwe `state.json`.

## Dingen aanpassen
- **Alarm-postcodes:** `POSTCODE_ALARM` in `.github/workflows/check.yml` (meerdere met komma's, bijv. `"3085,3086"`).
- **Frequentie:** `cron` in hetzelfde bestand. Let op: een privé repo heeft 2000 gratis minuten
  per maand en elke run telt als minimaal 1 minuut. `*/30` komt uit op ~1500 minuten per maand.
- **Handmatig testen:** ga op GitHub naar Actions → "Hefwonen check" → Run workflow en kies
  `test-alarm` of `test-normal`. Of in de terminal:
  `gh workflow run check.yml -f mode=test-alarm`

## Lokaal
`npm test` draait de tests op de opgeslagen pagina in `test/fixtures`.
`NTFY_TOPIC=... node src/main.ts` doet één echte check (Node 23.6 of nieuwer).
