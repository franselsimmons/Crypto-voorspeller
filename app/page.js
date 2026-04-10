"use client";
import { useState, useEffect, useCallback } from 'react';

export default function Home() {
    const = useState({ executions:, marketRegime: {} });
    const [loading, setLoading] = useState(false);

    const runQuantEngine = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/scanner', { cache: 'no-store' });
            const result = await res.json();
            if (result.success) {
                setEngineData(result);
            }
        } catch (e) { console.error(e); }
        setLoading(false);
    },);

    useEffect(() => { runQuantEngine(); }, [runQuantEngine]);

    const getRegimeColor = (regime) => {
        if (!regime) return 'text-zinc-500';
        if (regime.includes('CALM')) return 'text-emerald-400';
        if (regime.includes('BULL')) return 'text-blue-400';
        if (regime.includes('BEAR')) return 'text-orange-400';
        return 'text-rose-500'; 
    };

    const activeTrades = engineData.executions?.filter(t => t.action === 'LONG_SPREAD' |

| t.action === 'SHORT_SPREAD') ||;
    const watchTrades = engineData.executions?.filter(t => t.action === 'WATCH') ||;

    return (
        <main className="min-h-screen bg-[#020202] text-zinc-400 p-4 md:p-12 font-mono uppercase tracking-tighter">
            <div className="max-w-5xl mx-auto">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-baseline mb-12 border-b border-zinc-900 pb-8 gap-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-[0.2em]">STAT_ARB <span className="text-zinc-600">// EXECUTION_CORE</span></h1>
                        <div className="flex gap-4 mt-3 text-[10px] tracking-widest text-zinc-500">
                            <span>GOVERNOR_STATE: <span className={`font-bold ${getRegimeColor(engineData.marketRegime?.regime)}`}>{engineData.marketRegime?.regime |

| 'INITIALIZING'}</span></span>
                            <span>REGIME_CONFIDENCE: <span className="text-white">{engineData.marketRegime?.confidence?? 0}</span></span>
                        </div>
                    </div>
                    <button 
                        onClick={runQuantEngine} 
                        disabled={loading} 
                        className="w-full md:w-auto border border-zinc-800 hover:border-zinc-300 hover:text-white px-8 py-3 text-[10px] transition-all disabled:opacity-20 bg-zinc-950"
                    >
                        {loading? "" : ""}
                    </button>
                </header>

                <div className="space-y-12">
                    {/* ACTIEVE TRADES (Klaar voor Executie) */}
                    <div>
                        <h2 className="text-xs text-emerald-500 mb-4 tracking-widest border-b border-emerald-900/50 pb-2 inline-block">EXECUTABLE_DISLOCATIONS</h2>
                        {activeTrades.length > 0? (
                            <div className="space-y-4">
                                {activeTrades.map((trade, i) => (
                                    <div key={i} className="relative bg-emerald-950/10 border-l-2 border-l-emerald-500 border border-zinc-900 p-6">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <div className="text-xl font-bold text-white tracking-widest mb-1">{trade.basket}</div>
                                                <div className="flex gap-3 items-center">
                                                    <span className="text-[10px] font-bold px-2 py-0.5 border border-emerald-500 text-emerald-400 bg-emerald-950/30">
                                                        ACTION: {trade.action}
                                                    </span>
                                                    <span className="text-[10px] text-zinc-500 tracking-[0.1em]">TRADE_SCORE: {trade.score}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[10px] text-zinc-600 mb-1">Z_SCORE DISLOCATION</div>
                                                <div className="font-mono text-lg font-bold text-amber-400">{trade.zScore}</div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 border-t border-zinc-900/50 pt-5">
                                            <div className="flex justify-between items-center bg-zinc-900/30 p-3 border border-zinc-800/50">
                                                <span className="text-[10px] font-bold text-white">LEG_A: {trade.legA}</span>
                                                <div className="text-right">
                                                    <span className="text-[8px] text-zinc-600 block">ORDERFLOW_IMBALANCE</span>
                                                    <span className={`text-[10px] font-bold ${parseFloat(trade.imbalanceA) > 0? 'text-emerald-500' : 'text-rose-500'}`}>{trade.imbalanceA}</span>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center bg-zinc-900/30 p-3 border border-zinc-800/50">
                                                <span className="text-[10px] font-bold text-white">LEG_B: {trade.legB}</span>
                                                <div className="text-right">
                                                    <span className="text-[8px] text-zinc-600 block">ORDERFLOW_IMBALANCE</span>
                                                    <span className={`text-[10px] font-bold ${parseFloat(trade.imbalanceB) > 0? 'text-emerald-500' : 'text-rose-500'}`}>{trade.imbalanceB}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-10 text-center border border-zinc-900/50 bg-zinc-950/20">
                                <p className="text-[10px] tracking-[0.2em] text-zinc-700">NO_ACTIONABLE_SETUPS</p>
                            </div>
                        )}
                    </div>

                    {/* WATCHLIST TRADES (Wachten op Orderboek Bevestiging) */}
                    <div>
                        <h2 className="text-xs text-zinc-500 mb-4 tracking-widest border-b border-zinc-900 pb-2 inline-block">BOUNCE_WATCH // PRE-TRIGGER PHASE</h2>
                        {watchTrades.length > 0? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {watchTrades.map((trade, i) => (
                                    <div key={i} className="bg-zinc-950/40 border border-zinc-900 p-4">
                                        <div className="flex justify-between items-center mb-4">
                                            <div className="text-sm font-bold text-white tracking-widest">{trade.basket}</div>
                                            <div className="text-[10px] text-zinc-500">Z: <span className="text-amber-400/70">{trade.zScore}</span></div>
                                        </div>
                                        <div className="flex justify-between text-[9px] text-zinc-600">
                                            <span>{trade.legA} OFI: <span className={parseFloat(trade.imbalanceA) > 0? 'text-emerald-500/70' : 'text-rose-500/70'}>{trade.imbalanceA}</span></span>
                                            <span>{trade.legB} OFI: <span className={parseFloat(trade.imbalanceB) > 0? 'text-emerald-500/70' : 'text-rose-500/70'}>{trade.imbalanceB}</span></span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-6 text-center border border-zinc-900/50 border-dashed bg-zinc-950/10">
                                <p className="text-[9px] tracking-[0.2em] text-zinc-700">WATCHLIST_EMPTY</p>
                            </div>
                        )}
                    </div>
                </div>
                
                <footer className="mt-20 pt-8 border-t border-zinc-900 text-center text-[8px] text-zinc-800 tracking-[0.2em]">
                    MULTIVARIATE_STAT_ARB_ENGINE // FEE_ADJUSTED_MODEL // &copy; 2026
                </footer>
            </div>
        </main>
    );
}
