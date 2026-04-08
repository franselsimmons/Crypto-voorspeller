import { NextResponse } from 'next/server';
import axios from 'axios';
import { calculateCryptoCroc } from '@/lib/cryptocroc';

// Je kunt hier onbeperkt coins aan toevoegen die op Binance staan
const COINS_TO_SCAN = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "TURBOUSDT", 
    "PEPEUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT"
];

export async function GET() {
    try {
        let results = [];

        for (const symbol of COINS_TO_SCAN) {
            // Haal 150 candles op van het 1-uur (1h) timeframe
            const response = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=150`);
            const klines = response.data;

            const indicatorData = calculateCryptoCroc(klines);

            results.push({
                symbol: symbol,
                ...indicatorData
            });
        }

        return NextResponse.json({ success: true, data: results });

    } catch (error) {
        console.error("Fout bij ophalen data:", error);
        return NextResponse.json({ success: false, error: "Kan data niet ophalen" }, { status: 500 });
    }
}
