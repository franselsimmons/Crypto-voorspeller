import { NextResponse } from 'next/server';
import axios from 'axios';
import { calculateCryptoCroc } from '../../../lib/cryptocroc';

export const dynamic = 'force-dynamic';

const COINS_TO_SCAN = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "TURBOUSDT", 
    "PEPEUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT"
];

export async function GET() {
    try {
        let results = [];

        for (const symbol of COINS_TO_SCAN) {
            // We gebruiken nu de MEXC API! Let op: MEXC gebruikt '60m' i.p.v. '1h'
            const response = await axios.get(`https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=60m&limit=150`);
            const klines = response.data;

            const indicatorData = calculateCryptoCroc(klines);

            results.push({
                symbol: symbol,
                ...indicatorData
            });
        }

        return NextResponse.json({ success: true, data: results });

    } catch (error) {
        console.error("Fout bij ophalen data:", error.message);
        return NextResponse.json({ success: false, error: "Kan data niet ophalen" }, { status: 500 });
    }
}
