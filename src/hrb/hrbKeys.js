const NS = "HRB";
export const HK = {
  universe: () => `${NS}:UNIVERSE:LATEST`,
  scanCycle: (c) => `${NS}:SCAN:CYCLE:${c}`,
  scanShard: (c, s) => `${NS}:SCAN:SHARD:${c}:${s}`,
  signal: (id) => `${NS}:SIGNAL:${id}`,
  byTime: () => `${NS}:SIGNALS:BY_TIME`,
  open: () => `${NS}:SIGNALS:OPEN`,
  closed: () => `${NS}:SIGNALS:CLOSED`,
  position: (id) => `${NS}:POSITION:${id}`,
  cooldown: (sym, side) => `${NS}:CD:${sym}:${side}`,
  fingerprint: (fp) => `${NS}:FPRINT:${fp}`,
  family: (ns, fid) => `${NS}:FAMILY:${ns}:${fid}`,
  familyStatusLog: () => `${NS}:FAMILY:STATUSLOG`,
  pubCount: (d) => `${NS}:PUBCOUNT:${d}`,
  run: (kind) => `${NS}:RUN:${kind}`,
  runHist: (kind) => `${NS}:RUNS:${kind}`,
};
export const HTTL = {
  universe: 7200, shard: 3600, cycle: 3600,
  cooldown: 86400, fingerprint: 7 * 86400, position: 7 * 86400, pubCount: 2 * 86400,
};
