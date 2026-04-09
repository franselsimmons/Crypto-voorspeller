import { NextResponse } from 'next/server';
import axios from 'axios';
import { calculateCryptoCroc } from '../../../lib/cryptocroc';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

const NON_CRYPTO = ['USOIL', 'UKOIL', 'COPSTOCK', 'CHECK', 'ESP', 'BTW', 'ATH', 'LA', 'APR', 'BMT', 'SP500', 'NAS100', 'CRMSTOCK', 'TSLA', 'AAPL'];

async function getBtcTrend(interval) {
    try {
        const res = await axios.get(`https://contract.mexc.com/api/v1/contract/kline/BTC_USDT?interval=${interval}&limit=100`);
        const closes = res.data.data.close.map(c => parseFloat(c));
        const k = 2 / (50 + 1);
        let ema = closes[0];
        for (let i = 1; i < closes.length; i++) { ema = (closes[i] - ema) * k + ema; }
        return closes[closes.length - 1] >= ema ? 'long' : 'short';
    } catch (e) { return 'long'; }
}

function processData(dataObj, btcTrend, fundingRate) {
    if (!dataObj || !dataObj.close || dataObj.close.length < 150) return null;
    const formatted = dataObj.close.map((_, j) => [
        dataObj.time[j], dataObj.open[j], dataObj.high[j], 
        dataObj.low[j], dataObj.close[j], dataObj.vol[j]
    ]);
    return calculateCryptoCroc(formatted, btcTrend, fundingRate);
}

function applyStrictFilter(setups, btcTrend) {
    let valid = setups.filter(Boolean);
    if (btcTrend === 'long') {
        return valid.filter(c => c.type === 'long' && parseFloat(c.rsi) <= 35)
                    .sort((a, b) => b.score - a.score).slice(0, 5); // Hoogste score (met squeeze bonus) eerst
    } else {
        return valid.filter(c => c.type === 'short' && parseFloat(c.rsi) >= 65)
                    .sort((a, b) => b.score - a.score).slice(0, 5);
    }
}

export async function GET() {
    try {
        const [btc15m, btc1h, btc4h] = await Promise.all([
            getBtcTrend('Min15'), getBtcTrend('Min60'), getBtcTrend('Min240')
        ]);

        const contractRes = await axios.get('https://contract.mexc.com/api/v1/contract/ticker');
        const allContracts = contractRes.data.data || [];
        
        // Sla de funding rate op in een database (Map)
        const fundingMap = {};
        const futuresCoins = allContracts
            .filter(t => {
                const symbol = t.symbol.split('_')[0];
                if(t.symbol.endsWith('_USDT') && !NON_CRYPTO.includes(symbol)) {
                    fundingMap[t.symbol] = parseFloat(t.fundingRate || 0);
                    return true;
                }
                return false;
            })
            .sort((a, b) => parseFloat(b.amount24) - parseFloat(a.amount24))
            .map(t => t.symbol);

        let results15m = [], results1h = [], results4h = [];
        
        for (let i = 0; i < futuresCoins.length; i += 10) {
            const batch = futuresCoins.slice(i, i + 10);
            const promises = batch.map(async (symbol) => {
                try {
                    const [res15, res60, res240] = await Promise.all([
                        axios.get(`https://contract.mexc.com/api/v1/contract/kline/${symbol}?interval=Min15&limit=200`),
                        axios.get(`https://contract.mexc.com/api/v1/contract/kline/${symbol}?interval=Min60&limit=200`),
                        axios.get(`https://contract.mexc.com/api/v1/contract/kline/${symbol}?interval=Min240&limit=200`)
                    ]);
                    const fr = fundingMap[symbol];
                    return {
                        m15: { symbol, ...processData(res15.data.data, btc15m, fr) },
                        h1: { symbol, ...processData(res60.data.data, btc1h, fr) },
                        h4: { symbol, ...processData(res240.data.data, btc4h, fr) }
                    };
                } catch (e) { return null; }
            });

            const batchRes = (await Promise.all(promises)).filter(Boolean);
            batchRes.forEach(r => {
                if(r.m15.type !== "neutral") results15m.push(r.m15);
                if(r.h1.type !== "neutral") results1h.push(r.h1);
                if(r.h4.type !== "neutral") results4h.push(r.h4);
            });
        }

        return NextResponse.json({ 
            success: true, 
            data: { 
                m15: applyStrictFilter(results15m, btc15m), 
                h1: applyStrictFilter(results1h, btc1h), 
                h4: applyStrictFilter(results4h, btc4h) 
            }, 
            btcTrends: { m15: btc15m, h1: btc1h, h4: btc4h } 
        });
        
    } catch (e) { return NextResponse.json({ success: false, error: e.message }); }
}
