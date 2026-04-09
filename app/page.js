"use client";
import { useState, useEffect, useCallback } from 'react';

export default function Home() {
    const = useState({ executions:, marketRegime: {} });
    const [loading, setLoading] = useState(false);

    const runQuantEngine = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/scanner');
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

    return (
        <main className="min-h-screen bg-[#020202] text-zinc-400 p-4 md:p-12 font-mono uppercase tracking-tighter">
            <div className="max-w-5xl mx-auto">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-baseline mb-12 border-b border-zinc-900 pb-8 gap-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-[0.2em]">STAT_ARB <span className="text-zinc-600">// EXECUTION_CORE</span></h1>
                        <div className="flex gap-4 mt-3 text-[10px] tracking-widest text-zinc-500">
                            <span>GOVERNOR_STATE: <span className={`font-bold ${getRegimeColor(engineData.marketRegime?.regime)}`}>{engineData.marketRegime?.regime |

| 'INITIALIZING'}</span></span>
                            <span>REGIME_CONFIDENCE: <span className="text-white">{engineData.marketRegime?.confidence |

| 0}</span></span>
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

                <div className="space-y-4">
                    {engineData.executions && engineData.executions.map((trade, i) => (
                        <div key={i} className={`relative bg-zinc-950/40 border border-zinc-900 p-6 transition-all ${trade.action!== 'FLAT'? 'border-l-2 border-l-emerald-500 bg-emerald-950/10' : ''}`}>
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <div className="text-xl font-bold text-white tracking-widest mb-1">{trade.basket}</div>
                                    <div className="flex gap-3 items-center">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 border ${trade.action!== 'FLAT'? 'border-emerald-500 text-emerald-400' : 'border-zinc-700 text-zinc-500'}`}>
                                            ACTION: {trade.action}
                                        </span>
                                        <span className="text-[10px] text-zinc-500 tracking-[0.1em]">TRADE_SCORE: {trade.score.toFixed(1)}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] text-zinc-600 mb-1">Z_SCORE DISLOCATION</div>
                                    <div className={`font-mono text-lg font-bold ${Math.abs(trade.zScore) > 2? 'text-amber-400' : 'text-zinc-300'}`}>{trade.zScore}</div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 border-t border-zinc-900/50 pt-5">
                                <div className="flex justify-between items-center bg-zinc-900/30 p-3 border border-zinc-800/50">
                                    <span className="text-[10px] font-bold text-white">LEG_A: {trade.legA}</span>
                                    <div className="text-right">
                                        <span className="text-[8px] text-zinc-600 block">ORDERBOOK_IMBALANCE</span>
                                        <span className={`text-[10px] ${parseFloat(trade.imbalanceA) > 0? 'text-emerald-500' : 'text-rose-500'}`}>{trade.imbalanceA}</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center bg-zinc-900/30 p-3 border border-zinc-800/50">
                                    <span className="text-[10px] font-bold text-white">LEG_B: {trade.legB}</span>
                                    <div className="text-right">
                                        <span className="text-[8px] text-zinc-600 block">ORDERBOOK_IMBALANCE</span>
                                        <span className={`text-[10px] ${parseFloat(trade.imbalanceB) > 0? 'text-emerald-500' : 'text-rose-500'}`}>{trade.imbalanceB}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {(!engineData.executions |

| engineData.executions.length === 0) &&!loading && (
                        <div className="py-20 text-center border border-zinc-900 bg-zinc-950/20">
                            <p className="text-[10px] tracking-[0.2em] text-zinc-700">WAITING_FOR_STATIONARY_DISLOCATIONS</p>
                        </div>
                    )}
                </div>
                
                <footer className="mt-20 pt-8 border-t border-zinc-900 text-center text-[8px] text-zinc-800 tracking-[0.2em]">
                    MULTIVARIATE_STAT_ARB_ENGINE // FEE_ADJUSTED_MODEL // &copy; 2026
                </footer>
            </div>
        </main>
    );
}
