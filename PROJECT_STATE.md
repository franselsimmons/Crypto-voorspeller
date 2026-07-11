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

## Definitief (FASE 7 · compleet)
- src/site/queries.js · src/site/format.js (NIEUW, gedeelde formatters)
- app/api/public/: overview · signals · signals/[signalId] · families · status · daily · export
- app/api/waitlist/route.js
- app/layout.js · app/globals.css · app/page.js
- app/track-record/page.js · app/families/page.js · app/methodology/page.js
- app/signal/[signalId]/page.js · app/status/page.js · app/pricing/page.js
- components/WaitlistForm.js (enige client-component)

## Aannames
- Sitecopy Engels; backend-commentaar Nederlands.
- Track-record filters via GET-form (nul client-JS); paginering First/Next (offset-cursor, zie A8).
- Statuspagina leest laatste Discord-logrecord rechtstreeks uit Redis (gedocumenteerde
  uitzondering op de queries.js-laag, om hervers levering van dat bestand te vermijden).

## Correctielog
1. src/discord/templates.js — v1 afgekapt; v2 volledig.
2. src/market/htfContext.js — ongeldige cfg().emaWarmup → MIN_HTF_BARS=60.
3. vercel.json — "framework": "nextjs" (deploy-fout output directory).

## Nog te leveren
- FASE 8: admin (login, API's, pagina's)
- FASE 9: billing-interface (modulair, uit tot PAID_LAUNCH_ENABLED)
- Docs: REDIS_SCHEMA · STATISTICAL_METHOD · INDICATOR_PARITY · PERFORMANCE_BUDGET ·
  PINE_NODE_PARITY · README
- Tests: indicator · timing · positionEngine · statistiek · infra · parity-fixtures

## Deploy-status
Volledige publieke site + backend operationeel. Admin (FASE 8) en tests/docs volgen.
