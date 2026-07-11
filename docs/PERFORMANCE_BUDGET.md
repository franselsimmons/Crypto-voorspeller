# Performance- en kostenbudget

## RAM
- Per shard-invocatie: max SCAN_CONCURRENCY (6) symbolen in flight × 340 candles.
  Indicatorarrays ≈ 20 reeksen × 340 floats ≈ 55 KB per symbool → werkgeheugen < 5 MB
  bovenop de Node-baseline (60–100 MB RSS op Vercel). Piek ruim onder 128 MB-doel;
  nergens candlehistorie van het hele universe tegelijk in RAM (candles verlaten
  analyzeSymbol niet).

## Bitget-API (publiek, limiet ~20 rps)
| Bron | Calls/dag |
|---|---|
| 15m-scan: 96 cycli × 150 symbolen | 14.400 |
| 4H-context (alleen trigger-kandidaten) | 100–1.000 |
| Monitor: 96 × distinct open symbolen (5–40) | 500–3.800 |
| Universe (uurlijks) + contracts (dagelijks) | 25 |
| **Totaal** | **≈ 15.000–19.500 (~0,22 rps gem.)** |
Piek per shard ≤ concurrency 6 → totaal 2–4 rps tijdens scanvensters: ruime marge.

## Vercel
- Invocaties/dag ≈ 96 × (5 shards + finalize + monitor) + 24 + 1 ≈ **697**.
- Doelduur per shard <10 s (30 symbolen, 6 parallel); maxDuration 60 s als vangnet.
- Crons per 15 min vereisen het Pro-plan; alternatief is een externe scheduler op de
  cron-routes met ?secret= (ontwerpbeslissing D7).

## Upstash Redis
- Commands/dag: scan+finalize ≈ 25–40k, monitor ≈ 5–40k, site/admin ≈ 5–15k →
  **40–100k/dag** ≈ €2–6/maand pay-as-you-go.
- Hot-opslag: zie REDIS_SCHEMA (≤25 MB eerste jaar).

## Kostenbronnen (maandelijks)
Vercel Pro ($20) · Upstash (€2–6) · domein (~€1) · Bitget publiek gratis · Discord gratis.

## Schaalpad 150 → 500 coins
SCAN_SHARDS 5 → 16 (≈31 symbolen/shard), API-calls ×3,3 (~0,75 rps gemiddeld),
Redis-hot +~0,5 MB, monitorload evenredig. Beide knoppen (MAX_UNIVERSE_SIZE,
SCAN_SHARDS) zijn env-variabelen; vercel.json breidt uit met extra shard-crons.
Geen architectuurwijziging nodig.
