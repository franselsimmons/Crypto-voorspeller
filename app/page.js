"use client";
import { useState, useEffect, useCallback } from 'react';

export default function Home() {
    const [allCoins, setAllCoins] = useState([]);
    const [btcTrend, setBtcTrend] = useState('neutral');
    const [loading, setLoading] = useState(true);

    const fetchSignals = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/scanner');
            const result = await res.json();
            if (result.success) {
                setAllCoins(result.data);
                setBtcTrend(result.btcTrend);
            }
        } catch (error) { console.error("Fout bij ophalen:", error); }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchSignals();
        const interval = setInterval(fetchSignals, 5 * 60 * 1000); 
        return () => clearInterval(interval);
    }, [fetchSignals]);

    // Omdat we nu alle coins ontvangen, kunnen we netjes de 3 tabellen vullen
    const top10Mixed = [...allCoins].slice(0, 10);
    const longSignals = allCoins.filter(c => c.type === 'long');
    const shortSignals = allCoins.filter(c => c.type === 'short');

    const Table = ({ title, data }) => (
        <div className="mb-12">
            <h2 className={`text-xl font-bold mb-4 flex items-center gap-2 text-yellow-400`}>
                <span className="w-2 h-6 rounded-full bg-current opacity-50"></span>
                {title} ({data.length})
            </h2>
            <div className="bg-gray-800 rounded-lg shadow-xl overflow-x-auto border border-gray-700">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead>
                        <tr className="bg-gray-950 text-gray-400 text-sm uppercase">
                            <th className="p-4 border-b border-gray-700">Actie</th>
                            <th className="p-4 border-b border-gray-700">Coin / Filters</th>
                            <th className="p-4 border-b border-gray-700 text-center bg-blue-900/10">💰 IN (Entry)</th>
                            <th className="p-4 border-b border-gray-700 text-center bg-green-900/10">🛡️ TP1 (Safe)</th>
                            <th className="p-4 border-b border-gray-700 text-center bg-green-700/10">🎯 TP2 (Max)</th>
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
                                    <div className="font-black text-xl mb-2 flex items-center gap-2">
                                        {coin.symbol.replace('USDT', '')}
                                        {/* BTC WAARSCHUWING */}
                                        {coin.type !== btcTrend && btcTrend !== 'neutral' && (
                                            <span className="bg-orange-900/50 text-orange-400 border border-orange-700 text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap" title="Deze trade gaat tegen de algemene Bitcoin trend in!">
                                                ⚡ Tegen BTC Trend
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {coin.tags.length === 0 && <span className="text-gray-500 text-xs">Geen A+ filters</span>}
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

                                <td className="p-4 align-top text-center bg-blue-900/5">
                                    <div className="font-mono text-lg font-bold text-white">${coin.entry}</div>
                                    <div className="text-xs text-blue-400 mt-1 uppercase font-bold">Actueel</div>
                                </td>

                                <td className="p-4 align-top text-center bg-green-900/5 border-l border-gray-700/50">
                                    <div className="font-mono text-lg font-bold text-green-400">${coin.tp1}</div>
                                    <div className="text-[10px] text-green-600 mt-1 uppercase font-bold">Zet hierna SL op Entry</div>
                                </td>

                                <td className="p-4 align-top text-center bg-green-900/10">
                                    <div className="font-mono text-lg font-bold text-green-300">${coin.tp2}</div>
                                    <div className="text-[10px] text-green-500 mt-1 uppercase font-bold">Risk/Reward 1:2</div>
                                </td>

                                <td className="p-4 align-top text-center bg-red-900/5 border-l border-gray-700/50">
                                    <div className="font-mono text-lg font-bold text-red-400">${coin.sl}</div>
                                    <div className="text-xs text-red-600 mt-1 uppercase font-bold">Hard Stop</div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {data.length === 0 && (
                    <div className="p-8 text-center text-gray-500 italic">Geen trades beschikbaar in deze categorie.</div>
                )}
            </div>
        </div>
    );

    return (
        <main className="min-h-screen p-4 md:p-8 font-sans bg-gray-950 text-white">
            <div className="max-w-7xl mx-auto">
                <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-white italic">CRYPTO<span className="text-yellow-500">CROC</span> TRADER</h1>
                        <p className="text-gray-500 font-medium mt-1 flex items-center gap-2">
                            Macro Markt Status: 
                            {btcTrend === 'long' ? (
                                <span className="bg-green-900/50 text-green-400 px-2 py-0.5 rounded text-sm font-bold border border-green-700">🚀 BTC STIJGT (Focus op Longs)</span>
                            ) : btcTrend === 'short' ? (
                                <span className="bg-red-900/50 text-red-400 px-2 py-0.5 rounded text-sm font-bold border border-red-700">🩸 BTC DAALT (Focus op Shorts)</span>
                            ) : (
                                <span className="text-gray-400">Scannen...</span>
                            )}
                        </p>
                    </div>
                    <button 
                        onClick={fetchSignals} 
                        className="bg-yellow-600 hover:bg-yellow-500 text-white px-8 py-3 rounded-full font-black uppercase tracking-wider transition-all shadow-lg shadow-yellow-900/20 disabled:opacity-50 whitespace-nowrap"
                        disabled={loading}
                    >
                        {loading ? "Setups Berekenen..." : "Zoek Trades"}
                    </button>
                </header>

                <Table title="💎 Top 10 Beste Kansen (Alle setups)" data={top10Mixed} />
                <div className="grid grid-cols-1 gap-8">
                    <Table title="🚀 Potentiële Long Trades" data={longSignals} />
                    <Table title="📉 Potentiële Short Trades" data={shortSignals} />
                </div>
            </div>
        </main>
    );
}
