import { NextResponse } from 'next/server';
import axios from 'axios';
import { calculateCryptoCroc } from '../../../lib/cryptocroc';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

// Blocklist uitgebreid met CRMSTOCK en andere veelvoorkomende aandelen op MEXC
const NON_CRYPTO = [
    'USOIL', 'UKOIL', 'COPSTOCK', 'CHECK', 'ESP', 'BTW', 'ATH', 'LA', 'APR', 'BMT', 'SP500', 'NAS100', 'CRMSTOCK', 'TSLA', 'AAPL'
];

export async function GET() {
    try {
        let btcTrend = 'long'; 
        try {
            const btcRes = await axios.get(`https://contract.mexc.com/api/v1/contract/kline/BTC_USDT?interval=Min60&limit=100`);
            const btcCloses = btcRes.data.data.close.map(c => parseFloat(c));
            const currentBtc = btcCloses[btcCloses.length - 1];
            const k = 2 / (50 + 1);
            let btcEma = btcCloses[0];
            for (let i = 1; i < btcCloses.length; i++) { btcEma = (btcCloses[i] - btcEma) * k + btcEma; }
            btcTrend = currentBtc >= btcEma ? 'long' : 'short';
        } catch (e) { console.error("BTC API Fetch Error"); }

        const contractRes = await axios.get('https://contract.mexc.com/api/v1/contract/ticker');
        const allContracts = contractRes.data.data || [];
        
        // Zorg dat we alleen echte crypto pakken
        const futuresCoins = allContracts
            .filter(t => {
                const symbol = t.symbol.split('_')[0];
                return t.symbol.endsWith('_USDT') && !NON_CRYPTO.includes(symbol);
            })
            .sort((a, b) => parseFloat(b.amount24) - parseFloat(a.amount24))
            .map(t => t.symbol);

        let results = [];
        
        // Bereken RSI voor de hele markt
        for (let i = 0; i < futuresCoins.length; i += 25) {
            const batch = futuresCoins.slice(i, i + 25);
            const promises = batch.map(async (symbol) => {
                try {
                    const res = await axios.get(`https://contract.mexc.com/api/v1/contract/kline/${symbol}?interval=Min60&limit=200`);
                    const dataObj = res.data.data;
                    
                    if (dataObj && dataObj.close && dataObj.close.length > 150) {
                        const formattedKlines = [];
                        for(let j = 0; j < dataObj.close.length; j++) {
                            formattedKlines.push([
                                dataObj.time[j], dataObj.open[j], dataObj.high[j], 
                                dataObj.low[j], dataObj.close[j], dataObj.vol[j]
                            ]);
                        }
                        
                        const analysis = calculateCryptoCroc(formattedKlines, btcTrend);
                        return { symbol, ...analysis };
                    }
                    return null;
                } catch (e) { return null; }
            });
            const batchRes = await Promise.all(promises);
            results.push(...batchRes.filter(Boolean));
        }

        let validSetups = results.filter(Boolean);

        // =========================================================
        // DE HARDE RSI-BLOKKADE (Jouw exacte logica)
        // =========================================================
        if (btcTrend === 'long') {
            validSetups = validSetups
                // MOET in de onderste range zitten (RSI 35 of lager)
                .filter(c => c.type === 'long' && parseFloat(c.rsi) <= 35)
                // Sorteer: Hoe LAGER, hoe hoger op de lijst
                .sort((a, b) => parseFloat(a.rsi) - parseFloat(b.rsi));
        } else {
            validSetups = validSetups
                // MOET in de bovenste range zitten (RSI 65 of hoger)
                .filter(c => c.type === 'short' && parseFloat(c.rsi) >= 65)
                // Sorteer: Hoe HOGER, hoe hoger op de lijst
                .sort((a, b) => parseFloat(b.rsi) - parseFloat(a.rsi));
        }

        const top10 = validSetups.slice(0, 10);
        return NextResponse.json({ success: true, data: top10, btcTrend });
        
    } catch (e) { 
        return NextResponse.json({ success: false, error: e.message }); 
    }
}
