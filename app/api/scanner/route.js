import { NextResponse } from 'next/server';
import axios from 'axios';
import { calculateCryptoCroc } from '../../../lib/cryptocroc';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

const BLOCKED_COINS = ['PEPEUSDT', 'DOGEUSDT', 'SHIBUSDT', 'FLOKIUSDT', 'WIFUSDT', 'BONKUSDT'];

export async function GET() {
    try {
        let btcTrend = 'neutral';
        try {
            const btcRes = await axios.get(`https://api.mexc.com/api/v3/klines?symbol=BTCUSDT&interval=60m&limit=100`);
            const btcCloses = btcRes.data.map(k => parseFloat(k[4]));
            const k = 2 / (50 + 1);
            let ema = btcCloses[0];
            for (let i = 1; i < btcCloses.length; i++) { ema = (btcCloses[i] - ema) * k + ema; }
            btcTrend = btcCloses[btcCloses.length - 1] >= ema ? 'long' : 'short';
        } catch (e) { console.error("Kon BTC structuur niet ophalen"); }

        const tickerRes = await axios.get('https://api.mexc.com/api/v3/ticker/24hr');
        const topCoins = tickerRes.data
            .filter(t => t.symbol.endsWith('USDT') && t.symbol !== 'BTCUSDT' && !BLOCKED_COINS.includes(t.symbol)) 
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)) 
            .slice(0, 150) 
            .map(t => t.symbol);

        let results = [];
        for (let i = 0; i < topCoins.length; i += 20) {
            const batch = topCoins.slice(i, i + 20);
            const promises = batch.map(async (symbol) => {
                try {
                    const res = await axios.get(`https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=60m&limit=250`);
                    if (res.data && res.data.length > 200) {
                        const data = calculateCryptoCroc(res.data, btcTrend);
                        return data.isActionable ? { symbol, ...data } : null;
                    }
                } catch (e) { return null; }
            });
            const res = await Promise.all(promises);
            results.push(...res.filter(Boolean));
        }

        const topPicks = results.sort((a, b) => b.score - a.score).slice(0, 10);
        return NextResponse.json({ success: true, data: topPicks, btcTrend });
    } catch (e) { return NextResponse.json({ success: false, error: "Fout bij scannen" }, { status: 500 }); }
}
