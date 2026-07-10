import { rpipe, jget } from "../storage/redis.js";
import { K } from "../storage/keys.js";

export async function saveRun(kind, data) {
  const record = { kind, ...data };
  await rpipe([
    ["SET", K.run(kind), JSON.stringify(record)],
    ["LPUSH", K.runHist(kind), JSON.stringify(record)],
    ["LTRIM", K.runHist(kind), 0, 29],
  ]);
  return record;
}

export const lastRun = (kind) => jget(K.run(kind));
