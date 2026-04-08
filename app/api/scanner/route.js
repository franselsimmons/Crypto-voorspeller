import { NextResponse } from 'next/server';
import axios from 'axios';
import { calculateCryptoCroc } from '../../../lib/cryptocroc';

export const dynamic = 'force-dynamic';
// Dit is de magische Vercel Pro regel: Geef het script tot 5 minuten de tijd!
export const maxDuration = 300; 

export async function GET() {
    try {
        // 1. Haal de markt op en pak nu de Top 300 coins!
        const tickerRes = await axios.get('https://api.mexc.com/api/v3/ticker/24hr');
        const topCoins = tickerRes.data
            .filter(t => t.symbol.endsWith('USDT')) 
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)) 
            .slice(0, 300) // Verhoogd van 80 naar 300 voor een veel bredere scan
            .map(t => t.symbol);

        let results = [];

        // 2. We maken de batches iets groter (20 tegelijk) om het sneller te laten lopen
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
            results.push(...batchResults.filter(Boolean));
        }

        // 3. Sorteer alles op Score en pak nog steeds de absolute Top 10
        const top10 = results
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        return NextResponse.json({ success: true, data: top10 });

    } catch (error) {
        console.error("API Error:", error.message);
        return NextResponse.json({ success: false, error: "Kan data niet ophalen" }, { status: 500 });
    }
}
