import { NextResponse } from 'next/server';
import axios from 'axios';
import { calculateCryptoCroc } from '../../../lib/cryptocroc';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

export async function GET() {
    try {
        const tickerRes = await axios.get('https://api.mexc.com/api/v3/ticker/24hr');
        const topCoins = tickerRes.data
            .filter(t => t.symbol.endsWith('USDT')) 
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)) 
            .slice(0, 300) 
            .map(t => t.symbol);

        let results = [];
        const batchSize = 20;

        for (let i = 0; i < topCoins.length; i += batchSize) {
            const batch = topCoins.slice(i, i + batchSize);
            
            const promises = batch.map(async (symbol) => {
                try {
                    const res = await axios.get(`https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=60m&limit=150`);
                    if (res.data && res.data.length > 50) {
                        const indicatorData = calculateCryptoCroc(res.data);
                        const rawRsi = parseFloat(indicatorData.rsi);
                        const score = Math.abs(rawRsi - 50) * 2; 

                        return { symbol, score, ...indicatorData };
                    }
                } catch (e) { return null; } 
            });

            const batchResults = await Promise.all(promises);
            // Alleen coins met een echt signaal (Long of Short) mogen door
            const validSetups = batchResults.filter(r => r && r.signal !== "NEUTRAAL");
            results.push(...validSetups);
        }

        const top10 = results
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        return NextResponse.json({ success: true, data: top10 });

    } catch (error) {
        return NextResponse.json({ success: false, error: "Fout bij scannen" }, { status: 500 });
    }
}
