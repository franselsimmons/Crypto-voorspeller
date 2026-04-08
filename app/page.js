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
                <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                        <tr className="bg-gray-950 text-gray-400 text-sm uppercase">
                            <th className="p-4 border-b border-gray-700">Kwaliteit</th>
                            <th className="p-4 border-b border-gray-700">Coin</th>
                            <th className="p-4 border-b border-gray-700 hidden sm:table-cell">A+ Filters</th>
                            <th className="p-4 border-b border-gray-700">RSI / Band</th>
                            <th className="p-4 border-b border-gray-700">Signaal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((coin, index) => (
                            <tr key={index} className="transition-colors border-b border-gray-700 last:border-none hover:bg-gray-750">
                                <td className="p-4">
                                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-900 text-yellow-400 font-bold border border-yellow-700 shadow-[0_0_10px_rgba(234,179,8,0.2)]">
                                        {Math.round(coin.score)}
                                    </div>
                                </td>
                                <td className="p-4 font-bold text-lg">{coin.symbol.replace('USDT', '')}</td>
                                
                                {/* DIT ZIJN DE NIEUWE BADGES */}
                                <td className="p-4 hidden sm:table-cell">
                                    <div className="flex flex-wrap gap-2">
                                        {coin.tags.length === 0 && <span className="text-gray-600 text-xs italic">Tegen-trend (Risico)</span>}
                                        {coin.tags.map((tag, i) => (
                                            <span key={i} className={`px-2 py-1 text-xs font-bold rounded border ${
                                                tag.includes('Trend') ? 'bg-blue-900/40 text-blue-300 border-blue-700' :
                                                tag.includes('Vol') ? 'bg-purple-900/40 text-purple-300 border-purple-700' :
                                                'bg-yellow-900/40 text-yellow-300 border-yellow-700'
                                            }`}>
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </td>

                                <td className="p-4 font-mono">
                                    <span className="font-bold text-white">{coin.rsi}</span>
                                    <span className="text-gray-500 mx-1">/</span>
                                    <span className={coin.type === 'long' ? 'text-green-500' : 'text-red-500'}>
                                        {coin.type === 'long' ? coin.L1 : coin.U1}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <span className={`px-3 py-1 rounded text-sm font-bold whitespace-nowrap border ${
                                        coin.type === 'long' ? 'bg-green-900/40 text-green-300 border-green-700' :
                                        coin.type === 'short' ? 'bg-red-900/40 text-red-300 border-red-700' :
                                        'bg-gray-700 text-gray-300 border-gray-600'
                                    }`}>
                                        {coin.signal}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {data.length === 0 && (
                    <div className="p-8 text-center text-gray-500 italic">Geen kansen gevonden.</div>
                )}
            </div>
        </div>
    );

    return (
        <main className="min-h-screen p-4 md:p-8 font-sans bg-gray-950 text-white">
            <div className="max-w-5xl mx-auto">
                <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-white italic">CRYPTO<span className="text-yellow-500">CROC</span> A+ SCANNER</h1>
                        <p className="text-gray-500 font-medium">Inclusief Trend, Volume & Divergentie AI</p>
                    </div>
                    <button 
                        onClick={fetchSignals} 
                        className="bg-yellow-600 hover:bg-yellow-500 text-white px-8 py-3 rounded-full font-black uppercase tracking-wider transition-all shadow-lg shadow-yellow-900/20 disabled:opacity-50"
                        disabled={loading}
                    >
                        {loading ? "A+ Setups Zoeken..." : "Ververs Markt"}
                    </button>
                </header>

                <Table title="Top 10 A+ Kansen (Meeste Vinkjes)" data={top10Mixed} color="text-yellow-400" />
                <div className="grid grid-cols-1 gap-4">
                    <Table title="Longs" data={longSignals} color="text-green-400" />
                    <Table title="Shorts" data={shortSignals} color="text-red-400" />
                </div>
            </div>
        </main>
    );
}
