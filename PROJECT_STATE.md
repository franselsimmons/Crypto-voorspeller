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

## Definitief (FASE 8 · admin compleet)
Batch 1 (backend):
- app/api/auth/admin/login/route.js · app/api/auth/admin/logout/route.js
- src/site/adminRoute.js · src/site/adminQueries.js
- app/api/admin/: overview · scanner · signals · positions · families · discord ·
  run-universe · run-scan · run-monitor · run-digest · export
Batch 2 (UI):
- src/security/adminSession.js
- components/AdminLoginForm.js · components/AdminRunButton.js
- app/admin/login/page.js
- app/admin/(panel)/: layout.js · page.js · scanner/ · signals/ · positions/ ·
  families/ · discord/ · settings/ · tools/ (page.js)

## Beslissingen FASE 8
- Route group app/admin/(panel)/ i.p.v. app/admin/layout.js: /admin/login valt buiten de
  auth-guard, anders redirect-loop. URL's ongewijzigd (/admin, /admin/scanner, …).
- requireAdmin() in ELKE pagina naast de layout-check: App Router-layouts re-renderen
  niet bij client-side navigatie; per-page check is defense in depth.
- Login via volledige navigatie (window.location) zodat de server de nieuwe cookie ziet.
- Admin-pagina's lezen direct uit adminQueries (geen HTTP-selfcalls); de admin-API's
  bestaan voor programmatische toegang en de run-knoppen.
- Resetfuncties bewust afwezig (veiligste invulling); herzien in FASE 10 indien nodig.

## Correctielog
1. src/discord/templates.js — v1 afgekapt; v2 volledig.
2. src/market/htfContext.js — ongeldige cfg().emaWarmup → MIN_HTF_BARS=60.
3. vercel.json — "framework": "nextjs" (deploy-fout output directory).

## Nog te leveren
- FASE 9: billing-provider-interface + routes (uitgeschakeld tot PAID_LAUNCH_ENABLED)
- Docs: REDIS_SCHEMA · PERFORMANCE_BUDGET · INDICATOR_PARITY · STATISTICAL_METHOD ·
  PINE_NODE_PARITY · README
- Tests: indicator · timing · positionEngine · statistiek · infra · parity-fixtures
- FASE 10: volledige audit

## Deploy-status
Volledig platform operationeel: publieke site, backend, admin-UI op /admin
(login op /admin/login). Billing, docs en tests volgen.
