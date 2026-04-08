import { NextResponse } from 'next/server';
import axios from 'axios';
import { calculateCryptoCroc } from '@/lib/cryptocroc';

// Lijst van coins om te scannen (je kunt dit later uitbreiden naar 100+ coins)
const COINS_TO_SCAN = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "TURBOUSDT", "PEPEUSDT"];

export async function GET() {
    try {
        let results = [];

        // Loop door de coins en haal de 1-uur data op via Binance
        for (const symbol of COINS_TO_SCAN) {
            // Haal de laatste 150 candles op van het 1-uur (1h) timeframe
            const response = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=150`);
            const klines = response.data;

            // Gooi de data door jouw indicator!
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
