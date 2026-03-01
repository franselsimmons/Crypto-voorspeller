const { runBacktest } = require("./forest-backtest");

runBacktest().catch((e) => {
  console.error(e);
  process.exit(1);
});