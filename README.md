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

- GitHub-account
- Vercel-account (**Pro aanbevolen**: crons per 15 minuten)
- Upstash-account of bestaande Vercel KV/Upstash Redis-integratie
- Discord-server met vier kanalen:
  - `#setups`
  - `#verified`
  - `#daily-digest`
  - `#status`
- Node ≥ 18.17 lokaal, alleen nodig voor `npm test`

## Redis environment variables

Het systeem ondersteunt beide Redis-naamsets.

### Nieuwe Upstash-naamgeving

```env
UPSTASH_REDIS_REST_URL=https://<database>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<redis-rest-token>
```

### Bestaande Vercel KV-naamgeving

```env
KV_REST_API_URL=https://<database>.upstash.io
KV_REST_API_TOKEN=<redis-rest-token>
```

Je hoeft niet beide sets toe te voegen.

Het systeem gebruikt automatisch deze volgorde:

```text
1. UPSTASH_REDIS_REST_URL
2. KV_REST_API_URL

1. UPSTASH_REDIS_REST_TOKEN
2. KV_REST_API_TOKEN
```

Wanneer een bestaande Vercel KV-integratie al deze variabelen bevat:

```env
KV_REST_API_URL
KV_REST_API_TOKEN
```

hoef je de verborgen waarden niet opnieuw op te zoeken. De bestaande variabelen
worden automatisch als fallback gebruikt.

Gebruik niet de read-only token:

```env
KV_REST_API_READ_ONLY_TOKEN
```

Het platform schrijft scannerstatus, virtuele posities, resultaten,
familie-statistieken en publicatiedata naar Redis en heeft daarom een schrijftoken nodig.

## Installatie — stap voor stap

### 1. GitHub-repository maken

Maak een nieuwe private repository, bijvoorbeeld:

```text
ars-platform
```

Upload daarna de bestanden:

```bash
git init
git add -A
git commit -m "ARS platform v1"
git branch -M main
git remote add origin git@github.com:<user>/ars-platform.git
git push -u origin main
```

### 2. Redis controleren of aanmaken

#### Optie A — bestaande Vercel KV/Upstash-integratie

Ga naar:

```text
Vercel
→ Project
→ Settings
→ Environment Variables
```

Controleer of deze variabelen bestaan:

```env
KV_REST_API_URL
KV_REST_API_TOKEN
```

Wanneer beide aanwezig zijn, is Redis al gekoppeld en hoef je geen nieuwe waarden
toe te voegen.

Het is niet nodig dat de geheime waarden zichtbaar zijn. Vercel kan gevoelige
environment variables verborgen tonen; het systeem leest ze tijdens runtime.

#### Optie B — nieuwe Upstash Redis-database

Ga naar:

```text
Upstash Console
→ Create Database
→ kies bij voorkeur een EU-regio
```

Kopieer daarna:

```env
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Voeg deze toe in:

```text
Vercel
→ Project
→ Settings
→ Environment Variables
```

Gebruik de normale Redis REST-token en niet de read-only token.

### 3. Vercel-project koppelen

Ga naar:

```text
Vercel
→ Add New
→ Project
→ importeer de GitHub-repository
```

Gebruik:

```text
Framework Preset: Next.js
```

Zie Troubleshooting wanneer het framework eerder op `Other` stond.

### 4. Environment variables instellen

Voeg alle benodigde variabelen uit `.env.example` toe via:

```text
Vercel
→ Project
→ Settings
→ Environment Variables
```

Voor Redis is één van deze combinaties voldoende:

```env
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

of:

```env
KV_REST_API_URL
KV_REST_API_TOKEN
```

Secrets genereren:

```bash
openssl rand -hex 32
```

Gebruik één gegenereerde waarde voor:

```env
CRON_SECRET
```

Genereer daarna een nieuwe, andere waarde voor:

```env
ADMIN_SECRET
```

Billing-variabelen mogen tijdens de dataverzamelingsfase leeg blijven:

```env
BILLING_PROVIDER=none
```

### 5. Discord-webhooks instellen

Maak per Discord-kanaal een webhook:

```text
Kanaalinstellingen
→ Integraties
→ Webhooks
→ New Webhook
→ Copy Webhook URL
```

Vul de URL's in bij de bijbehorende environment variables:

```env
DISCORD_SETUPS_WEBHOOK=
DISCORD_VERIFIED_WEBHOOK=
DISCORD_DAILY_DIGEST_WEBHOOK=
DISCORD_STATUS_WEBHOOK=
```

Gebruik de exacte namen uit `.env.example` wanneer die afwijken.

### 6. Deployen

Start de eerste deployment.

Wanneer environment variables pas na de eerste deployment zijn toegevoegd of gewijzigd:

```text
Vercel
→ Deployments
→ nieuwste deployment
→ ⋯
→ Redeploy
```

Environment-variablewijzigingen worden pas actief in een nieuwe deployment.

### 7. Healthcheck uitvoeren

```bash
curl https://<app>.vercel.app/api/public/status
```

Verwacht:

```json
{
  "health": "DOWN"
}
```

of:

```json
{
  "health": "UP"
}
```

`health: DOWN` mag vóór de eerste universe-, scan- en finalize-runs normaal zijn.

### 8. Eerste universe-run

```bash
curl \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://<app>.vercel.app/api/cron/universe
```

Verwacht ongeveer:

```json
{
  "status": "SUCCESS",
  "processed": 150
}
```

Het exacte aantal kan variëren door volume-, markt- en Bitget-filters.

### 9. Eerste volledige scan

Snelste route:

```text
/admin
→ Tools
→ Run full scan
```

Hiermee worden alle scan-shards uitgevoerd en daarna `scan-finalize`.

Handmatig kan ook.

Voer eerst shard `0` tot en met `4` uit:

```bash
curl \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://<app>.vercel.app/api/cron/scan?shard=0"
```

Herhaal voor:

```text
shard=1
shard=2
shard=3
shard=4
```

Voer daarna finalize uit:

```bash
curl \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://<app>.vercel.app/api/cron/scan-finalize
```

### 10. Collecting controleren

Open:

```text
/families
```

Verwacht tijdens de startfase:

```text
8× COLLECTING
```

De homepage toont:

```text
DATA COLLECTION IN PROGRESS
```

Eerste publicaties in `#setups` dragen bijvoorbeeld:

```text
COLLECTING 1/30
```

De teller loopt op terwijl kwalificerende virtuele setups worden gemeten.

### 11. Website controleren

Open:

```text
/
```

Daarna:

```text
/track-record
/methodology
/status
```

### 12. Admin openen

Ga naar:

```text
/admin/login
```

Log in met de waarde van:

```env
ADMIN_SECRET
```

### 13. Cron Jobs controleren

Ga naar:

```text
Vercel
→ Project
→ Settings
→ Cron Jobs
```

Er horen negen cronjobs zichtbaar te zijn.

Na ongeveer 15–20 minuten horen de eerste runs zichtbaar te worden op:

```text
/admin
```

### 14. Vercel Hobby-plan

Het Hobby-plan kan frequente cronjobs weigeren.

Wanneer Vercel de 15-minutencrons weigert:

1. Verwijder het `crons`-blok uit `vercel.json`.
2. Gebruik een externe scheduler, bijvoorbeeld `cron-job.org`.
3. Laat dezelfde API-routes extern uitvoeren.
4. Geef `CRON_SECRET` mee als queryparameter.

Voorbeeld:

```text
*/15 * * * *
https://<app>.vercel.app/api/cron/scan?shard=0&secret=<CRON_SECRET>
```

Herhaal dit voor shard `1` tot en met `4`.

Finalize:

```text
4,19,34,49 * * * *
https://<app>.vercel.app/api/cron/scan-finalize?secret=<CRON_SECRET>
```

Monitor:

```text
6,21,36,51 * * * *
https://<app>.vercel.app/api/cron/monitor?secret=<CRON_SECRET>
```

Universe:

```text
7 * * * *
https://<app>.vercel.app/api/cron/universe?secret=<CRON_SECRET>
```

Daily digest:

```text
6 0 * * *
https://<app>.vercel.app/api/cron/daily-digest?secret=<CRON_SECRET>
```

## Beheer

### `/admin`

Bevat:

- platformoverzicht;
- scanner-cycli;
- signalen;
- open virtuele posities;
- familie-statistiek;
- Discord-log;
- read-only instellingen;
- handmatige tools;
- exports.

Handmatige runs gebruiken dezelfde locks en dedupe-logica als automatische crons.

Daardoor horen handmatige en automatische runs geen dubbele signalen te publiceren.

### Exports

CSV-export:

```text
/api/public/export
```

Volledige admin-JSON-export:

```text
/api/admin/export
```

## Tests

```bash
npm test
```

De tests bevatten onder andere:

- indicatorlogica;
- timing;
- outcomes;
- statistiek;
- infrastructuur;
- Redis-integratie;
- Pine/Node-pariteit.

Pine-pariteit vereist zelf geëxporteerde fixtures.

Het protocol staat in:

```text
docs/PINE_NODE_PARITY.md
```

Wanneer er geen fixtures bestaan, wordt die suite gecontroleerd overgeslagen.

## Troubleshooting

| Symptoom | Oorzaak → oplossing |
|---|---|
| `Ontbrekende env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN` | Controleer of `KV_REST_API_URL` en `KV_REST_API_TOKEN` bestaan. De Redis-client hoort beide naamsets te ondersteunen. Deploy daarna opnieuw. |
| `Ontbrekende Redis env: UPSTASH_REDIS_REST_URL of KV_REST_API_URL` | Geen ondersteunde Redis REST-URL gevonden. Voeg `UPSTASH_REDIS_REST_URL` toe of herstel de bestaande `KV_REST_API_URL`. |
| `Ontbrekende Redis env: UPSTASH_REDIS_REST_TOKEN of KV_REST_API_TOKEN` | Geen schrijftoken gevonden. Voeg `UPSTASH_REDIS_REST_TOKEN` toe of herstel `KV_REST_API_TOKEN`. |
| Redis-variabelen bestaan, maar de fout blijft | Controleer of de nieuwste deployment ná de environment-variablewijziging is gemaakt. Voer een Redeploy uit. |
| Alleen `KV_REST_API_READ_ONLY_TOKEN` aanwezig | Voeg de normale `KV_REST_API_TOKEN` toe. Het platform moet naar Redis kunnen schrijven. |
| `Redis HTTP 401` | De Redis URL en token horen waarschijnlijk niet bij dezelfde database, of de token is ongeldig. |
| `Redis HTTP 403` | De gebruikte token heeft onvoldoende rechten of is read-only. |
| `Redis HTTP 404` | Controleer of de REST-URL correct is en geen verkeerde endpoint-URL bevat. |
| Deploy-fout `No Output Directory named public` | Framework Preset stond op `Other` → Vercel Settings → zet Framework Preset op `Next.js`. |
| `401` op cron-routes | Bearer-header of `?secret=` ontbreekt of bevat niet dezelfde waarde als `CRON_SECRET`. |
| Shardstatus `STALE_DATA` | Scan draaide te vroeg na candle-close; een volgende cyclus hoort dit vanzelf te herstellen. |
| Geen Discord-berichten | Webhook-environment variable is leeg of fout. `/admin/discord` toont de statuscode per poging. |
| `health: DOWN` | Er is nog geen succesvolle finalize uitgevoerd, de eerste cyclus is nog niet afgerond of de crons staan uit. |
| Cron geweigerd tijdens deployment | Vercel Hobby-plan ondersteunt de ingestelde frequentie niet → gebruik een externe scheduler volgens stap 14. |

## Lancering van betaald abonnement

Deze instellingen vormen de veilige standaard tijdens dataverzameling:

```env
COLLECTING_MODE=true
PAID_LAUNCH_ENABLED=false
BILLING_PROVIDER=none
```

In deze status zijn actief:

- website;
- waitlist;
- publieke methodologie;
- track record;
- virtuele setupmeting;
- familievalidatie;
- Discord-publicatie volgens collectingbeleid.

Betalingen zijn uitgeschakeld.

Voor betaald lanceren:

1. Maak een Stripe-product aan.
2. Maak een Stripe Price aan.
3. Vul de billing-environment variables.
4. Registreer:

```text
/api/billing/webhook
```

als Stripe-webhookendpoint.

5. Controleer de webhook-secret.
6. Zet:

```env
BILLING_PROVIDER=stripe
PAID_LAUNCH_ENABLED=true
```

7. Maak een nieuwe Vercel-deployment.

**Harde voorwaarde vooraf:** juridische toets van betaalde crypto-signalen voor
Nederlandse en Europese klanten, waaronder de relevante MiCAR- en AFM-kaders.

Het platform voert geen juridische toets uit en vervangt die beoordeling niet.

## Documentatie

```text
docs/REDIS_SCHEMA.md
docs/PERFORMANCE_BUDGET.md
docs/INDICATOR_PARITY.md
docs/STATISTICAL_METHOD.md
docs/PINE_NODE_PARITY.md
PROJECT_STATE.md
```