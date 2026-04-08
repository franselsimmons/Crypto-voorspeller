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
        const text = `ASSET: ${c.symbol.replace('USDT','')}\nSIDE: ${c.type.toUpperCase()}\nENTRY: ${c.entry}\nTARGET: ${c.tp2}\nSTOP: ${c.sl}`;
        navigator.clipboard.writeText(text);
        alert("EXECUTION DATA COPIED");
    };

    return (
        <main className="min-h-screen bg-[#050505] text-zinc-400 p-4 md:p-16 font-mono uppercase tracking-tighter">
            <div className="max-w-4xl mx-auto">
                
                {/* --- HEADER --- */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-baseline mb-12 border-b border-zinc-900 pb-8 gap-6">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-white tracking-[0.2em]">
                            CRYPTO<span className="text-zinc-500">CROC</span> // TERMINAL
                        </h1>
                        <div className="flex flex-wrap gap-4 mt-3 text-[9px] tracking-widest text-zinc-600">
                            <span>STATUS: <span className="text-emerald-500 italic">ONLINE</span></span>
                            <span>REGIME: <span className={btcTrend === 'long' ? 'text-emerald-500' : 'text-rose-500'}>{btcTrend}</span></span>
                        </div>
                    </div>
                    <button 
                        onClick={scanMarket} 
                        disabled={loading} 
                        className="w-full md:w-auto border border-zinc-800 hover:border-zinc-100 hover:text-white px-8 py-3 text-[10px] transition-all duration-300 disabled:opacity-30"
                    >
                        {loading ? "[ RUNNING_ANALYSIS ]" : "[ EXECUTE_SCAN ]"}
                    </button>
                </header>

                {allCoins.length > 0 ? (
                    <div className="space-y-4">
                        {allCoins.map((c, i) => (
                            <div key={i} className={`relative overflow-hidden bg-zinc-950/40 border border-zinc-900 p-5 md:p-6 transition-all duration-500 hover:bg-zinc-900/40 ${i === 0 ? 'border-l-2 border-l-amber-600' : ''}`}>
                                
                                {/* TOP ROW: ASSET & SIDE */}
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <div className="text-2xl font-bold text-white tracking-tight">{c.symbol.replace('USDT', '')}</div>
                                        <div className="flex gap-3 items-center mt-1">
                                            <span className={`text-[10px] font-bold ${c.type === 'long' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                {c.type}
                                            </span>
                                            <span className="text-[9px] text-zinc-600 tracking-widest">CONFIDENCE: {Math.round(c.score)}%</span>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => copySignal(c)} 
                                        className="text-[9px] text-zinc-500 border border-zinc-800 px-3 py-1.5 hover:text-white hover:border-zinc-500 transition-all"
                                    >
                                        COPY_DATA
                                    </button>
                                </div>

                                {/* DATA GRID: GEOPTIMALISEERD VOOR MOBIEL */}
                                <div className="grid grid-cols-3 gap-2 border-t border-zinc-900/50 pt-5">
                                    <div className="flex flex-col">
                                        <span className="text-[8px] text-zinc-600 mb-1 tracking-widest">ENTRY</span>
                                        <span className="text-xs md:text-sm font-bold text-zinc-200">${c.entry}</span>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <span className="text-[8px] text-emerald-600 mb-1 tracking-widest">TARGET</span>
                                        <span className="text-xs md:text-sm font-bold text-emerald-500">${c.tp2}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[8px] text-rose-600 mb-1 tracking-widest">STOP_LOSS</span>
                                        <span className="text-xs md:text-sm font-bold text-rose-500/80">${c.sl}</span>
                                    </div>
                                </div>

                                {/* TAGS SUBTIEL ONDERAAN */}
                                <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar">
                                    {c.tags.slice(0, 2).map((t, x) => (
                                        <span key={x} className="text-[8px] text-zinc-700 bg-zinc-900/50 px-2 py-0.5 rounded-sm whitespace-nowrap">
                                            // {t}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-32 text-center border border-zinc-900 bg-zinc-950/20">
                        <p className="text-[10px] tracking-[0.3em] text-zinc-700 uppercase px-4 leading-loose">
                            {loading ? "Decrypting_Market_Flow..." : "No_High_Conviction_Assets_Found_In_Current_Regime"}
                        </p>
                    </div>
                )}

                {/* --- FOOTER --- */}
                <footer className="mt-20 pt-8 border-t border-zinc-900 flex flex-col md:flex-row justify-between gap-4 text-[8px] text-zinc-700 tracking-[0.2em]">
                    <span>SYSTEM: ALPHA_MODULAR_V2.1</span>
                    <span className="hidden md:block">LATENCY: 144MS</span>
                    <span>&copy; 2026 TERMINAL_ACCESS_GRANTED</span>
                </footer>
            </div>
            
            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </main>
    );
}
