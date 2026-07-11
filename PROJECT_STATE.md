# PROJECT_STATE

## Definitief (FASE 1–6 · backend compleet)
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

## Correctielog
1. src/discord/templates.js — v1 afgekapt tijdens levering; v2 = volledige hervering.
2. src/market/htfContext.js — v1 verwees naar niet-bestaand `cfg().emaWarmup`; v2 gebruikt MIN_HTF_BARS=60.
3. vercel.json — v2: `"framework": "nextjs"` toegevoegd. Vercel-project stond op preset
   "Other" en verwachtte een statische `public`-outputmap; build slaagde maar deploy
   faalde. Dashboard-fix: Settings → Framework Preset → Next.js.

## Nog te leveren
- FASE 7: publieke API-routes + website (home, track-record, families, methodology,
  signal/[id], status, pricing, waitlist) + layout/styles
- FASE 8: admin (login, dashboard-API's, pagina's)
- FASE 9: billing-interface (modulair, uit tot PAID_LAUNCH_ENABLED)
- Docs: REDIS_SCHEMA · STATISTICAL_METHOD · INDICATOR_PARITY · PERFORMANCE_BUDGET ·
  PINE_NODE_PARITY · README
- Tests: indicator · timing · positionEngine · statistiek · infra · parity-fixtures

## Deploy-status
Backend volledig operationeel na framework-fix. Root-URL geeft 404 tot FASE 7 (verwacht).
