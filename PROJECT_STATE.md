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

## Definitief (documentatie)
- docs/REDIS_SCHEMA.md · docs/PERFORMANCE_BUDGET.md · docs/INDICATOR_PARITY.md
- docs/STATISTICAL_METHOD.md · docs/PINE_NODE_PARITY.md · README.md

## Definitief (tests · batch 1 — pure logica, geen Redis/netwerk nodig)
- tests/utils.test.js — math/time/hash/prng + mapLimit (concurrency-bound, foutisolatie)
- tests/indicators.test.js — EMA/RMA/ATR/RSI/ER/extremen/cross + **PIN A1** (percentrank ≤)
- tests/structure.test.js — pivots + **PIN A2** (strikte ongelijkheid), BOS, CHoCH,
  sweep, failed break
- tests/outcome.test.js — timingpin (signaalcandle uitgesloten), SL/BE/FULL/timeout,
  ambiguïteit conservatief, **PIN D5** (timeout-ná-TP1 = +0.50R), SHORT-spiegel, categoryOf
- tests/statistics.test.js — outcomeValues, bootstrap-determinisme, sterke/zwakke
  familie, **shrinkage-guard** (3/3 winst → LCB < 0), parentProbs, BH-FDR

## Correctielog
1. src/discord/templates.js — v1 afgekapt; v2 volledig.
2. src/market/htfContext.js — ongeldige cfg().emaWarmup → MIN_HTF_BARS=60.
3. vercel.json — "framework": "nextjs" (deploy-fout output directory).
4. src/storage/keys.js v2 — billing-keys + TTL.billEvent.
5. .env.example v2 — billing-variabelen.

## Nog te leveren
1. Tests batch 2: tests/timing.test.js (candle-close/HTF-mapping/future-leak) ·
   tests/engine.test.js (analyzeWindow op synthetische candles, warmup-guard) ·
   tests/parity.test.js (fixture-harnas, skipt zonder fixtures) ·
   tests/infra.test.js (locks/dedupe, skipt zonder Redis-env) · tests/fixtures/README.md
2. FASE 10: eindaudit tegen Definition of Done + definitieve PROJECT_STATE

## Status
`npm test` draait batch 1 volledig zelfstandig (36 assertiegroepen over 5 suites).
Audit-pins A1/A2/D5 zijn nu in code vastgelegd; TV-fixtures blijven nodig voor de
externe Pine-pariteit (A1/A2 tegen echt Pine-gedrag).
