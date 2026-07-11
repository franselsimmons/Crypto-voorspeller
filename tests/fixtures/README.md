# tests/fixtures

Deze map is **bewust leeg** in de repository: TradingView-marktdata valt onder de
TV-datalicentie en mag niet worden meegeleverd. Parity-fixtures genereer je zelf in
±5 minuten via het protocol in `docs/PINE_NODE_PARITY.md` (exportblok + stappen).

## Naamgeving
`parity_<SYMBOOL>_<TF>.csv` — bv. `parity_BTCUSDT_15m.csv`. De testsuite pakt elk
bestand op dat matcht met `parity_*.csv`; zonder fixtures **skipt** de suite met melding.

## Vereisten per fixture
- Time format **UNIX** (seconden; het harnas detecteert en converteert zelf naar ms).
- ≥ 600 bars (eerste 260 = warmup, uitgesloten van vergelijking).
- Pine-instellingen bij export: `Enable backtest trades` **uit**, `Only signal when flat`
  **uit** (deviatie D3).

## Welke kolommen het harnas nu gebruikt
`time,open,high,low,close` + `px_volume,px_emaF,px_emaS,px_rsi,px_atr,px_atrPct,
px_volRank,px_erRank,px_relVol,px_flow,px_swingHigh,px_swingLow,px_structBias`

## Gereserveerd voor harnas-v2 (auditpunt A10)
`px_scoreLong,px_scoreShort,px_longSignal,px_shortSignal` — per-bar scorevergelijking
vereist een per-bar export uit de Node-engine; tot die tijd worden scores en signalen
geverifieerd via unit-tests (scoreEngine/riskModel) + de invariantentests in
tests/engine.test.js. Exporteer deze kolommen alvast wél: bestaande fixtures blijven
dan bruikbaar voor v2.
