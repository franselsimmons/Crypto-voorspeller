# ARS-U Platform

Geautomatiseerde crypto-signaalservice: scant elke 15 minuten de ~150 meest liquide
Bitget USDT-perpetuals met de ARS-U-indicator, meet élke kwalificerende setup virtueel,
verifieert setupfamilies statistisch (bootstrap-LCB + FDR) en publiceert gecureerde
signalen naar Discord — met een publiek, hash-chained track record.

> **VIRTUAL · SHADOW · SIGNALS ONLY** — deze codebase bevat uitsluitend publieke
> marktdata-endpoints. Er bestaan geen orderfuncties, geen exchange-API-keys en geen
> handelsbevoegdheid. Signalen zijn informatie, geen financieel advies.

## Architectuur in één oogopslag
```text
universe (1×/u) ─┐
scan shard 0..4 ─┼→ finalize → signalen + hashketen → Discord (max 12/dag)
                 │                    │
monitor (15m) ───┼→ uitkomsten → families → bootstrap-LCB + BH-FDR → VERIFIED/LOST_EDGE
daily digest ────┘
Next.js-site: publiek track record · families · methodology · status · admin op /admin
```

## Vereisten
- GitHub-account · Vercel-account (**Pro aanbevolen**: crons per 15 min) · Upstash-account
- Discord-server met vier kanalen: #setups · #verified · #daily-digest · #status
- Node ≥ 18.17 lokaal (alleen voor `npm test`)

## Installatie — stap voor stap
1. **GitHub-repository maken.** Nieuwe (private) repo, bv. `ars-platform`.
2. **Bestanden uploaden.**
   ```bash
   git init && git add -A && git commit -m "ARS platform v1"
   git branch -M main
   git remote add origin git@github.com:<user>/ars-platform.git
   git push -u origin main
   ```
3. **Upstash Redis maken.** console.upstash.com → Create Database (regio EU) → kopieer
   `UPSTASH_REDIS_REST_URL` en `UPSTASH_REDIS_REST_TOKEN`.
4. **Vercel-project koppelen.** vercel.com → Add New → Project → importeer de repo.
   Framework Preset: **Next.js** (zie Troubleshooting als dit op "Other" stond).
5. **Environment variables instellen.** Alle variabelen uit `.env.example` in Vercel →
   Settings → Environment Variables. Secrets genereren:
   ```bash
   openssl rand -hex 32   # CRON_SECRET
   openssl rand -hex 32   # ADMIN_SECRET
   ```
   Billing-variabelen mogen leeg blijven (`BILLING_PROVIDER=none`).
6. **Discord-webhooks instellen.** Per kanaal: Kanaalinstellingen → Integraties →
   Webhooks → New Webhook → Copy URL → invullen als `DISCORD_*_WEBHOOK`.
7. **Deployen.** Deploy (of Redeploy na het zetten van de env-variabelen).
8. **Healthcheck uitvoeren.**
   ```bash
   curl https://<app>.vercel.app/api/public/status
   ```
   Verwacht: JSON. `health` mag vóór de eerste runs **DOWN** zijn — dat is normaal.
9. **Eerste universe-run.**
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<app>.vercel.app/api/cron/universe
   ```
   Verwacht: `{"status":"SUCCESS","processed":~150,...}`.
10. **Eerste scan.** Snelste route: `/admin` → Tools → **Run full scan** (alle shards +
    finalize). Handmatig kan ook: `GET /api/cron/scan?shard=0..4` en daarna
    `GET /api/cron/scan-finalize`, telkens met de Bearer-header.
11. **Collecting controleren.** `/families` toont 8× COLLECTING; homepage toont
    "DATA COLLECTION IN PROGRESS"; eerste publicaties in #setups dragen `COLLECTING n/30`.
12. **Website openen.** `/`, `/track-record`, `/methodology`, `/status`.
13. **Admin openen.** `/admin/login` → inloggen met `ADMIN_SECRET`.
14. **Cron controleren.** Vercel → Settings → Cron Jobs: 9 jobs zichtbaar. Na 15–20 min
    kleuren de runs op `/admin` groen. **Hobby-plan?** Vercel weigert 15-min-crons:
    verwijder het `crons`-blok uit `vercel.json` en laat een externe scheduler
    (bv. cron-job.org) dezelfde routes aanroepen met `?secret=<CRON_SECRET>`:
    ```text
    */15 * * * *  https://<app>.vercel.app/api/cron/scan?shard=0&secret=...   (t/m shard=4, op :01)
    4,19,34,49    https://<app>.vercel.app/api/cron/scan-finalize?secret=...
    6,21,36,51    https://<app>.vercel.app/api/cron/monitor?secret=...
    7 * * * *     https://<app>.vercel.app/api/cron/universe?secret=...
    6 0 * * *     https://<app>.vercel.app/api/cron/daily-digest?secret=...
    ```

## Beheer
- **/admin** — overview, scanner-cycli, signalen, open posities, familie-statistiek,
  Discord-log, read-only settings, tools (handmatige runs, exports). Handmatige runs
  gebruiken dezelfde locks en dedupe als de crons: nooit dubbele signalen.
- **Exports** — CSV met filters: `/api/public/export` · volledige JSON: `/api/admin/export`.

## Tests
```bash
npm test
```
Draait indicator-, timing-, outcome-, statistiek- en infra-tests. Pine-pariteit vereist
zelf te exporteren fixtures — protocol in `docs/PINE_NODE_PARITY.md`; zonder fixtures
slaat die suite netjes over.

## Troubleshooting
| Symptoom | Oorzaak → oplossing |
|---|---|
| Deploy-fout "No Output Directory named public" | Framework Preset stond op Other → Settings → Next.js (vercel.json v2 dwingt dit af) |
| 401 op cron-routes | Bearer-header of `?secret=` ontbreekt/verkeerd |
| Shardstatus `STALE_DATA` | Scan draaide te vroeg na candle-close; volgende cyclus herstelt vanzelf |
| Geen Discord-berichten | Webhook-env leeg/fout → `/admin/discord` toont statuscode per poging |
| `health: DOWN` | Nog geen finalize gedraaid (eerste kwartier) of crons staan uit |
| Cron geweigerd bij deploy | Hobby-plan → externe scheduler (stap 14) |

## Lancering van betaald abonnement
`COLLECTING_MODE=true` + `PAID_LAUNCH_ENABLED=false` is de veilige standaard: site,
waitlist en track record actief, geen betalingen. Betaald gaan = Stripe-product +
price aanmaken, de zes billing-variabelen vullen, webhook-endpoint
`/api/billing/webhook` registreren en `PAID_LAUNCH_ENABLED=true` zetten. **Harde
voorwaarde vooraf: juridische toets (MiCAR/AFM) van betaalde crypto-signalen aan
EU-klanten.** Dit platform neemt die toets niet weg.

## Documentatie
`docs/REDIS_SCHEMA.md` · `docs/PERFORMANCE_BUDGET.md` · `docs/INDICATOR_PARITY.md` ·
`docs/STATISTICAL_METHOD.md` · `docs/PINE_NODE_PARITY.md` · `PROJECT_STATE.md`
