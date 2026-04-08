"use client";
import { useState, useEffect, useCallback } from 'react';

export default function Home() {
    const [allCoins, setAllCoins] = useState([]);
    const [btcTrend, setBtcTrend] = useState('neutral');
    const [loading, setLoading] = useState(false);

    const scanMarket = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/scanner');
            const result = await res.json();
            if (result.success) {
                setAllCoins(result.data);
                setBtcTrend(result.btcTrend);
            }
        } catch (e) { console.error(e); }
        setLoading(false);
    }, []);

    useEffect(() => {
        scanMarket();
        const interval = setInterval(scanMarket, 5 * 60 * 1000); 
        return () => clearInterval(interval);
    }, [scanMarket]);

    const copySignal = (c) => {
        const text = `COIN: ${c.symbol.replace('USDT','')}\nRICHTING: ${c.type.toUpperCase()}\n\nInstap (Nu): $${c.entry}\nVeilige Winst (TP1): $${c.tp1}\nHoofddoel (TP2): $${c.tp2}\nStop Loss: $${c.sl}`;
        navigator.clipboard.writeText(text);
        alert("Signaal perfect gekopieerd!");
    };

    return (
        <main className="min-h-screen bg-gray-950 text-white p-4 md:p-10 font-sans">
            <div className="max-w-4xl mx-auto">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 border-b border-gray-800 pb-8 gap-4">
                    <div>
                        <h1 className="text-4xl font-black tracking-tighter italic">CRYPTO<span className="text-blue-500">CROC</span> COMMAND</h1>
                        <p className="text-gray-400 mt-1 font-bold">
                            BTC REGIME: {btcTrend === 'long' ? <span className="text-green-500 bg-green-900/30 px-2 py-1 rounded">BULLISH</span> : <span className="text-red-500 bg-red-900/30 px-2 py-1 rounded">BEARISH</span>}
                        </p>
                    </div>
                    <button onClick={scanMarket} disabled={loading} className="bg-blue-600 hover:bg-blue-500 px-8 py-4 rounded-xl font-black uppercase text-sm transition-all disabled:opacity-50 w-full md:w-auto">
                        {loading ? "Markt Scannen..." : "Zoek Trades Nu"}
                    </button>
                </header>

                {allCoins.length > 0 ? (
                    <div className="space-y-6">
                        <h2 className="text-xs font-black uppercase text-gray-500 tracking-widest">Top Picks van dit moment</h2>
                        {allCoins.map((c, i) => (
                            <div key={i} className={`relative overflow-hidden bg-gray-900 border-2 ${i === 0 ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.15)]' : 'border-gray-800'} rounded-3xl p-6 transition-all`}>
                                {i === 0 && <span className="absolute top-0 right-0 bg-blue-500 px-4 py-1 text-[10px] font-black uppercase text-white rounded-bl-lg">🔥 Nr. 1 Keuze</span>}
                                
                                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                                    <div className="text-center md:text-left w-full md:w-auto">
                                        <div className="flex items-center justify-center md:justify-start gap-3">
                                            <h3 className="text-4xl font-black">{c.symbol.replace('USDT', '')}</h3>
                                            <span className={`px-3 py-1 rounded-lg text-xs font-black border ${c.type === 'long' ? 'border-green-500 text-green-500 bg-green-900/20' : 'border-red-500 text-red-500 bg-red-900/20'}`}>
                                                {c.type.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-3">
                                            <span className="text-[10px] bg-gray-800 px-2 py-1 rounded-md text-gray-400 font-bold uppercase">Score: {Math.round(c.score)}</span>
                                            {c.tags.map((t, x) => <span key={x} className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase ${t.includes('BTC') ? 'bg-blue-900/50 text-blue-300' : 'bg-gray-800 text-gray-400'}`}>{t}</span>)}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4 w-full md:w-auto bg-gray-950 p-4 rounded-2xl border border-gray-800">
                                        <div className="text-center">
                                            <p className="text-[10px] text-gray-500 uppercase font-black">Entry</p>
                                            <p className="font-mono font-bold text-lg md:text-xl text-white">${c.entry}</p>
                                        </div>
                                        <div className="text-center border-x border-gray-800 px-4">
                                            <p className="text-[10px] text-green-500 uppercase font-black">Target</p>
                                            <p className="font-mono font-bold text-lg md:text-xl text-green-500">${c.tp2}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] text-red-500 uppercase font-black">Stop</p>
                                            <p className="font-mono font-bold text-lg md:text-xl text-red-500">${c.sl}</p>
                                        </div>
                                    </div>

                                    <button onClick={() => copySignal(c)} className="w-full md:w-auto bg-white text-black px-6 py-4 rounded-xl font-black uppercase text-xs hover:bg-gray-200 transition-colors">
                                        Kopieer
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-20 text-center border-2 border-dashed border-gray-800 rounded-3xl bg-gray-900/50">
                        {loading ? (
                            <p className="text-blue-500 font-bold animate-pulse">Markt wordt geanalyseerd...</p>
                        ) : (
                            <div>
                                <p className="text-gray-500 font-bold text-lg">Zelfs met verlaagde eisen is de markt op dit moment te zwak.</p>
                                <p className="text-gray-600 text-sm mt-2">Geen enkele munt haalt de minimumscore van 50. Probeer het over een uur nog eens.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
