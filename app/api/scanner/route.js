import { NextResponse } from 'next/server';
import axios from 'axios';
import { calculateCryptoCroc } from '../../../lib/cryptocroc';

export const dynamic = 'force-dynamic';

const COINS_TO_SCAN = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'TURBOUSDT',
  'PEPEUSDT',
  'XRPUSDT',
  'ADAUSDT',
  'DOGEUSDT'
];

export async function GET() {
  try {
    const results = [];

    for (const symbol of COINS_TO_SCAN) {
      const response = await axios.get(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=150`,
        {
          timeout: 15000
        }
      );

      const klines = response.data;
      const indicatorData = calculateCryptoCroc(klines);

      results.push({
        symbol,
        ...indicatorData
      });
    }

    return NextResponse.json(
      { success: true, data: results },
      {
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  } catch (error) {
    console.error('Fout bij ophalen data:', error?.message || error);

    return NextResponse.json(
      { success: false, error: 'Kan data niet ophalen' },
      { status: 500 }
    );
  }
}