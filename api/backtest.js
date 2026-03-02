/* EOF: /api/backtest.js */
const { runBacktest } = require("./forest-backtest");

async function main() {
  console.log("=== Backtest: Trend-only Forest (1D) ===");
  await runBacktest();
}

module.exports = { main };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}