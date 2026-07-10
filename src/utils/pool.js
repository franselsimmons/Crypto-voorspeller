/** Bounded concurrency met per-item foutisolatie. Nooit Promise.all over het universe. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = { ok: true, value: await fn(items[idx], idx) };
      } catch (err) {
        results[idx] = { ok: false, error: String(err?.message || err) };
      }
    }
  });
  await Promise.all(workers);
  return results;
}
