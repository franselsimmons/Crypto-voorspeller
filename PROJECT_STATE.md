# PROJECT_STATE — v1.0.0 · COMPLEET

## Status
Alle 10 fasen geleverd. Eén open Definition-of-Done-eis: externe Pine-pariteit
(fixtures kunnen uitsluitend uit de TradingView van de eigenaar komen; harnas,
protocol en interne pins staan klaar). Eén openstaand ontwerpbesluit: A7 (D5).

## Definitief — volledige inventaris
FASE 1–6 (backend): package.json · .env.example (v2) · vercel.json (v2) · src/config.js ·
src/utils/{math,time,hash,prng,pool}.js · src/storage/{redis,keys(v2),hashChain}.js ·
src/security/{locks,auth}.js · src/observability/{log,runs}.js ·
src/market/{bitgetClient,contracts,htfContext(v2)}.js ·
src/indicator/{indicators,marketStructure,riskModel,scoreEngine,arsEngine}.js ·
src/scanner/{universe,scanEngine,shardEngine,finalizeScan}.js ·
src/trade/{outcomeEngine,positionEngine}.js ·
src/verification/{statistics,fdr,familyEngine(v2)}.js ·
src/discord/{templates(v2),discord}.js · app/api/cron/ (5 routes)

FASE 7 (publieke site): src/site/{queries,format}.js · app/api/public/ (7 routes) ·
app/api/waitlist · app/{layout,globals.css,page}.js · 6 pagina's · WaitlistForm

FASE 8 (admin): auth login/logout · src/site/{adminRoute,adminQueries}.js ·
src/security/adminSession.js · 11 admin-API's · login-pagina · (panel)-layout + 8 pagina's ·
AdminLoginForm · AdminRunButton

FASE 9 (billing, standaard uit): src/billing/{billingConfig,provider,stripeProvider,
discordRoles}.js · app/api/billing/{checkout,webhook,portal}

Docs: REDIS_SCHEMA · PERFORMANCE_BUDGET · INDICATOR_PARITY · STATISTICAL_METHOD ·
PINE_NODE_PARITY · README

Tests (9 suites): utils · indicators (PIN A1) · structure (PIN A2) · outcome
(timingpin + PIN D5) · statistics (shrinkage-guard, BH) · timing (future-leak-pins) ·
engine (determinisme, prefilter-invariant D2, D4) · parity (fixture-harnas, skip) ·
infra (locks/dedupe, skip zonder Redis) · fixtures/README

## Correctielog
1. src/discord/templates.js — v1 afgekapt; v2 volledig.
2. src/market/htfContext.js — ongeldige cfg().emaWarmup → MIN_HTF_BARS=60.
3. vercel.json — "framework": "nextjs".
4. src/storage/keys.js v2 — billing-keys + TTL.billEvent.
5. .env.example v2 — billing-variabelen.
6. src/verification/familyEngine.js v2 — AUDIT F1: familie-mutaties (bumpSeen,
   recordClose, recomputeAllFamilies) geserialiseerd onder gedeeld Redis-lock;
   Discord-posts buiten het lock. Reden: lost-update-risico bij overlap
   finalize/monitor (handmatige runs, trage crons).

## Auditbevindingen FASE 10
F1 gefixt (correctie 6) · F2 = A12 (cooldown-hardcode, gedrag identiek, v1.1) ·
F3 = A11 (zombie-OPEN-ids bij delisting, v1.1) · F4 dead code emaCross (v1.1) ·
TOCTOU finalize/monitor onderzocht: onmogelijk binnen maxDuration-bounds.

## Backlog
Wacht op eigenaar: A1/A2 (TV-fixtures) · A7 (D5-besluit) · A9 (checkout-UI bij launch).
v1.1: A4 · A6 · A8 · A11 · A12 · F4. v2: A3 · A5 · A10.

## Operationele randvoorwaarden
Crons per 15 min = Vercel Pro of externe scheduler (README stap 14). Betaalde
lancering uitsluitend na juridische toets (MiCAR/AFM) — buiten scope van deze codebase.
