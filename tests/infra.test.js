import { test } from "node:test";
import assert from "node:assert/strict";

import { acquireLock, releaseLock } from "../src/security/locks.js";
import { rcmd } from "../src/storage/redis.js";
import { K } from "../src/storage/keys.js";
import { uuid } from "../src/utils/hash.js";

/**
 * Redis ondersteunt beide environment-variable naamsets:
 *
 * Nieuwe Upstash-naamgeving:
 * - UPSTASH_REDIS_REST_URL
 * - UPSTASH_REDIS_REST_TOKEN
 *
 * Bestaande Vercel KV-naamgeving:
 * - KV_REST_API_URL
 * - KV_REST_API_TOKEN
 *
 * De read-only token wordt bewust niet geaccepteerd,
 * omdat deze infra-tests naar Redis schrijven.
 */
function hasEnvValue(name) {
  const value = process.env[name];

  return (
    value !== undefined &&
    value !== null &&
    String(value).trim() !== ""
  );
}

const hasRedisUrl =
  hasEnvValue("UPSTASH_REDIS_REST_URL") ||
  hasEnvValue("KV_REST_API_URL");

const hasRedisToken =
  hasEnvValue("UPSTASH_REDIS_REST_TOKEN") ||
  hasEnvValue("KV_REST_API_TOKEN");

const hasRedis =
  hasRedisUrl &&
  hasRedisToken;

const skipMsg = hasRedis
  ? false
  : [
      "Redis REST-config ontbreekt — infra-tests overgeslagen.",
      "Vereist:",
      "UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN",
      "of",
      "KV_REST_API_URL + KV_REST_API_TOKEN",
    ].join(" ");

test(
  "lock: owner-token, mutual exclusion, veilige release",
  { skip: skipMsg },
  async () => {
    const name = `test:${uuid()}`;

    try {
      const t1 = await acquireLock(
        name,
        15000
      );

      assert.ok(
        t1,
        "eerste acquire moet slagen"
      );

      const t2 = await acquireLock(
        name,
        15000
      );

      assert.equal(
        t2,
        null,
        "tweede acquire moet falen zolang lock leeft"
      );

      await releaseLock(
        name,
        "verkeerd-token"
      );

      const t3 = await acquireLock(
        name,
        15000
      );

      assert.equal(
        t3,
        null,
        "release met verkeerd token mag lock niet vrijgeven"
      );

      await releaseLock(
        name,
        t1
      );

      const t4 = await acquireLock(
        name,
        15000
      );

      assert.ok(
        t4,
        "na correcte release moet acquire weer slagen"
      );

      await releaseLock(
        name,
        t4
      );
    } finally {
      // Scratch-opruiming; verwijdert nooit productie-keys.
      await rcmd(
        "DEL",
        K.lock(name)
      );
    }
  }
);

test(
  "lock: retry verkrijgt lock na TTL-expiratie",
  { skip: skipMsg },
  async () => {
    const name = `test:${uuid()}`;

    try {
      // Korte TTL voor de expiratie-test.
      const t1 = await acquireLock(
        name,
        400
      );

      assert.ok(t1);

      // 6 retries × 150 ms is langer dan de TTL van 400 ms.
      const t2 = await acquireLock(
        name,
        5000,
        6,
        150
      );

      assert.ok(
        t2,
        "retry moet slagen zodra de stale lock verloopt"
      );

      await releaseLock(
        name,
        t2
      );
    } finally {
      await rcmd(
        "DEL",
        K.lock(name)
      );
    }
  }
);

test(
  "dedupe: SET NX is exactly-once",
  { skip: skipMsg },
  async () => {
    const key = `ARS:TEST:DEDUPE:${uuid()}`;

    try {
      const first = await rcmd(
        "SET",
        key,
        "1",
        "NX",
        "EX",
        60
      );

      assert.equal(
        first,
        "OK"
      );

      const second = await rcmd(
        "SET",
        key,
        "1",
        "NX",
        "EX",
        60
      );

      assert.equal(
        second,
        null,
        "tweede NX-set moet null geven (duplicaat geweigerd)"
      );
    } finally {
      await rcmd(
        "DEL",
        key
      );
    }
  }
);

test(
  "pipeline-integriteit: INCR is atomair over parallelle calls",
  { skip: skipMsg },
  async () => {
    const key = `ARS:TEST:CTR:${uuid()}`;

    try {
      await Promise.all(
        Array.from(
          { length: 10 },
          () => rcmd(
            "INCR",
            key
          )
        )
      );

      const value = await rcmd(
        "GET",
        key
      );

      assert.equal(
        Number(value),
        10
      );
    } finally {
      await rcmd(
        "DEL",
        key
      );
    }
  }
);