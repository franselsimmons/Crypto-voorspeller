import { NextResponse } from 'next/server';
import axios from 'axios';
import { calculateCryptoCroc } from '../../../lib/cryptocroc';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

export async function GET() {
    try {
        let btcTrend = 'neutral';
        try {
            // 1. BTC Regime via Futures API
            const btcRes = await axios.get(`https://contract.mexc.com/api/v1/contract/kline/BTC_USDT?interval=Min60&limit=100`);
            
            // FIX: MEXC Futures geeft een object met arrays terug (btcRes.data.data.close), GEEN array met arrays.
            const btcCloses = btcRes.data.data.close.map(c => parseFloat(c));
            const currentBtc = btcCloses[btcCloses.length - 1];
            
            const k = 2 / (50 + 1);
            let btcEma = btcCloses[0];
            for (let i = 1; i < btcCloses.length; i++) { btcEma = (btcCloses[i] - btcEma) * k + btcEma; }
            btcTrend = currentBtc >= btcEma ? 'long' : 'short';
        } catch (e) { 
            console.error("BTC API Fetch Error"); 
        }

        // 2. Fetch Active Futures Contracts
        const contractRes = await axios.get('https://contract.mexc.com/api/v1/contract/ticker');
        const allContracts = contractRes.data.data || [];
        
        const futuresCoins = allContracts
            .filter(t => t.symbol.endsWith('_USDT'))
            .sort((a, b) => parseFloat(b.amount24) - parseFloat(a.amount24))
            .slice(0, 80) // Top 80 meest liquide futures voor snelheid
            .map(t => t.symbol);

        let results = [];
        
        // Scan in batches om de API niet te overbelasten
        for (let i = 0; i < futuresCoins.length; i += 10) {
            const batch = futuresCoins.slice(i, i + 10);
            const promises = batch.map(async (symbol) => {
                try {
                    const res = await axios.get(`https://contract.mexc.com/api/v1/contract/kline/${symbol}?interval=Min60&limit=200`);
                    const dataObj = res.data.data;
                    
                    // FIX: Vertaal de rare MEXC structuur terug naar normale Klines voor de wiskunde
                    if (dataObj && dataObj.close && dataObj.close.length > 150) {
                        const formattedKlines = [];
                        for(let j = 0; j < dataObj.close.length; j++) {
                            formattedKlines.push([
                                dataObj.time[j],
                                dataObj.open[j],
                                dataObj.high[j],
                                dataObj.low[j],
                                dataObj.close[j],
                                dataObj.vol[j]
                            ]);
                        }
                        
                        const analysis = calculateCryptoCroc(formattedKlines, btcTrend);
                        if (analysis.isActionable) {
                            return { symbol, ...analysis };
                        }
                    }
                    return null;
                } catch (e) { return null; }
            });
            const batchRes = await Promise.all(promises);
            results.push(...batchRes.filter(Boolean));
        }

        // Pak de absolute top 10 trades van dit moment
        const top10 = results.sort((a, b) => b.score - a.score).slice(0, 10);
        return NextResponse.json({ success: true, data: top10, btcTrend });
        
    } catch (e) { 
        console.error("Critical Scanner Error:", e.message);
        return NextResponse.json({ success: false, error: e.message }); 
    }
}
