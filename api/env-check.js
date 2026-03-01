const logger = require("./_lib/logger");

function check() {
  const optional = ["GLASSNODE_API_KEY", "ALPHA_VANTAGE_KEY"];
  for (const k of optional) {
    if (!process.env[k]) logger.warn(`Optioneel mist: ${k}`);
  }
  logger.info("env-check klaar");
  return true;
}

if (require.main === module) check();

module.exports = { check };