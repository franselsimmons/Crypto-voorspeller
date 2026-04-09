"use client";
import { useState, useEffect, useCallback } from 'react';

export default function Home() {
    // Initial state updated for confirmed/watch split
    const [marketData, setMarketData] = useState({ 
        m15: { confirmed: [], watch: [] }, 
        h1: { confirmed: [], watch: [] }, 
        h4: { confirmed: [], watch: [] } 
    });
    const [btcTrends, setBtcTrends] = useState({ m15: 'long', h1: 'long', h4: 'long' });
    const [loading, setLoading] = useState(false);

    const scanMarket = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/scanner');
            const result = await res.json();
            if (result.success) {
                setMarketData(result.data);
                setBtcTrends(result.btcTrends);
            }
        } catch (e) { console.error("Scan failed", e); }
        setLoading(false);
    }, []);

    useEffect(() => { scanMarket(); }, [scanMarket]);

    const copySignal = (c, timeframe) => {
        const symbolClean = c.symbol.replace('_USDT', '');
        const text = `ASSET: ${symbolClean}\nTF: ${timeframe}\nSIDE: ${c.type.toUpperCase()}\nENTRY: ${c.entry}\nTARGET: ${c.tp2}\nSTOP: ${c.sl}`;
        navigator.clipboard.writeText(text);
        alert(`COPIED [${timeframe}] DATA`);
    };

    const renderWatchlist = (watchCoins) => {
        if (!watchCoins || watchCoins.length === 0) return null;
        return (
            <div className="mt-4 pt-4 border-t border-zinc-900 border-dashed">
                <h3 className="text-[9px] text-zinc-500 mb-2 tracking-[0.2em]">BOUNCE RADAR // PRE-TRIGGER PHASE</h3>
                <div className="flex flex-wrap gap-2">
                    {watchCoins.map((c, i) => (
                        <span key={i} className="text-[9px] border border-zinc-800 bg-zinc-950/40 px-2.5 py-1.5 flex gap-2 items-center text-zinc-400">
                            <span className="font-bold text-white">{c.symbol.replace('_USDT', '')}</span>
                            <span className="text-zinc-500">RSI: {c.rsi}</span>
                            <span className={parseFloat(c.rvol) > 1.5 ? 'text-amber-500' : 'text-zinc-600'}>VOL: {c.rvol}x</span>
                        </span>
                    ))}
                </div>
            </div>
        );
    };

    const renderTable = (title, dataObj, btcTrend, timeframeLabel) => {
        const coins = dataObj.confirmed || [];
        const watchCoins = dataObj.watch || [];

        return (
            <div className="mb-16">
                <div className="flex justify-between items-end border-b border-zinc-800 pb-3 mb-6">
                    <h2 className="text-lg md:text-xl font-bold text-white tracking-widest">{title}</h2>
                    <span className="text-[9px] tracking-widest text-zinc-500">
                        BTC MACRO: <span className={btcTrend === 'long' ? 'text-emerald-500' : 'text-rose-500'}>{btcTrend.toUpperCase()}</span>
                    </span>
                </div>

                {coins.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {coins.map((c, i) => (
                            <div key={i} className={`relative bg-zinc-950/40 border border-zinc-900 p-5 hover:bg-zinc-900/40 transition-all ${c.isSqueeze ? 'border-l-2 border-l-purple-600 bg-purple-900/10' : ''}`}>
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <div className="text-xl font-bold text-white">{c.symbol.replace('_USDT', '')}</div>
                                        <div className="flex gap-2 items-center mt-1 flex-wrap">
                                            <span className={`text-[10px] font-bold ${c.type === 'long' ? 'text-emerald-500' : 'text-rose-500'}`}>{c.type}</span>
                                            <span className="text-[8px] text-zinc-500">RSI: {c.rsi}</span>
                                            <span className={`text-[8px] border px-1.5 py-0.5 rounded-sm ${c.fundingRate.includes('-') ? 'text-emerald-400 border-emerald-900/50' : 'text-rose-400 border-rose-900/50'}`}>
                                                FUNDING: {c.fundingRate}
                                            </span>
                                            <span className={`text-[8px] border px-1.5 py-0.5 rounded-sm ${parseFloat(c.rvol) >= 2.0 ? 'text-amber-400 border-amber-900/50' : 'text-zinc-500 border-zinc-800'}`}>
                                                VOL: {c.rvol}x
                                            </span>
                                        </div>
                                        {c.isSqueeze && (
                                            <div className="mt-2 text-[8px] tracking-widest font-bold text-purple-400 animate-pulse">
                                                [ LIQUIDATION SQUEEZE DETECTED ]
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => copySignal(c, timeframeLabel)} className="text-[8px] text-zinc-500 border border-zinc-800 px-3 py-1 hover:text-white">COPY</button>
                                </div>
                                <div className="grid grid-cols-3 gap-2 border-t border-zinc-900/50 pt-4">
                                    <div className="flex flex-col"><span className="text-[7px] text-zinc-600 mb-1">ENTRY</span><span className="text-xs font-bold text-zinc-200">${c.entry}</span></div>
                                    <div className="flex flex-col items-center"><span className="text-[7px] text-emerald-600 mb-1">TARGET</span><span className="text-xs font-bold text-emerald-500">${c.tp2}</span></div>
                                    <div className="flex flex-col items-end"><span className="text-[7px] text-rose-600 mb-1">STOP</span><span className="text-xs font-bold text-rose-500/80">${c.sl}</span></div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-12 text-center border border-zinc-900/50 bg-zinc-950/20 mb-2">
                        <p className="text-[9px] tracking-[0.2em] text-zinc-600 uppercase">NO_EXTREME_SETUPS_CONFIRMED</p>
                    </div>
                )}
                
                {/* Watchlist wordt altijd getoond als er sudderende munten zijn, ongeacht of er confirmed setups zijn */}
                {renderWatchlist(watchCoins)}
            </div>
        );
    };

    return (
        <main className="min-h-screen bg-[#050505] text-zinc-400 p-4 md:p-12 font-mono uppercase tracking-tighter">
            <div className="max-w-6xl mx-auto">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-baseline mb-12 gap-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-[0.2em]">CRYPTO<span className="text-zinc-600">CROC</span> // ARCHITECT_VIEW</h1>
                        <p className="mt-2 text-[9px] tracking-widest text-blue-500 italic">TACTICAL_RADAR_ACTIVE</p>
                    </div>
                    <button 
                        onClick={scanMarket} 
                        disabled={loading} 
                        className="w-full md:w-auto border border-zinc-800 hover:border-zinc-200 hover:text-white px-8 py-3 text-[10px] transition-all disabled:opacity-20 bg-zinc-950"
                    >
                        {loading ? "[ SWEEPING_MARKET ]" : "[ EXECUTE_SWEEP ]"}
                    </button>
                </header>

                {loading ? (
                    <div className="py-32 text-center">
                        <p className="text-[10px] tracking-[0.3em] text-zinc-600 animate-pulse">Calculating_Relative_Volume & Plotting_Radar...</p>
                    </div>
                ) : (
                    <>
                        {renderTable("4H // MACRO TIMEFRAME", marketData.h4, btcTrends.h4, "4H")}
                        {renderTable("1H // INTRADAY TIMEFRAME", marketData.h1, btcTrends.h1, "1H")}
                        {renderTable("15M // SCALP TIMEFRAME", marketData.m15, btcTrends.m15, "15M")}
                    </>
                )}

                <footer className="mt-20 pt-8 border-t border-zinc-900 text-center text-[8px] text-zinc-800 tracking-[0.2em]">
                    ARCHITECT_TERMINAL_V7.0 // &copy; 2026 SPECIAL_FORCES
                </footer>
            </div>
        </main>
    );
}
