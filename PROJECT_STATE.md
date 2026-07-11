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

## Definitief (FASE 7 · publieke site)
- src/site/queries.js · src/site/format.js
- app/api/public/: overview · signals · signals/[signalId] · families · status · daily · export
- app/api/waitlist/route.js
- app/layout.js · app/globals.css · app/page.js
- app/track-record/ · app/families/ · app/methodology/ · app/signal/[signalId]/ ·
  app/status/ · app/pricing/ (page.js)
- components/WaitlistForm.js

## Definitief (FASE 8 · batch 1 — admin-backend)
- app/api/auth/admin/login/route.js · app/api/auth/admin/logout/route.js
- src/site/adminRoute.js (auth-wrapper) · src/site/adminQueries.js (admin-dataleeslaag)
- app/api/admin/: overview · scanner · signals · positions · families · discord ·
  run-universe · run-scan · run-monitor · run-digest · export

## Beslissingen FASE 8
- Sessie: HttpOnly-cookie `ars_admin` = SHA-256(ars-admin:ADMIN_SECRET), SameSite=Strict,
  7 dagen; login rate-limited (10/uur/IP). Bearer ADMIN_SECRET blijft werken (checkAdmin).
- Handmatige runs via GET: veilig omdat elk pad dezelfde locks, cycle-idempotentie en
  signalId/fingerprint-dedupe gebruikt als de crons → geen dubbele signalen.
- run-digest: server-side self-fetch naar de cron-route met CRON_SECRET (zelfde codepad,
  lock en dedupe). Afhankelijkheid: APP_URL moet correct staan.
- run-scan zonder shard-param draait alle shards (2 parallel) + finalize; met ?shard=N één shard.
- Resetfuncties bewust NIET geïmplementeerd (spec staat dit alleen toe achter extra
  env-flag; veiligste invulling is afwezigheid). Herzien indien nodig in FASE 10.

## Correctielog
1. src/discord/templates.js — v1 afgekapt; v2 volledig.
2. src/market/htfContext.js — ongeldige cfg().emaWarmup → MIN_HTF_BARS=60.
3. vercel.json — "framework": "nextjs" (deploy-fout output directory).

## Nog te leveren
- FASE 8 batch 2: app/admin/login/page.js · app/admin/layout.js · admin-pagina's
  (overview, scanner, signals, positions, families, discord, settings, tools) ·
  components/AdminRunButton.js · src/security/adminSession.js
- FASE 9: billing-interface (modulair, uit tot PAID_LAUNCH_ENABLED)
- Docs: REDIS_SCHEMA · STATISTICAL_METHOD · INDICATOR_PARITY · PERFORMANCE_BUDGET ·
  PINE_NODE_PARITY · README
- Tests: indicator · timing · positionEngine · statistiek · infra · parity-fixtures

## Deploy-status
Publieke site + backend + admin-API's operationeel. Admin-UI volgt in batch 2;
tot die tijd: login via curl/fetch (cookie) of Bearer-header, JSON direct in browser.
