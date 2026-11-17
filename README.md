# Hefwonen-monitor

Checkt elke ~5 minuten https://huuraanbod.hefwonen.nl/huuraanbod op nieuwe woningen.
Het draait gratis op **GitHub Actions** in een openbare repo (onbeperkt gratis), dus je pc hoeft niet aan.

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
- **Frequentie:** `cron` in hetzelfde bestand. Wordt de repo ooit privé: dan heb je 2000 gratis minuten
  per maand en telt elke run als minimaal 1 minuut, dus zet de cron dan op `*/30`.
- **Handmatig testen:** ga op GitHub naar Actions → "Hefwonen check" → Run workflow en kies
  `test-alarm` of `test-normal`. Of in de terminal:
  `gh workflow run check.yml -f mode=test-alarm`

## Lokaal
`npm test` draait de tests op de opgeslagen pagina in `test/fixtures`.
`NTFY_TOPIC=... node src/main.ts` doet één echte check (Node 23.6 of nieuwer).

## Trigger (Cloudflare)
De ingebouwde planning van GitHub is erg onbetrouwbaar: soms zitten er uren tussen runs. Daarom
start een kleine Cloudflare Worker (`trigger/worker.js`) de workflow **elke 5 minuten** via de
GitHub API. Die gebruikt het geheime `GH_TOKEN`, een fine-grained token dat alleen Actions op
deze repo mag starten. De `schedule` in de workflow blijft staan als reserve.
- Opnieuw deployen: `cd trigger && npx wrangler@4.162.0 deploy`
- Token vervangen (bijv. als hij verloopt): `cd trigger && npx wrangler@4.162.0 secret put GH_TOKEN`
