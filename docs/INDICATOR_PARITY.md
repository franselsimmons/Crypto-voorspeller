# Indicator-pariteit: Pine ARS-U v6.1 → Node

Registratie van elke bewuste of structurele afwijking. Elke wijziging aan ARS_PARAMS of
logica wijzigt de parameterHash en start een nieuwe statistische namespace (spec-eis).

## Geregistreerde afwijkingen
| ID | Afwijking | Motivatie | Impact |
|---|---|---|---|
| D3 | `onlySignalWhenFlat` verwijderd | Strategy-gebonden concept; betekenisloos bij multi-coin scanning | Meer overlappende metingen per symbool; begrensd door cooldown + unieke-setup. Parity-fixtures genereren met deze input **uit**. |
| D4 | `compressionSequence`/`swingSequence` → `compressionId`/`structureId` (openTime van cyclus-start resp. bevestigde pivot) | Pine-counters zijn window-relatief en niet stabiel over schuivende vensters | Semantisch equivalent; cross-window deterministisch; tevens dedupe-fingerprint. |
| D5 | Timeout **ná** TP1 = +0,50R gross (spec: 0,00R) | +0,5R is op dat moment feitelijk gerealiseerd (50% gesloten op 1R, rest ≥ BE); wegboeken zou onjuist zijn | Exit-reason `TIMEOUT_AFTER_TP1`; kosten −0,15R ongewijzigd. Bevestiging = auditpunt A7. |
| P1 | Stateless window-recompute (340 bars) i.p.v. Pine full-history | Ontwerpbeslissing D1 (geen persistente indicatorstate) | (a) EMA/RSI/ATR-seedtransient: EMA50 rest ≈ (49/51)^290 ≈ 1·10⁻⁵ relatief; RMA14 kleiner — verwaarloosbaar. (b) Marktstructuur ziet alleen swings binnen het venster; bias kan theoretisch afwijken als de laatst bevestigde swing >~330 bars oud is. Triggers vereisen recente structuur → bounded, geaccepteerd. (c) percentrank exact: vast 200-venster valt volledig binnen 340 bij warmup 260. |
| P2 | HTF-bias uit eigen EMA over 200 gesloten 4H-bars | Pine berekent op volledige 4H-historie | EMA50-4H-transient ≈ e^−5,9 ≈ 0,3% worst-case; htfBias is een tekenvergelijking en kan alleen bij bijna-gelijkheid flippen. Mitigatiepad: htfCandleLimit verhogen indien fixtures dit tonen. |

## Te pinnen via fixtures (tests/fixtures + docs/PINE_NODE_PARITY.md)
- **A1** `ta.percentrank`-tie-regel: implementatie telt vórige `len` waarden met **≤**, huidige bar uitgesloten.
- **A2** Pivotregel: **strikte** ongelijkheid aan beide zijden (gelijke extremen vormen geen pivot).

## Pine-elementen zonder Node-equivalent (bewust)
Visuals, tabellen, labels, alertstrings en de strategy-secties (29–38): vervangen door de
virtuele positie-engine (outcomeEngine/positionEngine) en Discord-templates. De
uitkomstcategorieën volgen exact het Pine-trademanagement (TP1 50% · BE · TP2).
