# Woning Alerts

Checkt elke ~5 minuten deze huursites op nieuwe woningen:

| Site | Wat je krijgt |
|---|---|
| [Hefwonen](https://huuraanbod.hefwonen.nl/huuraanbod) | Elke nieuwe woning een melding; postcode **3085** = **dringend alarm** (ntfy-prioriteit 5) |
| [Verwelius](https://huurportaal.verwelius.nl/aanbod-huurportaal) | Alleen woningen in **Barendrecht**, en die zijn meteen een **dringend alarm** |
Het draait gratis op **GitHub Actions** in een openbare repo (onbeperkt gratis), dus je pc hoeft niet aan.

- **Nachtrust:** tussen 23:00 en 07:30 (Nederlandse tijd) wordt een alarm een gewone melding, zodat je niet gewekt wordt
- Meldingen komen in de **ntfy**-app (topic staat in GitHub Secret `NTFY_TOPIC`)
- Garages, parkeerplaatsen en bedrijfsruimtes worden genegeerd
- Losse missers worden genegeerd: bij een fout probeert de app het meteen nog 2× opnieuw, en pas als een site
  **6 checks op rij (±30 min)** mislukt, telt hij als down. Dan faalt de run (Healthchecks.io meldt down) en krijg je
  per site maximaal 1× per dag een ⚠️-melding. Een kapotte site houdt de andere niet tegen.

## Hoe het werkt
- `.github/workflows/check.yml` draait `node src/main.ts` volgens de planning.
- `src/sources.ts` is de lijst met sites, met per site welke woningen tellen en wat een alarm is.
- `src/hefwonen.ts` + `src/nuxt.ts` lezen alle woningen uit het `window.__NUXT__`-blok van de
  Hefwonen-pagina, ook die van pagina 2. Ze voeren de code van de site daarbij niet uit.
- `src/verwelius.ts` leest de woningkaartjes uit de (gewone) HTML van Verwelius.
- `src/diff.ts` vergelijkt de woningen per site met `state.json`. Daarna commit de workflow de nieuwe `state.json`.

## Dingen aanpassen
- **Alarm-postcodes Hefwonen:** `POSTCODE_ALARM` in `.github/workflows/check.yml` (meerdere met komma's, bijv. `"3085,3086"`).
- **Nachtrust:** `NACHTRUST` in `.github/workflows/check.yml` (bijv. `"22:30-08:00"`, of `""` voor altijd alarm).
- **Plaatsen Verwelius:** `VERWELIUS_PLAATSEN` in hetzelfde bestand (bijv. `"Barendrecht,Ridderkerk"`).
- **Nieuwe site toevoegen:** schrijf een bestand zoals `src/verwelius.ts` en zet het in `src/sources.ts`.
  De eerste run van een nieuwe site slaat alleen op wat er al staat, zonder meldingen.
- **Frequentie:** `cron` in hetzelfde bestand. Wordt de repo ooit privé: dan heb je 2000 gratis minuten
  per maand en telt elke run als minimaal 1 minuut, dus zet de cron dan op `*/30`.
- **Handmatig testen:** ga op GitHub naar Actions → "Woning Alerts" → Run workflow en kies
  `test-alarm` of `test-normal`. Of in de terminal:
  `gh workflow run check.yml -f mode=test-alarm`

## Lokaal
`npm test` draait de tests op de opgeslagen pagina's in `test/fixtures`.
`NTFY_TOPIC=... node src/main.ts` doet één echte check (Node 23.6 of nieuwer).

## Trigger (Cloudflare)
De ingebouwde planning van GitHub is erg onbetrouwbaar: soms zitten er uren tussen runs. Daarom
start een kleine Cloudflare Worker (`trigger/worker.js`) de workflow **elke 5 minuten** via de
GitHub API. Die gebruikt het geheime `GH_TOKEN`, een fine-grained token dat alleen Actions op
deze repo mag starten. De `schedule` in de workflow blijft staan als reserve.
- Opnieuw deployen: `cd trigger && npx wrangler@4.162.0 deploy`
- Token vervangen (bijv. als hij verloopt): `cd trigger && npx wrangler@4.162.0 secret put GH_TOKEN`
