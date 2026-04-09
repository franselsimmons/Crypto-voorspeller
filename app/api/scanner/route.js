import { NextResponse } from 'next/server';
import axios from 'axios';
import { calculateCryptoCroc } from '../../../lib/cryptocroc';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

// Blocklist voor coins die te volatiel of onbetrouwbaar zijn voor futures
const BLOCKED_COINS = ['PEPE_USDT', 'DOGE_USDT', 'SHIB_USDT', 'LUNC_USDT', 'USTC_USDT'];

export async function GET() {
    try {
        // 1. BTC Trend via Futures API
        let btcTrend = 'neutral';
        try {
            const btcRes = await axios.get(`https://fapi.mexc.com/api/v1/contract/kline/BTC_USDT?interval=Min60&limit=100`);
            const btcCloses = btcRes.data.data.map(k => parseFloat(k[4])); // MEXC Futures format is anders
            const k = 2 / (50 + 1);
            let ema = btcCloses[0];
            for (let i = 1; i < btcCloses.length; i++) { ema = (btcCloses[i] - ema) * k + ema; }
            btcTrend = btcCloses[btcCloses.length - 1] >= ema ? 'long' : 'short';
        } catch (e) { console.error("BTC Futures Fetch Error"); }

        // 2. Haal ALLE actieve Futures contracten op
        const contractRes = await axios.get('https://fapi.mexc.com/api/v1/contract/ticker');
        const futuresCoins = contractRes.data.data
            .filter(t => t.symbol.endsWith('_USDT') && !BLOCKED_COINS.includes(t.symbol))
            .sort((a, b) => parseFloat(b.amount24) - parseFloat(a.amount24)) // Sorteer op volume
            .slice(0, 100) // Pak de top 100 meest liquide futures
            .map(t => t.symbol);

        let results = [];
        // We scannen in batches om de API niet te overbelasten
        for (let i = 0; i < futuresCoins.length; i += 15) {
            const batch = futuresCoins.slice(i, i + 15);
            const promises = batch.map(async (symbol) => {
                try {
                    // Let op: Futures kline endpoint gebruikt underscore (bijv. BTC_USDT)
                    const res = await axios.get(`https://fapi.mexc.com/api/v1/contract/kline/${symbol}?interval=Min60&limit=250`);
                    const klineData = res.data.data;
                    
                    if (klineData && klineData.length > 200) {
                        // Converteer MEXC Futures format naar ons rekenformat
                        const formattedKlines = klineData.map(k => [
                            k[0], // Time
                            k[1], // Open
                            k[2], // High
                            k[3], // Low
                            k[4], // Close
                            k[5]  // Vol
                        ]);
                        
                        const data = calculateCryptoCroc(formattedKlines, btcTrend);
                        return data.isActionable ? { symbol, ...data } : null;
                    }
                } catch (e) { return null; }
            });
            const res = await Promise.all(promises);
            results.push(...res.filter(Boolean));
        }

        const topPicks = results.sort((a, b) => b.score - a.score).slice(0, 10);
        return NextResponse.json({ success: true, data: topPicks, btcTrend });
    } catch (e) { 
        return NextResponse.json({ success: false, error: e.message }); 
    }
}
