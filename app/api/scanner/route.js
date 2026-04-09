import { NextResponse } from 'next/server';
import axios from 'axios';
import { classifyRegime, calculateSpreadZScore, calculateOFI, evaluateTrade } from '../../../lib/quantEngine';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

// Multivariate Cointegratie Baskets (Statisch berekende v1 paren)
const BASKETS =;

async function fetchMarketData(symbol) {
    const klinesRes = await axios.get(`https://contract.mexc.com/api/v1/contract/kline/${symbol}?interval=Min15&limit=200`);
    const depthRes = await axios.get(`https://contract.mexc.com/api/v1/contract/depth/${symbol}?limit=20`);
    
    return {
        klines: klinesRes.data.data.close? klinesRes.data.data.close.map((c, i) =>, klinesRes.data.data.open[i], klinesRes.data.data.high[i], 
            klinesRes.data.data.low[i], c, klinesRes.data.data.vol[i]) :,
        depth: depthRes.data.data |

| { bids:, asks: }
    };
}

export async function GET() {
    try {
        // 1. BEPAAL HET MACRO REGIME (De Kameleon)
        const btcData = await fetchMarketData("BTC_USDT");
        const marketRegime = classifyRegime(btcData.klines);

        let executions =;

        // 2. ITEREER OVER BEWEZEN BASKETS
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
                const bookConfirmation = (ofiA.confirmation + ofiB.confirmation) / 2;

                // C. Synthetische Evaluatie
                const evaluation = evaluateTrade(spreadData.zScore, marketRegime.confidence, bookConfirmation);

                // Filter posities die niet aan execution requirements voldoen
                if (evaluation.action!== "FLAT") {
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
                }
            } catch (e) {
                console.error(`Fout bij verwerken basket ${pair.id}:`, e.message);
            }
        }

        // Sorteer op de synthese van dislocation, regime en ofi
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
