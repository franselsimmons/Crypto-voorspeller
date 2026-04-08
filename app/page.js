"use client";
import { useState, useEffect, useCallback } from 'react';

// Chique Goud-Bronzen accentkleur: #C5A070 (of Tailwind amber-400 / yellow-500 in nuances)

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
        // Alert ook rustiger maken (visueel, optioneel later)
        alert("Signaal gekopieerd.");
    };

    return (
        <main className="min-h-screen bg-slate-950 text-slate-200 p-6 md:p-12 font-sans tracking-tight">
            <div className="max-w-5xl mx-auto">
                
                {/* --- CHIQUE HEADER --- */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 border-b border-slate-800 pb-10 gap-6">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-yellow-500 text-3xl">✦</span>
                            <h1 className="text-3xl font-light tracking-tighter text-white">
                                <span className="font-bold">CRYPTO</span>CROC <span className="text-yellow-500/80 font-mono text-xl">V2.1</span>
                            </h1>
                        </div>
                        <p className="text-slate-500 mt-2 text-sm font-medium tracking-normal">
                            Professional Grade Crypto Terminal &nbsp; | &nbsp; 
                            BTC: {btcTrend === 'long' ? 
                                <span className="text-green-400 font-bold bg-green-950 px-2 py-0.5 rounded text-xs">BULLISH</span> : 
                                <span className="text-red-400 font-bold bg-red-950 px-2 py-0.5 rounded text-xs">BEARISH</span>
                            }
                        </p>
                    </div>
                    <button 
                        onClick={scanMarket} 
                        disabled={loading} 
                        className="bg-yellow-500 hover:bg-yellow-400 text-slate-950 px-8 py-3 rounded-full font-bold uppercase text-xs transition-all disabled:opacity-50 shadow-lg shadow-yellow-950/30 whitespace-nowrap active:scale-95"
                    >
                        {loading ? "Analysing Markt..." : "Execute Scan"}
                    </button>
                </header>

                {allCoins.length > 0 ? (
                    <div className="space-y-8">
                        <h2 className="text-sm font-bold uppercase text-slate-600 tracking-widest text-center md:text-left">Actieve Markt Kansen (Min. Score 50)</h2>
                        
                        {allCoins.map((c, i) => (
                            <div key={i} className={`relative overflow-hidden bg-slate-900 ${i === 0 ? 'border border-yellow-500/50 shadow-[0_0_25px_rgba(197,160,112,0.1)]' : 'border border-slate-800'} rounded-2xl p-7 transition-all hover:border-yellow-500/30`}>
                                
                                {/* CHIQUE GOUDEN LABEL VOOR NR 1 */}
                                {i === 0 && (
                                    <div className="absolute top-0 right-0 flex items-center gap-1.5 bg-yellow-500 text-slate-950 px-4 py-1.5 text-[11px] font-black uppercase rounded-bl-lg">
                                        <span>✦</span> Premium Pick
                                    </div>
                                )}
                                
                                <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                                    
                                    {/* COIN INFO BLOCK */}
                                    <div className="text-center md:text-left w-full md:w-auto">
                                        <div className="flex items-center justify-center md:justify-start gap-4">
                                            <h3 className="text-4xl font-extrabold tracking-tighter text-white">{c.symbol.replace('USDT', '')}</h3>
                                            <span className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase ${c.type === 'long' ? 'text-green-400 bg-green-950/50' : 'text-red-400 bg-red-950/50'}`}>
                                                {c.type.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-4">
                                            <span className="text-[10px] bg-slate-800 px-2 py-1 rounded-md text-slate-400 font-medium uppercase tracking-wider">Score: {Math.round(c.score)}</span>
                                            {c.tags.map((t, x) => (
                                                <span key={x} className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase ${t.includes('BTC') ? 'bg-yellow-950/50 text-yellow-300' : 'bg-slate-800 text-slate-400'}`}>
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* DATA BLOCK (CHIQUE EN STRAK) */}
                                    <div className="grid grid-cols-3 gap-5 w-full md:w-auto bg-slate-950 p-5 rounded-xl border border-slate-800">
                                        <div className="text-center">
                                            <p className="text-[11px] text-slate-500 uppercase font-medium tracking-wider">Entry</p>
                                            <p className="font-mono font-bold text-lg md:text-xl text-white mt-1">${c.entry}</p>
                                        </div>
                                        <div className="text-center border-x border-slate-800 px-5">
                                            <p className="text-[11px] text-green-500 uppercase font-medium tracking-wider">Target</p>
                                            <p className="font-mono font-bold text-lg md:text-xl text-green-500 mt-1">${c.tp2}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[11px] text-red-500 uppercase font-medium tracking-wider">Stop</p>
                                            <p className="font-mono font-bold text-lg md:text-xl text-red-500 mt-1">${c.sl}</p>
                                        </div>
                                    </div>

                                    {/* ACTIE KNOP (ELEGANT DONKER) */}
                                    <button 
                                        onClick={() => copySignal(c)} 
                                        className="w-full md:w-auto bg-slate-800 hover:bg-slate-700 text-white px-7 py-3.5 rounded-lg font-bold uppercase text-[11px] tracking-wider transition-colors active:scale-95"
                                    >
                                        Copy Signal
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-24 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/40">
                        {loading ? (
                            <p className="text-yellow-400 font-medium animate-pulse">Markt wordt geanalyseerd...</p>
                        ) : (
                            <div>
                                <span className="text-4xl text-slate-700">✦</span>
                                <p className="text-slate-500 font-medium text-lg mt-5">De markt is op dit moment te zwak voor een betrouwbaar signaal.</p>
                                <p className="text-slate-600 text-sm mt-2">Geen munten boven de minimumscore van 50.</p>
                            </div>
                        )}
                    </div>
                )}

                <footer className="mt-20 pt-8 border-t border-slate-800 text-center text-slate-700 text-xs">
                    Professional Trading Tools &copy; 2024. Use with discipline.
                </footer>
            </div>
        </main>
    );
}
