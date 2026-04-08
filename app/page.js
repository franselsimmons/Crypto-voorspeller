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

    const copySignal = (c) => {
        const text = `COIN: ${c.symbol.replace('USDT','')} | ${c.type.toUpperCase()}\nEntry: ${c.entry}\nTP1: ${c.tp1}\nTP2: ${c.tp2}\nSL: ${c.sl}`;
        navigator.clipboard.writeText(text);
        alert("Gekopieerd naar klembord!");
    };

    return (
        <main className="min-h-screen bg-black text-white p-4 md:p-10 font-sans">
            <div className="max-w-4xl mx-auto">
                <header className="flex justify-between items-center mb-10 border-b border-gray-800 pb-8">
                    <div>
                        <h1 className="text-4xl font-black tracking-tighter italic">CRYPTO<span className="text-blue-600">CROC</span> COMMAND</h1>
                        <p className="text-gray-400 mt-1 font-bold">BTC REGIME: <span className={btcTrend === 'long' ? 'text-green-500' : 'text-red-500'}>{btcTrend.toUpperCase()}</span></p>
                    </div>
                    <button onClick={scanMarket} disabled={loading} className="bg-blue-600 hover:bg-blue-500 px-10 py-4 rounded-full font-black uppercase text-sm transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)]">
                        {loading ? "Scanning..." : "Ververs Counsel"}
                    </button>
                </header>

                {allCoins.length > 0 ? (
                    <div className="space-y-6">
                        <h2 className="text-xs font-black uppercase text-gray-500 tracking-widest">Beste beschikbare trades (Min. Score 60)</h2>
                        {allCoins.map((c, i) => (
                            <div key={i} className={`relative overflow-hidden bg-gray-900 border-2 ${i === 0 ? 'border-blue-600' : 'border-gray-800'} rounded-3xl p-6 transition-all`}>
                                {i === 0 && <span className="absolute top-0 right-0 bg-blue-600 px-4 py-1 text-[10px] font-black uppercase">Top Pick</span>}
                                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                                    <div className="text-center md:text-left">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-4xl font-black">{c.symbol.replace('USDT', '')}</h3>
                                            <span className={`px-3 py-1 rounded-lg text-xs font-black border ${c.type === 'long' ? 'border-green-500 text-green-500' : 'border-red-500 text-red-500'}`}>{c.type.toUpperCase()}</span>
                                        </div>
                                        <div className="flex gap-2 mt-3">
                                            {c.tags.map((t, x) => <span key={x} className="text-[10px] bg-gray-800 px-2 py-1 rounded-md text-gray-400 font-bold uppercase">{t}</span>)}
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="text-center">
                                            <p className="text-[10px] text-gray-500 uppercase font-black">Entry</p>
                                            <p className="font-mono font-bold text-lg">${c.entry}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] text-green-500 uppercase font-black">Target</p>
                                            <p className="font-mono font-bold text-lg text-green-500">${c.tp2}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] text-red-500 uppercase font-black">Stop</p>
                                            <p className="font-mono font-bold text-lg text-red-500">${c.sl}</p>
                                        </div>
                                    </div>

                                    <button onClick={() => copySignal(c)} className="bg-white text-black px-6 py-3 rounded-xl font-black uppercase text-xs hover:bg-gray-200">Copy Signal</button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-20 text-center border-2 border-dashed border-gray-800 rounded-3xl">
                        <p className="text-gray-600 font-bold italic">Klik op "Ververs Counsel" om de beste 10 trades van dit moment te vinden.</p>
                    </div>
                )}
            </div>
        </main>
    );
}
