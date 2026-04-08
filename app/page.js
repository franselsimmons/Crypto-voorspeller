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

    useEffect(() => { scanMarket(); }, [scanMarket]);

    const copySignal = (c) => {
        const text = `ASSET: ${c.symbol.replace('USDT','')}\nSIDE: ${c.type.toUpperCase()}\nENTRY: ${c.entry}\nTARGET 1: ${c.tp1}\nTARGET 2: ${c.tp2}\nSTOP: ${c.sl}`;
        navigator.clipboard.writeText(text);
        alert("EXECUTION DATA COPIED");
    };

    return (
        <main className="min-h-screen bg-[#050505] text-zinc-400 p-8 md:p-16 font-mono uppercase tracking-tighter">
            <div className="max-w-6xl mx-auto">
                
                {/* --- INSTITUTIONAL HEADER --- */}
                <header className="flex flex-col md:flex-row justify-between items-baseline mb-20 border-b border-zinc-900 pb-12 gap-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-[0.2em]">
                            CRYPTO<span className="text-zinc-500">CROC</span> // TERMINAL
                        </h1>
                        <div className="flex gap-6 mt-4 text-[10px] tracking-widest text-zinc-600">
                            <span>SYSTEM_STATUS: <span className="text-emerald-500 italic text-xs">ONLINE</span></span>
                            <span>MARKET_REGIME: <span className={btcTrend === 'long' ? 'text-emerald-500' : 'text-rose-500'}>{btcTrend}</span></span>
                        </div>
                    </div>
                    <button 
                        onClick={scanMarket} 
                        disabled={loading} 
                        className="border border-zinc-800 hover:border-zinc-100 hover:text-white px-10 py-3 text-[11px] transition-all duration-300 disabled:opacity-30"
                    >
                        {loading ? "[ RUNNING_ANALYSIS ]" : "[ EXECUTE_SCAN ]"}
                    </button>
                </header>

                {allCoins.length > 0 ? (
                    <div className="space-y-1">
                        {/* TABLE HEADER */}
                        <div className="grid grid-cols-5 text-[10px] text-zinc-600 pb-4 px-6 tracking-[0.2em] font-bold">
                            <span>Asset / Status</span>
                            <span className="text-center">Entry_Point</span>
                            <span className="text-center">Profit_Target</span>
                            <span className="text-center">Protection_Stop</span>
                            <span className="text-right">Action</span>
                        </div>

                        {allCoins.map((c, i) => (
                            <div key={i} className={`group grid grid-cols-5 items-center p-6 bg-zinc-950/30 border border-zinc-900 transition-all duration-500 hover:bg-zinc-900/40 ${i === 0 ? 'border-l-4 border-l-amber-600' : ''}`}>
                                
                                {/* ASSET INFO */}
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg font-bold text-white">{c.symbol.replace('USDT', '')}</span>
                                        <span className={`text-[10px] ${c.type === 'long' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            [{c.type}]
                                        </span>
                                    </div>
                                    <div className="flex gap-2 text-[9px] text-zinc-600">
                                        <span>ACC: {Math.round(c.score)}%</span>
                                        {c.tags.slice(0, 1).map((t, x) => <span key={x} className="text-zinc-500">| {t}</span>)}
                                    </div>
                                </div>

                                {/* DATA POINTS */}
                                <div className="text-center text-sm font-medium text-zinc-300">
                                    ${c.entry}
                                </div>

                                <div className="text-center">
                                    <div className="text-sm text-emerald-500 font-bold">${c.tp2}</div>
                                    <div className="text-[9px] text-zinc-600">LIMIT_ORDER</div>
                                </div>

                                <div className="text-center">
                                    <div className="text-sm text-rose-500/80">${c.sl}</div>
                                    <div className="text-[9px] text-zinc-600">STRUCTURAL_STOP</div>
                                </div>

                                {/* ACTION */}
                                <div className="text-right">
                                    <button 
                                        onClick={() => copySignal(c)} 
                                        className="text-[10px] text-zinc-500 hover:text-white border-b border-transparent hover:border-white transition-all pb-0.5"
                                    >
                                        COPY_DATA
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-40 text-center border border-zinc-900 bg-zinc-950/20">
                        <p className="text-[11px] tracking-[0.3em] text-zinc-700 uppercase">
                            {loading ? "Decrypting_Market_Flow..." : "No_High_Conviction_Assets_Found"}
                        </p>
                    </div>
                )}

                {/* --- FOOTER --- */}
                <footer className="mt-32 pt-8 border-t border-zinc-900 flex justify-between text-[9px] text-zinc-700 tracking-widest">
                    <span>V2.1 // QUANT_LOGIC</span>
                    <span>&copy; 2026 ALPHA_MODULAR_SYSTEMS</span>
                    <span>SECURE_CONNECTION</span>
                </footer>
            </div>
        </main>
    );
}
