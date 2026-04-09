import { NextResponse } from 'next/server';
import axios from 'axios';
import { calculateCryptoCroc } from '../../../lib/cryptocroc';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

// Strikte blocklist voor olie en niet-crypto assets
const NON_CRYPTO = [
    'USOIL', 'UKOIL', 'COPSTOCK', 'CHECK', 'ESP', 'BTW', 'ATH', 'LA', 'APR', 'BMT', 'SP500', 'NAS100'
];

export async function GET() {
    try {
        let btcTrend = 'long';
        const btcRes = await axios.get(`https://contract.mexc.com/api/v1/contract/kline/BTC_USDT?interval=Min60&limit=100`);
        const btcCloses = btcRes.data.data.close.map(c => parseFloat(c));
        const currentBtc = btcCloses[btcCloses.length - 1];
        const k = 2 / (50 + 1);
        let btcEma = btcCloses[0];
        for (let i = 1; i < btcCloses.length; i++) { btcEma = (btcCloses[i] - btcEma) * k + btcEma; }
        btcTrend = currentBtc >= btcEma ? 'long' : 'short';

        const tickerRes = await axios.get('https://contract.mexc.com/api/v1/contract/ticker');
        const allContracts = tickerRes.data.data || [];
        
        const futuresCoins = allContracts
            .filter(t => {
                const symbol = t.symbol.split('_')[0];
                return t.symbol.endsWith('_USDT') && !NON_CRYPTO.includes(symbol);
            })
            .sort((a, b) => parseFloat(b.amount24) - parseFloat(a.amount24))
            .map(t => t.symbol);

        let results = [];
        for (let i = 0; i < futuresCoins.length; i += 25) {
            const batch = futuresCoins.slice(i, i + 25);
            const promises = batch.map(async (symbol) => {
                try {
                    const res = await axios.get(`https://contract.mexc.com/api/v1/contract/kline/${symbol}?interval=Min60&limit=200`);
                    const dataObj = res.data.data;
                    if (dataObj && dataObj.close && dataObj.close.length > 150) {
                        const formatted = dataObj.close.map((_, j) => [
                            dataObj.time[j], dataObj.open[j], dataObj.high[j], 
                            dataObj.low[j], dataObj.close[j], dataObj.vol[j]
                        ]);
                        const analysis = calculateCryptoCroc(formatted, btcTrend);
                        return { symbol, ...analysis };
                    }
                    return null;
                } catch (e) { return null; }
            });
            const batchRes = await Promise.all(promises);
            results.push(...batchRes.filter(Boolean));
        }

        // --- SORTEREN OP BASIS VAN JOUW EISEN ---
        let sorted = results.sort((a, b) => {
            // Eerst sorteren op score (Confluence met BTC)
            if (b.score !== a.score) return b.score - a.score;
            // Als scores gelijk zijn, sorteer op RSI extremen
            return btcTrend === 'long' ? parseFloat(a.rsi) - parseFloat(b.rsi) : parseFloat(b.rsi) - parseFloat(a.rsi);
        });

        return NextResponse.json({ success: true, data: sorted.slice(0, 10), btcTrend });
    } catch (e) { return NextResponse.json({ success: false, error: e.message }); }
}
