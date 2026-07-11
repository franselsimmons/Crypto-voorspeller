# PROJECT_STATE

## Definitief (FASE 1–6 · backend)
- package.json · .env.example (v2) · vercel.json (v2)
- src/config.js
- src/utils/: math.js · time.js · hash.js · prng.js · pool.js
- src/storage/: redis.js · keys.js (v2) · hashChain.js
- src/security/: locks.js · auth.js
- src/observability/: log.js · runs.js
- src/market/: bitgetClient.js · contracts.js · htfContext.js (v2)
- src/indicator/: indicators.js · marketStructure.js · riskModel.js · scoreEngine.js · arsEngine.js
- src/scanner/: universe.js · scanEngine.js · shardEngine.js · finalizeScan.js
- src/trade/: outcomeEngine.js · positionEngine.js
- src/verification/: statistics.js · fdr.js · familyEngine.js
- src/discord/: templates.js (v2) · discord.js
- app/api/cron/: universe · scan · scan-finalize · monitor · daily-digest

## Definitief (FASE 7 · publieke site)
- src/site/queries.js · src/site/format.js
- app/api/public/: overview · signals · signals/[signalId] · families · status · daily · export
- app/api/waitlist/route.js
- app/layout.js · app/globals.css · app/page.js
- app/track-record/ · app/families/ · app/methodology/ · app/signal/[signalId]/ ·
  app/status/ · app/pricing/ (page.js)
- components/WaitlistForm.js

## Definitief (FASE 8 · admin)
- app/api/auth/admin/: login · logout
- src/site/adminRoute.js · src/site/adminQueries.js · src/security/adminSession.js
- app/api/admin/: overview · scanner · signals · positions · families · discord ·
  run-universe · run-scan · run-monitor · run-digest · export
- components/AdminLoginForm.js · components/AdminRunButton.js
- app/admin/login/page.js · app/admin/(panel)/: layout + 8 pagina's

## Definitief (FASE 9 · billing, modulair, standaard uit)
- src/billing/: billingConfig.js · provider.js · stripeProvider.js · discordRoles.js
- app/api/billing/: checkout · webhook · portal

## Definitief (documentatie · compleet)
- docs/REDIS_SCHEMA.md · docs/PERFORMANCE_BUDGET.md · docs/INDICATOR_PARITY.md
- docs/STATISTICAL_METHOD.md · docs/PINE_NODE_PARITY.md · README.md

## Beslissingen docs batch 2
- Interne docs Nederlands (consistent met batch 1); sitecopy blijft Engels.
- Pine-fixtures kunnen niet worden meegeleverd (TradingView-datalicentie):
  PINE_NODE_PARITY.md definieert het volledige protocol + export-blok; de
  parity-testsuite (volgende batch) skipt met melding zolang tests/fixtures/ leeg is.
- README stap 14 bevat het externe-scheduler-alternatief voor Hobby-plan (D7).

## Correctielog
1. src/discord/templates.js — v1 afgekapt; v2 volledig.
2. src/market/htfContext.js — ongeldige cfg().emaWarmup → MIN_HTF_BARS=60.
3. vercel.json — "framework": "nextjs" (deploy-fout output directory).
4. src/storage/keys.js v2 — billing-keys + TTL.billEvent.
5. .env.example v2 — billing-variabelen.

## Nog te leveren
1. Tests + fixtures-harnas: tests/{indicator,timing,outcome,statistics,infra,parity}.test.js
   + tests/fixtures/README + evt. synthetische fixture (mogelijk gesplitst in twee)
2. FASE 10: eindaudit tegen Definition of Done + definitieve PROJECT_STATE

## Deploy-status
Volledig platform + volledige documentatie. Resteert: testsuite en eindaudit.
