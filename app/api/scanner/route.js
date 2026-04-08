import { NextResponse } from 'next/server';
import axios from 'axios';
import { calculateCryptoCroc } from '../../../lib/cryptocroc';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

export async function GET() {
    try {
        let btcTrend = 'neutral';
        try {
            const btcRes = await axios.get(`https://api.mexc.com/api/v3/klines?symbol=BTCUSDT&interval=60m&limit=250`);
            const btcCloses = btcRes.data.map(k => parseFloat(k[4]));
            const currentBtcPrice = btcCloses[btcCloses.length - 1];
            const pastBtcPrice = btcCloses[btcCloses.length - 10]; 
            btcTrend = currentBtcPrice >= pastBtcPrice ? 'long' : 'short';
        } catch (e) { console.error("Kon BTC trend niet ophalen"); }

        const tickerRes = await axios.get('https://api.mexc.com/api/v3/ticker/24hr');
        const topCoins = tickerRes.data
            .filter(t => t.symbol.endsWith('USDT') && t.symbol !== 'BTCUSDT') 
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)) 
            .slice(0, 300) 
            .map(t => t.symbol);

        let results = [];
        const batchSize = 20;

        for (let i = 0; i < topCoins.length; i += batchSize) {
            const batch = topCoins.slice(i, i + batchSize);
            
            const promises = batch.map(async (symbol) => {
                try {
                    const res = await axios.get(`https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=60m&limit=250`);
                    if (res.data && res.data.length > 200) {
                        const indicatorData = calculateCryptoCroc(res.data);
                        
                        // We gooien alleen NEUTRAAL weg. Alle long/short trades mogen door.
                        if (indicatorData.signal === "NEUTRAAL") return null;

                        const rawRsi = parseFloat(indicatorData.rsi);
                        const baseScore = Math.abs(rawRsi - 50) * 2; 
                        const finalScore = baseScore * indicatorData.scoreMultiplier;

                        return { symbol, score: finalScore, ...indicatorData };
                    }
                } catch (e) { return null; } 
            });

            const batchResults = await Promise.all(promises);
            results.push(...batchResults.filter(Boolean));
        }

        // We sturen de VOLLEDIGE lijst (gesorteerd) terug naar de website, niet slechts 10.
        const sortedResults = results.sort((a, b) => b.score - a.score);
        return NextResponse.json({ success: true, data: sortedResults, btcTrend: btcTrend });

    } catch (error) {
        return NextResponse.json({ success: false, error: "Fout bij scannen" }, { status: 500 });
    }
}
