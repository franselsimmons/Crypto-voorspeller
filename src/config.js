import { sha256Hex, stableStringify } from "./utils/hash.js";

/**
 * Ondersteunde aliases voor environment variables.
 *
 * Hierdoor werken zowel:
 * - Nieuwe Upstash-naamgeving
 * - Bestaande Vercel KV-naamgeving
 *
 * De read-only token wordt bewust niet gebruikt,
 * omdat het platform ook naar Redis schrijft.
 */
const ENV_ALIASES = Object.freeze({
  UPSTASH_REDIS_REST_URL: Object.freeze([
    "KV_REST_API_URL",
  ]),

  UPSTASH_REDIS_REST_TOKEN: Object.freeze([
    "KV_REST_API_TOKEN",
  ]),

  KV_REST_API_URL: Object.freeze([
    "UPSTASH_REDIS_REST_URL",
  ]),

  KV_REST_API_TOKEN: Object.freeze([
    "UPSTASH_REDIS_REST_TOKEN",
  ]),
});

function getEnvNames(name) {
  return [
    name,
    ...(ENV_ALIASES[name] || []),
  ];
}

function readEnv(name) {
  const names = getEnvNames(name);

  for (const candidate of names) {
    const value = process.env[candidate];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return undefined;
}

function env(name, def) {
  const value = readEnv(name);

  return value === undefined
    ? def
    : value;
}

export function requireEnv(names) {
  const missing = names
    .filter((name) => readEnv(name) === undefined)
    .map((name) => {
      const aliases = ENV_ALIASES[name] || [];

      if (!aliases.length) {
        return name;
      }

      return `${name} of ${aliases.join(" / ")}`;
    });

  if (missing.length > 0) {
    throw new Error(
      `Ontbrekende env: ${missing.join(", ")}`
    );
  }
}

/**
 * ARS-U parameters — 1-op-1 met Pine v6.1 defaults.
 * Nooit elders hardcoden.
 */
export const ARS_PARAMS = Object.freeze({
  atrLen: 14,
  volWin: 200,
  erLen: 20,

  trendERrank: 55,
  compRankTh: 25,
  extremeTh: 93,

  emaFastLen: 21,
  emaSlowLen: 50,
  slopeBars: 3,

  pivLen: 4,
  sweepMem: 8,
  failWin: 6,
  breakMem: 10,

  rsiLen: 14,
  resetWin: 6,
  resetLvl: 44,

  volLen: 30,
  boVolMult: 1.4,
  flowLen: 13,

  zoneWin: 5,
  rangeLen: 20,
  compMem: 8,

  maxExtATR: 2.5,
  bufMult: 0.35,
  minStopATR: 0.5,
  maxStopATR: 3.0,

  minRR: 1.5,
  fallbackRoomRR: 2.0,
  tp1R: 1.0,
  tp2R: 2.0,

  thElite: 90,
  thA: 80,
  cooldownBars: 8,
});

let memo = null;

export function cfg() {
  if (memo) {
    return memo;
  }

  const parameterHash = sha256Hex(
    stableStringify(ARS_PARAMS)
  ).slice(0, 12);

  const redisUrl = env(
    "UPSTASH_REDIS_REST_URL",
    ""
  )
    .trim()
    .replace(/\/+$/, "");

  const redisToken = env(
    "UPSTASH_REDIS_REST_TOKEN",
    ""
  ).trim();

  memo = Object.freeze({
    appUrl: env(
      "APP_URL",
      "http://localhost:3000"
    ),

    cronSecret: env(
      "CRON_SECRET",
      ""
    ),

    adminSecret: env(
      "ADMIN_SECRET",
      ""
    ),

    /**
     * Redis fallbackvolgorde:
     *
     * URL:
     * 1. UPSTASH_REDIS_REST_URL
     * 2. KV_REST_API_URL
     *
     * Token:
     * 1. UPSTASH_REDIS_REST_TOKEN
     * 2. KV_REST_API_TOKEN
     */
    redisUrl,
    redisToken,

    bitgetBase: env(
      "BITGET_BASE_URL",
      "https://api.bitget.com"
    ),

    webhooks: {
      setups: env(
        "DISCORD_SETUPS_WEBHOOK",
        ""
      ),

      verified: env(
        "DISCORD_VERIFIED_WEBHOOK",
        ""
      ),

      digest: env(
        "DISCORD_DIGEST_WEBHOOK",
        ""
      ),

      status: env(
        "DISCORD_STATUS_WEBHOOK",
        ""
      ),
    },

    collectingMode:
      env(
        "COLLECTING_MODE",
        "true"
      ) === "true",

    paidLaunch:
      env(
        "PAID_LAUNCH_ENABLED",
        "false"
      ) === "true",

    monthlyPriceEur: Number(
      env(
        "MONTHLY_PRICE_EUR",
        "99"
      )
    ),

    maxUniverse: Number(
      env(
        "MAX_UNIVERSE_SIZE",
        "150"
      )
    ),

    minDailyVolumeUsd: Number(
      env(
        "MIN_DAILY_VOLUME_USD",
        "5000000"
      )
    ),

    maxPubsPerDay: Number(
      env(
        "MAX_PUBLICATIONS_PER_DAY",
        "12"
      )
    ),

    scanConcurrency: Number(
      env(
        "SCAN_CONCURRENCY",
        "6"
      )
    ),

    scanShards: Number(
      env(
        "SCAN_SHARDS",
        "5"
      )
    ),

    indicatorVersion: env(
      "INDICATOR_VERSION",
      "ARS-U-6.1"
    ),

    parameterVersion: env(
      "PARAMETER_VERSION",
      "p1"
    ),

    parameterHash,

    engineVersion: "1.0.0",

    timeoutMinutes: Number(
      env(
        "POSITION_TIMEOUT_MINUTES",
        "2880"
      )
    ),

    costR: Number(
      env(
        "COST_R",
        "0.15"
      )
    ),

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

  memo = Object.freeze({
    ...memo,
    namespace: `${memo.indicatorVersion}:${memo.parameterHash}`,
  });

  return memo;
}

export const FAMILY_IDS = Object.freeze(
  ["LONG", "SHORT"].flatMap((direction) =>
    ["PULLBACK", "BREAKOUT"].flatMap(
      (setupType) =>
        ["A", "ELITE"].map(
          (setupClass) =>
            `${direction}:${setupType}:${setupClass}`
        )
    )
  )
);

export function familyId(
  direction,
  setupType,
  cls
) {
  return `${direction}:${setupType}:${cls}`;
}