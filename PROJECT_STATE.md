# PROJECT_STATE

## Definitief (FASE 1–6 · backend)
- package.json · .env.example · vercel.json (v2)
- src/config.js
- src/utils/: math.js · time.js · hash.js · prng.js · pool.js
- src/storage/: redis.js · keys.js · hashChain.js
- src/security/: locks.js · auth.js
- src/observability/: log.js · runs.js
- src/market/: bitgetClient.js · contracts.js · htfContext.js (v2)
- src/indicator/: indicators.js · marketStructure.js · riskModel.js · scoreEngine.js · arsEngine.js
- src/scanner/: universe.js · scanEngine.js · shardEngine.js · finalizeScan.js
- src/trade/: outcomeEngine.js · positionEngine.js
- src/verification/: statistics.js · fdr.js · familyEngine.js
- src/discord/: templates.js (v2) · discord.js
- app/api/cron/: universe · scan · scan-finalize · monitor · daily-digest

## Definitief (FASE 7 · batch 1)
- src/site/queries.js — NIEUW: gedeelde dataleeslaag voor pagina's én publieke API
- app/api/public/: overview · signals · signals/[signalId] · families · status · daily · export
- app/api/waitlist/route.js
- app/layout.js · app/globals.css · app/page.js
- components/WaitlistForm.js (enige client-component tot nu toe)

## Aannames (kort)
- Sitecopy in het Engels (internationale doelgroep; embeds waren al Engelstalig).
- Homepage: ISR 60s met Redis-fallback zodat build en outages de site niet breken.

## Correctielog
1. src/discord/templates.js — v1 afgekapt; v2 volledig.
2. src/market/htfContext.js — ongeldige `cfg().emaWarmup`-referentie → MIN_HTF_BARS=60.
3. vercel.json — `"framework": "nextjs"` (deploy-fout output directory).

## Nog te leveren
- FASE 7 batch 2: pagina's track-record (filters+paginering), families, methodology,
  signal/[signalId], status, pricing
- FASE 8: admin (login, API's, pagina's)
- FASE 9: billing-interface (modulair, uit)
- Docs: REDIS_SCHEMA · STATISTICAL_METHOD · INDICATOR_PARITY · PERFORMANCE_BUDGET ·
  PINE_NODE_PARITY · README
- Tests: indicator · timing · positionEngine · statistiek · infra · parity-fixtures
