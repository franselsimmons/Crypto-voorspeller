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

## Definitief (tests · compleet)
Batch 1 (pure logica, offline):
- tests/utils.test.js · tests/indicators.test.js (PIN A1) · tests/structure.test.js (PIN A2)
- tests/outcome.test.js (timingpin + PIN D5) · tests/statistics.test.js (shrinkage-guard, BH)
Batch 2:
- tests/timing.test.js — cycle-grenzen, closedOnly-grensgeval, **future-leak-pins**
  (lopend 4H-blok onleesbaar + exacte blokgrens)
- tests/engine.test.js — warmup-guard, determinisme, **prefilter-exactheid D2** als
  invariant over 5 seeds, outputvorm, fingerprint-formaat (D4)
- tests/parity.test.js — fixture-harnas: candle-afgeleide series + marktstructuur,
  skipt netjes zonder fixtures
- tests/infra.test.js — locks (mutual exclusion, foute release, TTL+retry), NX-dedupe,
  atomaire INCR; skipt zonder UPSTASH_*-env; alleen zelfopruimende scratch-keys
- tests/fixtures/README.md

## Beslissingen tests batch 2
- Engine getest op invarianten i.p.v. gefabriceerd signaal: een handgemaakt
  "gegarandeerd signaal" zou triggerlogica in de test dupliceren en niets bewijzen;
  echte signaalvalidatie loopt via parity-fixtures (echte marktdata).
- Parity-harnas-scope: series + structuur nu; score-/signaalkolommen gereserveerd
  (per-bar engine-export vereist) → **auditpunt A10**. Fixtures exporteren die
  kolommen alvast wél, zodat ze bruikbaar blijven voor harnas-v2.
- Infra-tests raken uitsluitend ARS:TEST:*- en test-lock-keys met finally-cleanup;
  productie-keys (hashketen, signalen, families) worden nooit aangeraakt.

## Correctielog
1. src/discord/templates.js — v1 afgekapt; v2 volledig.
2. src/market/htfContext.js — ongeldige cfg().emaWarmup → MIN_HTF_BARS=60.
3. vercel.json — "framework": "nextjs" (deploy-fout output directory).
4. src/storage/keys.js v2 — billing-keys + TTL.billEvent.
5. .env.example v2 — billing-variabelen.

## Nog te leveren
1. FASE 10: eindaudit tegen de Definition of Done + definitieve PROJECT_STATE

## Status
`npm test` draait 9 suites: 7 volledig offline groen; parity en infra skippen met
duidelijke melding zonder respectievelijk fixtures en Redis-env, en draaien mee zodra
die aanwezig zijn.
