import { NextResponse } from 'next/server';
import axios from 'axios';
import { classifyRegime, calculateSpreadZScore, calculateOFI, evaluateTrade } from '../../../lib/quantEngine';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

// De StatArb Cointegratie Baskets
const BASKETS =;

async function fetchMarketData(symbol) {
    try {
        const = await Promise.all([
            axios.get(`https://contract.mexc.com/api/v1/contract/kline/${symbol}?interval=Min15&limit=200`),
            axios.get(`https://contract.mexc.com/api/v1/contract/depth/${symbol}?limit=20`)
        ]);

        let klines =;
        const dataObj = klinesRes.data?.data;
        if (dataObj && dataObj.close) {
            for (let i = 0; i < dataObj.close.length; i++) {
                klines.push([
                    dataObj.time?.[i], dataObj.open?.[i], dataObj.high?.[i], 
                    dataObj.low?.[i], dataObj.close?.[i], dataObj.vol?.[i]);
            }
        }
        
        return {
            klines,
            depth: depthRes.data?.data |

| { bids:, asks: }
        };
    } catch (e) {
        console.error(`Fout bij ophalen data voor ${symbol}:`, e.message);
        return { klines:, depth: { bids:, asks: } };
    }
}

export async function GET() {
    try {
        const btcData = await fetchMarketData("BTC_USDT");
        if (!btcData |

| btcData.klines.length === 0) {
            return NextResponse.json({ success: false, error: "BTC data onbeschikbaar" }, { status: 500 });
        }
        
        const marketRegime = classifyRegime(btcData.klines);
        const marketDataCache = { "BTC_USDT": btcData };

        const getSymbolData = async (symbol) => {
            if (!marketDataCache[symbol]) {
                marketDataCache[symbol] = await fetchMarketData(symbol);
            }
            return marketDataCache[symbol];
        };

        let executions =;

        for (const pair of BASKETS) {
            try {
                const dataA = await getSymbolData(pair.legA);
                const dataB = await getSymbolData(pair.legB);

                if (!dataA.klines.length ||!dataB.klines.length) continue;

                const spreadData = calculateSpreadZScore(dataA.klines, dataB.klines, pair.hedge);
                const ofiA = calculateOFI(dataA.depth);
                const ofiB = calculateOFI(dataB.depth);
                
                const evaluation = evaluateTrade(spreadData.zScore, marketRegime.confidence, ofiA, ofiB);

                if (evaluation.action!== "FLAT") {
                    executions.push({
                        basket: pair.id,
                        legA: pair.legA.replace('_USDT', ''),
                        legB: pair.legB.replace('_USDT', ''),
                        zScore: spreadData.zScore,
                        imbalanceA: ofiA.imbalanceStr,
                        imbalanceB: ofiB.imbalanceStr,
                        score: evaluation.finalScore,
                        action: evaluation.action
                    });
                }
            } catch (e) {
                console.error(`Fout bij verwerken basket ${pair.id}:`, e.message);
            }
        }

        const sortedExecutions = executions.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

        return NextResponse.json({ 
            success: true, 
            marketRegime, 
            executions: sortedExecutions 
        });

    } catch (e) { 
        return NextResponse.json({ success: false, error: e.message }, { status: 500 }); 
    }
}
