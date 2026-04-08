"use client";
import { useState, useEffect, useCallback } from 'react';

export default function Home() {
    const [allCoins, setAllCoins] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchSignals = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/scanner');
            const result = await res.json();
            if (result.success) setAllCoins(result.data);
        } catch (error) { console.error("Fout bij ophalen:", error); }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchSignals();
        const interval = setInterval(fetchSignals, 5 * 60 * 1000); 
        return () => clearInterval(interval);
    }, [fetchSignals]);

    const top10Mixed = [...allCoins].sort((a, b) => b.score - a.score).slice(0, 10);
    const longSignals = allCoins.filter(c => c.type === 'long').sort((a, b) => b.score - a.score);
    const shortSignals = allCoins.filter(c => c.type === 'short').sort((a, b) => b.score - a.score);

    const Table = ({ title, data, color }) => (
        <div className="mb-12">
            <h2 className={`text-xl font-bold mb-4 flex items-center gap-2 ${color}`}>
                <span className="w-2 h-6 rounded-full bg-current opacity-50"></span>
                {title} ({data.length})
            </h2>
            <div className="bg-gray-800 rounded-lg shadow-xl overflow-x-auto border border-gray-700">
                <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                        <tr className="bg-gray-950 text-gray-400 text-sm uppercase">
                            <th className="p-4 border-b border-gray-700">Actie</th>
                            <th className="p-4 border-b border-gray-700">Coin / Filters</th>
                            <th className="p-4 border-b border-gray-700 text-center bg-blue-900/10">💰 IN (Entry)</th>
                            <th className="p-4 border-b border-gray-700 text-center bg-green-900/10">🎯 TP (Winst)</th>
                            <th className="p-4 border-b border-gray-700 text-center bg-red-900/10">🛑 SL (Verlies)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((coin, index) => (
                            <tr key={index} className="transition-colors border-b border-gray-700 last:border-none hover:bg-gray-750">
                                <td className="p-4 align-top pt-5">
                                    <span className={`px-3 py-2 rounded text-sm font-black whitespace-nowrap border block text-center ${
                                        coin.type === 'long' ? 'bg-green-900/40 text-green-400 border-green-700' :
                                        'bg-red-900/40 text-red-400 border-red-700'
                                    }`}>
                                        {coin.signal}
                                    </span>
                                </td>
                                
                                <td className="p-4 align-top">
                                    <div className="font-black text-xl mb-2">{coin.symbol.replace('USDT', '')}</div>
                                    <div className="flex flex-wrap gap-1">
                                        {coin.tags.length === 0 && <span className="text-gray-500 text-xs">⚠️ Tegen de trend in</span>}
                                        {coin.tags.map((tag, i) => (
                                            <span key={i} className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                                                tag.includes('Trend') ? 'bg-blue-900 text-blue-200' :
                                                tag.includes('Vol') ? 'bg-purple-900 text-purple-200' :
                                                'bg-yellow-900 text-yellow-200'
                                            }`}>
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </td>

                                {/* DIRECTE HANDELSDATA */}
                                <td className="p-4 align-top text-center bg-blue-900/5">
                                    <div className="font-mono text-lg font-bold text-white">${coin.entry}</div>
                                    <div className="text-xs text-blue-400 mt-1 uppercase font-bold">Actueel</div>
                                </td>

                                <td className="p-4 align-top text-center bg-green-900/5">
                                    <div className="font-mono text-lg font-bold text-green-400">${coin.tp}</div>
                                    <div className="text-xs text-green-600 mt-1 uppercase font-bold">Risk/Reward 1:2</div>
                                </td>

                                <td className="p-4 align-top text-center bg-red-900/5">
                                    <div className="font-mono text-lg font-bold text-red-400">${coin.sl}</div>
                                    <div className="text-xs text-red-600 mt-1 uppercase font-bold">Hard Stop</div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {data.length === 0 && (
                    <div className="p-8 text-center text-gray-500 italic">Geen trades beschikbaar. Wacht op nieuwe setups.</div>
                )}
            </div>
        </div>
    );

    return (
        <main className="min-h-screen p-4 md:p-8 font-sans bg-gray-950 text-white">
            <div className="max-w-6xl mx-auto">
                <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-white italic">CRYPTO<span className="text-yellow-500">CROC</span> TRADER</h1>
                        <p className="text-gray-500 font-medium">Auto-berekende Instap, Take Profit en Stop Loss</p>
                    </div>
                    <button 
                        onClick={fetchSignals} 
                        className="bg-yellow-600 hover:bg-yellow-500 text-white px-8 py-3 rounded-full font-black uppercase tracking-wider transition-all shadow-lg shadow-yellow-900/20 disabled:opacity-50"
                        disabled={loading}
                    >
                        {loading ? "Setups Berekenen..." : "Zoek Trades"}
                    </button>
                </header>

                <Table title="💎 Top 10 Kansen" data={top10Mixed} color="text-yellow-400" />
                <div className="grid grid-cols-1 gap-8">
                    <Table title="🚀 Long Trades" data={longSignals} color="text-green-400" />
                    <Table title="📉 Short Trades" data={shortSignals} color="text-red-400" />
                </div>
            </div>
        </main>
    );
}
