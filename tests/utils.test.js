import { test } from "node:test";
import assert from "node:assert/strict";

import { clamp, isNum, round, tickDecimals, priceStr } from "../src/utils/math.js";
import { floorTo, utcDate, iso, minutesBetween } from "../src/utils/time.js";
import { sha256Hex, uuid, stableStringify, safeEqual, fnv1a } from "../src/utils/hash.js";
import { mulberry32, seededRng } from "../src/utils/prng.js";
import { mapLimit } from "../src/utils/pool.js";

test("math: clamp / isNum / round", () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
  assert.equal(isNum(1), true);
  assert.equal(isNum(NaN), false);
  assert.equal(isNum(Infinity), false);
  assert.equal(isNum("1"), false);
  assert.equal(round(1.2345, 2), 1.23);
  assert.equal(round(null), null);
});

test("math: tickDecimals / priceStr", () => {
  assert.equal(tickDecimals(0.5), 1);
  assert.equal(tickDecimals(0.001), 3);
  assert.equal(tickDecimals(1e-8), 8);
  assert.equal(priceStr(1.5, 0.5), "1.5");
  assert.equal(priceStr(1.23456, 0.01), "1.23");
  assert.equal(priceStr(null, 0.01), "—");
});

test("time: floorTo / utcDate / iso / minutesBetween", () => {
  assert.equal(floorTo(1000, 300), 900);
  assert.equal(floorTo(900000, 900000), 900000);
  assert.equal(utcDate(0), "1970-01-01");
  assert.equal(iso(0), "1970-01-01T00:00:00.000Z");
  assert.equal(minutesBetween(0, 90000), 2); // afronding op hele minuten
});

test("hash: sha256Hex / stableStringify / safeEqual / fnv1a / uuid", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
  assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }));
  assert.equal(stableStringify({ a: [1, { z: 1, y: 2 }] }), '{"a":[1,{"y":2,"z":1}]}');
  assert.equal(safeEqual("secret", "secret"), true);
  assert.equal(safeEqual("secret", "Secret"), false);
  assert.equal(safeEqual("kort", "veellanger"), false);
  assert.equal(fnv1a("test"), fnv1a("test"));
  assert.notEqual(fnv1a("test"), fnv1a("Test"));
  assert.match(uuid(), /^[0-9a-f-]{36}$/);
  assert.notEqual(uuid(), uuid());
});

test("prng: deterministisch en binnen [0,1)", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 5; i++) {
    const va = a();
    assert.equal(va, b());
    assert.ok(va >= 0 && va < 1);
  }
  const r1 = seededRng("key");
  const r2 = seededRng("key");
  assert.equal(r1(), r2());
});

test("pool: mapLimit begrenst concurrency, isoleert fouten, bewaart volgorde", async () => {
  let active = 0;
  let maxActive = 0;
  const items = [...Array(10).keys()];
  const res = await mapLimit(items, 3, async (x) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 10));
    active--;
    if (x === 4) throw new Error("boom");
    return x * 2;
  });
  assert.ok(maxActive <= 3, `maxActive was ${maxActive}`);
  assert.deepEqual(res[0], { ok: true, value: 0 });
  assert.equal(res[4].ok, false);
  assert.match(res[4].error, /boom/);
  assert.deepEqual(res[9], { ok: true, value: 18 });
});
