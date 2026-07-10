# PROJECT_STATE

## Definitief (FASE 1–6 · backend compleet)
- package.json · .env.example · vercel.json
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
1. src/discord/templates.js — v1 afgekapt tijdens levering; v2 = volledige hervering, inhoudelijk gelijk aan ontwerp.
2. src/market/htfContext.js — v1 verwees naar niet-bestaand `cfg().emaWarmup` (door JS-coercion onschadelijk maar incorrect); v2 gebruikt expliciete MIN_HTF_BARS=60.

## Nog te leveren
- FASE 7: publieke API-routes + website (home, track-record, families, methodology, signal/[id], status, pricing, waitlist) + layout/styles
- FASE 8: admin (login, dashboard-API's, pagina's)
- FASE 9: billing-interface (modulair, uit tot PAID_LAUNCH_ENABLED)
- Docs: REDIS_SCHEMA · STATISTICAL_METHOD · INDICATOR_PARITY · PERFORMANCE_BUDGET · PINE_NODE_PARITY · README
- Tests: indicator · timing · positionEngine · statistiek · infra · parity-fixtures

## Deploy-status na deze batch
Backend volledig operationeel: universe → scan (5 shards) → finalize → Discord,
monitor → uitkomsten → families → verificatie, daily digest + hashketen.
Website toont nog niets (FASE 7); cURL + Discord volstaan voor validatie.
