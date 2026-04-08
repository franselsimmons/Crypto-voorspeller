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

    // Verdeel op basis van Actionability
    const primeSetups = allCoins.filter(c => c.actionability === 'TRADE_NOW');
    const earlySetups = allCoins.filter(c => c.actionability === 'EARLY');
    // Pak de top 10 van de rest voor de "Best Available" lijst
    const bestAvailable = allCoins.filter(c => c.actionability === 'WATCHLIST').slice(0, 10);

    const Table = ({ title, data, borderColor }) => (
        <div className="mb-12">
            <h2 className={`text-xl font-bold mb-4 flex items-center gap-2 text-white`}>
                <span className={`w-3 h-6 rounded bg-${borderColor}-500`}></span>
                {title} ({data.length})
            </h2>
            <div className={`bg-gray-800 rounded-lg shadow-xl overflow-x-auto border-t-4 border-${borderColor}-500`}>
                <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead>
                        <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wider">
                            <th className="p-4 border-b border-gray-700">Rank</th>
                            <th className="p-4 border-b border-gray-700">Coin / Context</th>
                            <th className="p-4 border-b border-gray-700 text-center bg-blue-900/10">Instap</th>
                            <th className="p-4 border-b border-gray-700 text-center bg-green-900/10">TP1 / TP2</th>
                            <th className="p-4 border-b border-gray-700 text-center bg-red-900/10">Stop Loss</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((coin, index) => (
                            <tr key={index} className="transition-colors border-b border-gray-750 last:border-none hover:bg-gray-750">
                                <td className="p-4 align-top pt-5">
                                    <div className="flex flex-col items-center gap-1">
                                        <div className={`flex items-center justify-center w-10 h-10 rounded-lg font-black text-lg border ${
                                            coin.setupClass === 'A' ? 'bg-yellow-900/40 text-yellow-400 border-yellow-600' :
                                            coin.setupClass === 'B' ? 'bg-blue-900/40 text-blue-400 border-blue-600' :
                                            'bg-gray-700 text-gray-300 border-gray-500'
                                        }`}>
                                            {coin.setupClass}
                                        </div>
                                        <span className="text-[10px] text-gray-500 font-mono">Score: {Math.round(coin.rankScore)}</span>
                                    </div>
                                </td>
                                
                                <td className="p-4 align-top">
                                    <div className="font-black text-xl mb-2 flex items-center gap-2">
                                        {coin.symbol.replace('USDT', '')}
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                            coin.type === 'long' ? 'bg-green-900/40 text-green-400 border-green-700' : 'bg-red-900/40 text-red-400 border-red-700'
                                        }`}>
                                            {coin.type}
                                        </span>
                                        {coin.type !== btcTrend && btcTrend !== 'neutral' && (
                                            <span className="bg-orange-900/50 text-orange-400 text-[10px] px-1.5 py-0.5 rounded" title="Tegen de BTC macro trend in">⚠️</span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {coin.tags.map((tag, i) => (
                                            <span key={i} className={`px-1.5 py-0.5 text-[9px] font-bold rounded uppercase ${
                                                tag.includes('Uptrend') || tag.includes('Downtrend') ? 'bg-blue-950 text-blue-300 border border-blue-800' :
                                                tag.includes('Zijwaarts') ? 'bg-gray-800 text-gray-400 border border-gray-600' :
                                                tag.includes('Vol') ? 'bg-purple-950 text-purple-300 border border-purple-800' :
                                                'bg-yellow-950 text-yellow-300 border border-yellow-800'
                                            }`}>
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </td>

                                <td className="p-4 align-top text-center bg-blue-900/5">
                                    <div className="font-mono text-lg font-bold text-white">${coin.entry}</div>
                                    <div className="text-xs text-blue-400 mt-1 font-mono">RSI: {coin.rsi}</div>
                                </td>

                                <td className="p-4 align-top text-center bg-green-900/5 border-l border-gray-700/50">
                                    <div className="font-mono text-md font-bold text-green-400">${coin.tp1}</div>
                                    <div className="font-mono text-sm font-bold text-green-600 mt-1">${coin.tp2}</div>
                                </td>

                                <td className="p-4 align-top text-center bg-red-900/5 border-l border-gray-700/50">
                                    <div className="font-mono text-lg font-bold text-red-400">${coin.sl}</div>
                                    <div className="text-[10px] text-red-600 mt-1 uppercase font-bold">Structuur SL</div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {data.length === 0 && (
                    <div className="p-8 text-center text-gray-500 italic">Geen munten in deze categorie op dit moment.</div>
                )}
            </div>
        </div>
    );

    return (
        <main className="min-h-screen p-4 md:p-8 font-sans bg-gray-950 text-white">
            <div className="max-w-7xl mx-auto">
                <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-white italic">CRYPTO<span className="text-blue-500">CROC</span> LEADERBOARD</h1>
                        <p className="text-gray-500 font-medium mt-1">
                            BTC Regime: {btcTrend === 'long' ? <span className="text-green-400">BULLISH (> 50 EMA)</span> : <span className="text-red-400">BEARISH (< 50 EMA)</span>}
                        </p>
                    </div>
                    <button 
                        onClick={fetchSignals} 
                        className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-black uppercase tracking-wider transition-all disabled:opacity-50"
                        disabled={loading}
                    >
                        {loading ? "Ranking berekenen..." : "Refresh Engine"}
                    </button>
                </header>

                <Table title="🔥 Prime Setups (Trade Now)" data={primeSetups} borderColor="green" />
                <Table title="👀 Watchlist (Early / Prep)" data={earlySetups} borderColor="yellow" />
                <Table title="📊 Best Available (Relative Top 10)" data={bestAvailable} borderColor="blue" />
            </div>
        </main>
    );
}
