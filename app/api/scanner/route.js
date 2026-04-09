import { NextResponse } from 'next/server';
import axios from 'axios';
import { calculateCryptoCroc } from '../../../lib/cryptocroc';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

export async function GET() {
    try {
        // 1. BTC Regime via Futures (Fallback naar 'long' als API hapert)
        let btcTrend = 'long';
        try {
            const btcRes = await axios.get(`https://fapi.mexc.com/api/v1/contract/kline/BTC_USDT?interval=Min60&limit=100`);
            const btcCloses = btcRes.data.data.map(k => parseFloat(k[4]));
            const currentBtc = btcCloses[btcCloses.length - 1];
            
            const k = 2 / (50 + 1);
            let btcEma = btcCloses[0];
            for (let i = 1; i < btcCloses.length; i++) { btcEma = (btcCloses[i] - btcEma) * k + btcEma; }
            btcTrend = currentBtc >= btcEma ? 'long' : 'short';
        } catch (e) { console.error("BTC API Delay - Using Default Trend"); }

        // 2. Fetch Active Futures Contracts
        const contractRes = await axios.get('https://fapi.mexc.com/api/v1/contract/ticker');
        const allContracts = contractRes.data.data || [];
        
        const futuresCoins = allContracts
            .filter(t => t.symbol.endsWith('_USDT'))
            .sort((a, b) => parseFloat(b.amount24) - parseFloat(a.amount24))
            .slice(0, 80) // Iets minder coins voor snellere laadtijd
            .map(t => t.symbol);

        let results = [];
        // Scan in batches van 10 voor stabiliteit
        for (let i = 0; i < futuresCoins.length; i += 10) {
            const batch = futuresCoins.slice(i, i + 10);
            const promises = batch.map(async (symbol) => {
                try {
                    const res = await axios.get(`https://fapi.mexc.com/api/v1/contract/kline/${symbol}?interval=Min60&limit=200`);
                    const klineData = res.data.data;
                    if (klineData && klineData.length > 150) {
                        // Formatteer naar: [time, open, high, low, close, volume]
                        const formatted = klineData.map(k => [k[0], k[1], k[2], k[3], k[4], k[5]]);
                        const analysis = calculateCryptoCroc(formatted, btcTrend);
                        return analysis.isActionable ? { symbol, ...analysis } : null;
                    }
                } catch (e) { return null; }
            });
            const batchRes = await Promise.all(promises);
            results.push(...batchRes.filter(Boolean));
        }

        const top10 = results.sort((a, b) => b.score - a.score).slice(0, 10);
        return NextResponse.json({ success: true, data: top10, btcTrend });
    } catch (e) { 
        console.error("Critical Scanner Error:", e.message);
        return NextResponse.json({ success: false, error: e.message }); 
    }
}
