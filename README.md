# Bitcoin Predictor (Daily)

## Install
npm install

## Train (offline)
npm run train

## Backtest (offline)
npm run backtest

## Feature importance (offline)
npm run importance

## Deploy (Vercel)
- Push naar GitHub
- Import in Vercel
- Zorg dat `models/rf_bull.json` en `models/rf_bear.json` in je repo staan (na training committen)

## Endpoints
- GET /api/health
- GET /api/price
- GET /api/indicators
- POST /api/predict   body: { "model": "forest" }