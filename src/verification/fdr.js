/** Benjamini–Hochberg: retourneert Set van ids die de FDR-toets doorstaan. */
export function benjaminiHochberg(items, alpha) {
  const valid = items.filter((x) => x.p != null).sort((a, b) => a.p - b.p);
  const m = valid.length;
  let cutoffRank = 0;
  for (let i = 0; i < m; i++) {
    if (valid[i].p <= ((i + 1) / m) * alpha) cutoffRank = i + 1;
  }
  return new Set(valid.slice(0, cutoffRank).map((x) => x.id));
}
