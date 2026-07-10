import { sha256Hex, stableStringify } from "./utils/hash.js";

function env(name, def) {
  const v = process.env[name];
  return v === undefined || v === "" ? def : v;
}

export function requireEnv(names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`Ontbrekende env: ${missing.join(", ")}`);
}

/** ARS-U parameters — 1-op-1 met Pine v6.1 defaults. Nooit elders hardcoden. */
export const ARS_PARAMS = Object.freeze({
  atrLen: 14, volWin: 200, erLen: 20,
  trendERrank: 55, compRankTh: 25, extremeTh: 93,
  emaFastLen: 21, emaSlowLen: 50, slopeBars: 3,
  pivLen: 4, sweepMem: 8, failWin: 6, breakMem: 10,
  rsiLen: 14, resetWin: 6, resetLvl: 44,
  volLen: 30, boVolMult: 1.4, flowLen: 13,
  zoneWin: 5, rangeLen: 20, compMem: 8,
  maxExtATR: 2.5, bufMult: 0.35, minStopATR: 0.5, maxStopATR: 3.0,
  minRR: 1.5, fallbackRoomRR: 2.0, tp1R: 1.0, tp2R: 2.0,
  thElite: 90, thA: 80, cooldownBars: 8,
});

let memo = null;

export function cfg() {
  if (memo) return memo;
  const parameterHash = sha256Hex(stableStringify(ARS_PARAMS)).slice(0, 12);
  memo = Object.freeze({
    appUrl: env("APP_URL", "http://localhost:3000"),
    cronSecret: env("CRON_SECRET", ""),
    adminSecret: env("ADMIN_SECRET", ""),
    redisUrl: env("UPSTASH_REDIS_REST_URL", ""),
    redisToken: env("UPSTASH_REDIS_REST_TOKEN", ""),
    bitgetBase: env("BITGET_BASE_URL", "https://api.bitget.com"),
    webhooks: {
      setups: env("DISCORD_SETUPS_WEBHOOK", ""),
      verified: env("DISCORD_VERIFIED_WEBHOOK", ""),
      digest: env("DISCORD_DIGEST_WEBHOOK", ""),
      status: env("DISCORD_STATUS_WEBHOOK", ""),
    },
    collectingMode: env("COLLECTING_MODE", "true") === "true",
    paidLaunch: env("PAID_LAUNCH_ENABLED", "false") === "true",
    monthlyPriceEur: Number(env("MONTHLY_PRICE_EUR", "99")),
    maxUniverse: Number(env("MAX_UNIVERSE_SIZE", "150")),
    minDailyVolumeUsd: Number(env("MIN_DAILY_VOLUME_USD", "5000000")),
    maxPubsPerDay: Number(env("MAX_PUBLICATIONS_PER_DAY", "12")),
    scanConcurrency: Number(env("SCAN_CONCURRENCY", "6")),
    scanShards: Number(env("SCAN_SHARDS", "5")),
    indicatorVersion: env("INDICATOR_VERSION", "ARS-U-6.1"),
    parameterVersion: env("PARAMETER_VERSION", "p1"),
    parameterHash,
    engineVersion: "1.0.0",
    timeoutMinutes: Number(env("POSITION_TIMEOUT_MINUTES", "2880")),
    costR: Number(env("COST_R", "0.15")),
    tfMs: 15 * 60 * 1000,
    htfMs: 4 * 60 * 60 * 1000,
    candleLimit: 340,
    htfCandleLimit: 200,
    warmupBars: 260,
    minTotalPerFamily: 30,
    kPrior: 10,
    bootstrapB: 4000,
    bhAlpha: 0.10,
    namespace: null,
  });
  memo = Object.freeze({ ...memo, namespace: `${memo.indicatorVersion}:${memo.parameterHash}` });
  return memo;
}

export const FAMILY_IDS = Object.freeze(
  ["LONG", "SHORT"].flatMap((d) =>
    ["PULLBACK", "BREAKOUT"].flatMap((t) => ["A", "ELITE"].map((k) => `${d}:${t}:${k}`))
  )
);

export function familyId(direction, setupType, cls) {
  return `${direction}:${setupType}:${cls}`;
}
