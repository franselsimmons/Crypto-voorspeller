# Redis-schema (Upstash)

Namespace: alle keys beginnen met `ARS:`. Familie-keys bevatten daarnaast de statistische
namespace `{indicatorVersion}:{parameterHash}` zodat parameterwijzigingen nooit oude data hergebruiken.

| Key | Type | TTL | Doel | Max grootte (indicatie) |
|---|---|---|---|---|
| ARS:UNIVERSE:LATEST | string (JSON) | 2 u | universe-snapshot (~150 coins) | ~25 KB |
| ARS:CONTRACTS | string (JSON) | 24 u | tick-size-map | ~15 KB |
| ARS:SCAN:CYCLE:{cycleId} | hash | 1 u | shard-voortgang + finalize-status | <1 KB |
| ARS:SCAN:SHARD:{cycleId}:{shard} | string (JSON) | 1 u | shard-output incl. kandidaten | 2–20 KB |
| ARS:LOCK:{name} | string | PX per lock | mutual exclusion (owner-token) | <100 B |
| ARS:SIGNAL:{signalId} | string (JSON) | geen | permanent signaalrecord | ~1,2 KB |
| ARS:SIGNALS:BY_TIME | zset | geen | tijdsindex alle signalen | ~50 B/record |
| ARS:SIGNALS:OPEN | set | geen | ids open metingen | klein |
| ARS:SIGNALS:CLOSED | zset | geen | close-tijdindex | ~50 B/record |
| ARS:POSITION:{signalId} | string (JSON) | 7 d | state open virtuele positie | ~400 B |
| ARS:CD:{sym}:{side} | string | 24 u | cooldown (laatste signaal-openTime) | <50 B |
| ARS:FPRINT:{fingerprint} | string | 7 d | unieke-setup-dedupe | <100 B |
| ARS:FAMILY:{ns}:{familyId} | string (JSON) | geen | familie-statistiek | ~1,5 KB × 8 |
| ARS:FAMILY:STATUSLOG | list (LTRIM 200) | geen | statuswijzigingen | ≤40 KB |
| ARS:DISCORD:DEDUPE:{id}:{kanaal} | string | 7 d | publicatie-dedupe | <50 B |
| ARS:DISCORD:LOGS | list (LTRIM 100) | geen | leveringslog | ≤20 KB |
| ARS:DAILY:{yyyy-mm-dd} | string (JSON) | geen | dag-digest | ~2 KB |
| ARS:DAILY:INDEX | zset | geen | digest-index | klein |
| ARS:HASH:HEAD | string | geen | kop van de hashketen | 64 B |
| ARS:HASH:DAY:{yyyy-mm-dd} | list | 8 d | daghashes t.b.v. manifest | 64 B/record |
| ARS:PUBCOUNT:{yyyy-mm-dd} | string | 48 u | dagpublicatieteller | <10 B |
| ARS:RUN:{kind} | string (JSON) | geen | laatste run per jobsoort | <1 KB |
| ARS:RUNS:{kind} | list (LTRIM 30) | geen | runhistorie | ≤30 KB per kind |
| ARS:WAITLIST | set | geen | e-mailadressen | ~40 B/lid |
| ARS:RATE:{bucket} | string | 1 u | rate limiting (login/waitlist) | <10 B |
| ARS:BILL:CUST:{customerId} | string (JSON) | geen | Stripe-customer → Discord + status | <200 B |
| ARS:BILL:DISCORD:{discordId} | string | geen | Discord → Stripe-customer | <60 B |
| ARS:BILL:EVENT:{eventId} | string | 30 d | webhook-idempotentie | <10 B |

Groeimodel: 20–60 kwalificerende signalen/dag → ~30–90 KB/dag permanent (record + indexen +
hashes) → **10–35 MB/jaar**. Hot-data blijft daarmee het eerste jaar binnen het 25 MB-budget;
archivering >1 jaar is geregistreerd als auditpunt A6.
