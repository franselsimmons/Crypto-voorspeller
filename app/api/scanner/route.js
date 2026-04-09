import { NextResponse } from 'next/server';
import axios from 'axios';
import { classifyRegime, calculateSpreadZScore, calculateOFI, evaluateTrade } from '../../../lib/quantEngine';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

// Thematische Baskets (Voorbeeld van Cointegratie-kandidaten)
const BASKETS =;

async function fetchMarketData(symbol) {
    const klinesRes = await axios.get(`https://contract.mexc.com/api/v1/contract/kline/${symbol}?interval=Min15&limit=200`);
    const depthRes = await axios.get(`https://contract.mexc.com/api/v1/contract/depth/${symbol}?limit=20`);
    return {
        klines: klinesRes.data.data.close? klinesRes.data.data.close.map((c, i) =>, klinesRes.data.data.open[i], klinesRes.data.data.high[i], 
            klinesRes.data.data.low[i], c, klinesRes.data.data.vol[i]) :,
        depth: depthRes.data.data
    };
}

export async function GET() {
    try {
        // 1. Bepaal Macro Regime (via BTC)
        const btcData = await fetchMarketData("BTC_USDT");
        const marketRegime = classifyRegime(btcData.klines);

        let executions =;

        // 2. Scan Thematische Baskets
        for (const pair of BASKETS) {
            try {
                const dataA = pair.legA === "BTC_USDT"? btcData : await fetchMarketData(pair.legA);
                const dataB = await fetchMarketData(pair.legB);

                if (!dataA.klines.length ||!dataB.klines.length) continue;

                // A. StatArb Core (Z-Score)
                const spreadData = calculateSpreadZScore(dataA.klines, dataB.klines, pair.hedge);

                // B. Orderbook Execution Filter (OFI)
                const ofiA = calculateOFI(dataA.depth);
                const ofiB = calculateOFI(dataB.depth);
                
                // We nemen het gemiddelde bevestigingssignaal van het orderboek voor de spread
                const bookConfirmation = (ofiA.confirmation + ofiB.confirmation) / 2;

                // C. Evaluatie via de Synthetische Formule
                const evaluation = evaluateTrade(spreadData.zScore, marketRegime.confidence, bookConfirmation);

                executions.push({
                    basket: pair.id,
                    legA: pair.legA.replace('_USDT', ''),
                    legB: pair.legB.replace('_USDT', ''),
                    zScore: spreadData.zScore.toFixed(3),
                    imbalanceA: (ofiA.imbalance * 100).toFixed(1) + '%',
                    imbalanceB: (ofiB.imbalance * 100).toFixed(1) + '%',
                    score: evaluation.finalScore,
                    action: evaluation.action
                });

            } catch (e) {
                console.error(`Error processing pair ${pair.id}:`, e.message);
            }
        }

        const sortedExecutions = executions.sort((a, b) => b.score - a.score);

        return NextResponse.json({ 
            success: true, 
            marketRegime, 
            executions: sortedExecutions 
        });

    } catch (e) { 
        return NextResponse.json({ success: false, error: e.message }); 
    }
}
