# Pine ↔ Node pariteitsprotocol

Doel: aantonen dat de Node-engine op identieke candles dezelfde waarden produceert als
het originele Pine-script (ARS-U v6.1), binnen gedocumenteerde toleranties. Bewuste
afwijkingen staan in docs/INDICATOR_PARITY.md (D3–D5, P1–P2) en worden hier niet
opnieuw gerechtvaardigd, alleen zichtbaar gemaakt.

## 1 · Wat wordt vergeleken
| Reeks | Bron (Pine) | Tolerantie na warmup |
|---|---|---|
| EMA fast/slow | emaF, emaS | relatief ≤ 1e-3 (venstertransient P1) |
| RSI(14) | rsiV | absoluut ≤ 0,05 |
| ATR(14), ATR% | atrV, atrPct | relatief ≤ 1e-3 |
| Vol-rank, ER-rank | volRank, erRank | exact (stappen van 0,5) — **pin A1** |
| Relatief volume | relVol | relatief ≤ 1e-6 |
| Flow | flowB | relatief ≤ 1e-3 |
| Swing high/low | lastSwingHigh/Low | exact prijsgelijk (0 = geen swing) — **pin A2** |
| Structure bias | structureBias | exact |
| Scores | scoreLong/Short | absoluut ≤ 0,1 (alleen op kandidaat-bars) |
| Signalen | longSignal/shortSignal | exact, met D3-kanttekening (flat-gate uit) |

Warmup: de eerste 260 bars van elk fixture worden overgeslagen (P1).

## 2 · Fixture genereren (TradingView)
TradingView-data valt onder hun licentie en kan niet worden meegeleverd; fixtures maak
je zelf in ±5 minuten:

1. Open ARS-U v6.1 op een liquide perp (bv. BTCUSDT.P), timeframe 15m, laad ≥ 600 bars.
2. Instellingen: **Enable backtest trades = uit** en **Only signal when flat = uit** (D3).
3. Plak het exportblok hieronder onderaan het script en sla op.
4. Menu chart → **Export chart data…** → time format **UNIX** → download CSV.
5. Hernoem naar `parity_<SYMBOOL>_<TF>.csv` (bv. `parity_BTCUSDT_15m.csv`) en plaats
   in `tests/fixtures/`.
6. `npm test` — de parity-suite pakt automatisch elk `tests/fixtures/parity_*.csv` op
   en **slaat netjes over** (met melding) wanneer er geen fixtures liggen.

### Exportblok (toevoegen onderaan ARS_U_v6_1)
```pine
// ═══ PARITY EXPORT — alleen voor fixture-generatie, daarna verwijderen ═══
plot(volume, "px_volume", display = display.data_window)
plot(emaF, "px_emaF", display = display.data_window)
plot(emaS, "px_emaS", display = display.data_window)
plot(rsiV, "px_rsi", display = display.data_window)
plot(atrV, "px_atr", display = display.data_window)
plot(atrPct, "px_atrPct", display = display.data_window)
plot(volRank, "px_volRank", display = display.data_window)
plot(erRank, "px_erRank", display = display.data_window)
plot(relVol, "px_relVol", display = display.data_window)
plot(flowB, "px_flow", display = display.data_window)
plot(nz(lastSwingHigh), "px_swingHigh", display = display.data_window)
plot(nz(lastSwingLow), "px_swingLow", display = display.data_window)
plot(structureBias, "px_structBias", display = display.data_window)
plot(scoreLong, "px_scoreLong", display = display.data_window)
plot(scoreShort, "px_scoreShort", display = display.data_window)
plot(longSignal ? 1 : 0, "px_longSignal", display = display.data_window)
plot(shortSignal ? 1 : 0, "px_shortSignal", display = display.data_window)
```

## 3 · CSV-formaat
TradingView exporteert: `time, open, high, low, close` plus één kolom per plot-titel
(px_*). De harnas leest kolommen op titel; volgorde is irrelevant. `px_swingHigh/Low`
= 0 betekent "nog geen bevestigde swing".

## 4 · Audit-pins
- **A1 — percentrank-tieregel.** Node telt de vórige 200 waarden met **≤** (huidige bar
  uitgesloten). Elk fixture met herhaalde ATR%-waarden pint dit automatisch: één
  systematische afwijking van ±0,5 stap ⇒ tieregel aanpassen en hier documenteren.
- **A2 — pivot-gelijkheid.** Node eist **strikte** ongelijkheid aan beide zijden
  (gelijke extremen vormen geen pivot). Fixtures met dubbele toppen op pivotafstand
  pinnen dit: bij mismatch de vergelijkingsoperator omdraaien en documenteren.

## 5 · Verwachte, geaccepteerde verschillen
- Extra Node-signalen op bars waar Pine's flat-gate blokkeerde → géén fout (D3).
- Timeout-ná-TP1-uitkomsten wijken bewust af van de spec (D5) — outcome-niveau, niet
  indicator-niveau, dus buiten deze vergelijking.
- Eerste ~260 bars: seedtransient (P1) — uitgesloten van vergelijking.

## 6 · Status
| Fixture | Datum export | Resultaat | Afwijkingen |
|---|---|---|---|
| — nog geen fixtures aangeleverd — | | | |

Dit document wordt bijgewerkt na elke fixture-run; pas na ≥ 2 fixtures (verschillende
symbolen) op groen geldt de pariteit als gepind (Definition of Done).
