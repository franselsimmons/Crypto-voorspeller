# Statistische methode — de verificatielaag

Dit document legt exact vast hoe een setupfamilie het label VERIFIED verdient, verliest,
en waarom de methode zo gekozen is. Het is de technische onderbouwing van de publieke
methodology-pagina.

## 1 · Principes
1. **Alles wordt gemeten.** Elke kwalificerende A/ELITE-setup wordt virtueel gevolgd,
   gepubliceerd of niet. Publicatieselectie kan de statistiek nooit beïnvloeden.
2. **Labels worden verdiend.** VERIFIED is een uitkomst van de data, geen instelling.
3. **Labels zijn intrekbaar.** Verdwijnt de edge, dan verdwijnt het label — automatisch
   en publiek (statuslog + Discord #status).
4. **Reproduceerbaar.** Elke berekening is deterministisch: dezelfde data geeft altijd
   exact dezelfde LCB en dezelfde beslissing.

## 2 · Uitkomstmodel
Elke afgeronde meting valt in precies één categorie. Kosten (COST_R = 0,15R, fees +
slippage-schatting) worden van élk resultaat afgetrokken: `netR = grossR − 0,15`.

| Categorie | Betekenis | grossR | netR |
|---|---|---|---|
| loss | SL geraakt vóór TP1 | −1,00 | **−1,15** |
| be | TP1 geraakt, rest sluit break-even (incl. timeout ná TP1, D5) | +0,50 | **+0,35** |
| full | TP1 én TP2 geraakt | +1,50 | **+1,35** |
| timeout | 48u verstreken zonder TP1 | 0,00 | **−0,15** |

Ambigue candles (SL én target in dezelfde bar) worden altijd als de **slechtste** uitkomst
geboekt en gemarkeerd met `ambiguousBar` (zie outcomeEngine).

## 3 · Families en namespaces
Resultaten worden gepoold in 8 families: richting (LONG/SHORT) × setuptype
(PULLBACK/BREAKOUT) × klasse (A/ELITE). Alle statistiek leeft onder de namespace
`{INDICATOR_VERSION}:{parameterHash}`; elke wijziging aan indicatorlogica of parameters
start automatisch een lege dataset. Oude resultaten worden nooit gemengd met nieuwe logica.

## 4 · Waarom géén Wilson op winrate
De spec eiste een audit hiervan; conclusie: Wilson beantwoordt hier de verkeerde vraag.
De uitkomst is geen Bernoulli maar een **vierpuntsverdeling met asymmetrische uitbetaling**.
Een familie kan 55% "wins" hebben en tóch negatieve verwachtingswaarde (be-wins leveren
+0,35, losses kosten −1,15). Verificatie moet dus gaan over de **gemiddelde netto R**,
niet over de winkans. Daarom: bootstrap-LCB op het gemiddelde (FASE 0, optie B).

## 5 · Schatting per familie (shrinkage)
Per familie tellen we de categorie-aantallen `n_k` (k ∈ {loss, be, full, timeout},
n = Σn_k). De kansschatting krijgt Bayesiaanse shrinkage met κ = 10 pseudo-metingen
richting het **richtingsgemiddelde** (parent = alle LONG- resp. SHORT-families samen):

    p̂_k = (n_k + κ · q_k) / (n + κ)        met q = categorieverdeling van de parent

Effect: bij n = 5 weegt de parent nog zwaar (κ/(n+κ) ≈ 67%), bij n = 100 vrijwel niet
meer (≈ 9%). Dit voorkomt dat "3 van de 3 winst" als bewijs telt en maakt kleine
families bewust conservatief.

## 6 · Bootstrap lower confidence bound (LCB)
1. Neem de geshrunkene verdeling p̂ en de netR-waarden per categorie (tabel §2).
2. Trek B = 4.000 resamples van elk n uitkomsten uit p̂ (multinomiaal) en bereken per
   resample het gemiddelde netR.
3. **LCB = 5e percentiel** van die 4.000 gemiddelden (95% eenzijdig).
4. **p-waarde** = aandeel resample-gemiddelden ≤ 0, met vloer 1/B.

Bij discrete uitkomsten is multinomiaal hertrekken wiskundig identiek aan klassieke
non-parametrische bootstrap, maar O(4) in geheugen en <5 ms rekentijd. De PRNG is
deterministisch geseed (mulberry32 over `namespace:familyId:n:counts`), dus iedereen
die de code op dezelfde data draait, krijgt bit-voor-bit dezelfde LCB. Uitlegbaar in
één zin voor bezoekers: *"we herspelen onze eigen historie 4.000 keer en rapporteren
de ondergrens."*

## 7 · Meervoudig toetsen (Benjamini–Hochberg)
Acht families tegelijk toetsen betekent dat er "vanzelf" wel eens één positief oogt.
Daarom BH-FDR met α = 0,10 over de m families die de toelatingsdrempel halen (n ≥ 30):
sorteer p-waarden oplopend, zoek de grootste rang k met p₍ₖ₎ ≤ (k/m)·α; alle families
t/m rang k slagen. Interpretatie: van de families die VERIFIED worden, is naar
verwachting hoogstens 10% ten onrechte gelabeld.

## 8 · Statusmachine
| Status | Voorwaarde |
|---|---|
| COLLECTING | n < 30 |
| CANDIDATE | n ≥ 30, avgNetR > 0, maar LCB ≤ 0 of FDR faalt |
| VERIFIED | n ≥ 30 **én** avgNetR > 0 **én** LCB > 0 **én** FDR-pass |
| LOST_EDGE | was VERIFIED, voldoet nu niet meer (label publiek ingetrokken) |
| INSUFFICIENT_EDGE | n ≥ 30 en avgNetR ≤ 0 |

Elke overgang wordt gelogd (familyStatusLog), publiek getoond en naar Discord #status
gestuurd. `verifiedAt`/`lostEdgeAt` blijven permanent bewaard.

## 9 · Power-realisme (verplichte eerlijkheid)
De uitkomstspreiding is ≈ 1,0R. Vuistregel n ≈ (1,645·σ/edge)²:
- echte edge **+0,20R** → LCB > 0 na ± **70–80** metingen;
- echte edge **+0,10R** → ± **270+** metingen.

**n = 30 is dus een toelatingsdrempel, geen verificatiebelofte.** Families kunnen
maanden — of voorgoed — in COLLECTING/CANDIDATE blijven. Het systeem zegt dat dan
gewoon, in plaats van te doen alsof.

## 10 · Beperkingen (gedocumenteerd, niet weggemoffeld)
1. **Correlatieclustering.** Gelijktijdige posities over gecorreleerde coins delen één
   marktschok; de effectieve steekproef is kleiner dan de nominale n. v2-pad:
   block-bootstrap per dag (auditpunt A5).
2. **Virtuele fills.** Entry = candle-close zonder orderboek; de vaste 0,15R dekt
   gemiddelde kosten, niet extreme slippage op dunne pairs.
3. **Shrinkage-bias.** Kleine families worden naar het richtingsgemiddelde getrokken:
   conservatief bij echte outperformance, vertragend bij echte verschillen. Bewuste keuze.
4. **Vooraf gefixeerde hypothesen.** De 8 families en alle drempels lagen vast vóór de
   eerste meting; er wordt niet achteraf op drempels gezocht. FDR dekt de resterende
   multipliciteit.
