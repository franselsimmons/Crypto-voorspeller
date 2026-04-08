"use client";
import { useState, useEffect } from 'react';

export default function Home() {
    const [coins, setCoins] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchSignals = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/scanner');
            const result = await res.json();
            if (result.success) {
                setCoins(result.data);
            }
        } catch (error) {
            console.error("Fout bij ophalen:", error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchSignals();
        const interval = setInterval(fetchSignals, 5 * 60 * 1000); // 5 minuten refresh
        return () => clearInterval(interval);
    }, []);

    return (
        <main className="min-h-screen p-8 font-sans">
            <div className="max-w-5xl mx-auto">
                <header className="mb-8 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-blue-400">CryptoCroc Scanner</h1>
                        <p className="text-gray-400">Live 1-Uur Timeframe Signalen</p>
                    </div>
                    <button 
                        onClick={fetchSignals} 
                        className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded font-bold transition-colors"
                        disabled={loading}
                    >
                        {loading ? "Scannen..." : "Ververs Data"}
                    </button>
                </header>

                <div className="bg-gray-800 rounded-lg shadow-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-950 text-gray-400 text-sm uppercase">
                                <th className="p-4 border-b border-gray-700">Coin</th>
                                <th className="p-4 border-b border-gray-700">RSI (EMA 30)</th>
                                <th className="p-4 border-b border-gray-700">Bovenste Band (U1)</th>
                                <th className="p-4 border-b border-gray-700">Onderste Band (L1)</th>
                                <th className="p-4 border-b border-gray-700">Live Signaal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {coins.map((coin, index) => (
                                <tr key={index} className="hover:bg-gray-750 transition-colors border-b border-gray-700 last:border-none">
                                    <td className="p-4 font-bold">{coin.symbol}</td>
                                    <td className="p-4 font-mono">{coin.rsi}</td>
                                    <td className="p-4 font-mono text-red-400">{coin.U1}</td>
                                    <td className="p-4 font-mono text-green-400">{coin.L1}</td>
                                    <td className="p-4">
                                        <span className={`px-3 py-1 rounded text-sm font-bold ${
                                            coin.type === 'long' ? 'bg-green-900 text-green-300' :
                                            coin.type === 'short' ? 'bg-red-900 text-red-300' :
                                            'bg-gray-700 text-gray-300'
                                        }`}>
                                            {coin.signal}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {coins.length === 0 && !loading && (
                        <div className="p-8 text-center text-gray-500">Geen data gevonden.</div>
                    )}
                </div>
            </div>
        </main>
    );
}
