"use client";
import { useState, useEffect, useCallback } from 'react';

export default function Home() {
    const [marketData, setMarketData] = useState({ m15: [], h1: [], h4: [] });
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

    const renderTable = (title, coins, btcTrend, timeframeLabel) => (
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
                        <div key={i} className={`relative bg-zinc-950/40 border border-zinc-900 p-5 hover:bg-zinc-900/40 transition-all ${i === 0 ? 'border-l-2 border-l-amber-600' : ''}`}>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="text-xl font-bold text-white">{c.symbol.replace('_USDT', '')}</div>
                                    <div className="flex gap-3 items-center mt-1">
                                        <span className={`text-[10px] font-bold ${c.type === 'long' ? 'text-emerald-500' : 'text-rose-500'}`}>{c.type}</span>
                                        <span className="text-[8px] text-zinc-500">RSI: {c.rsi}</span>
                                    </div>
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
                <div className="py-12 text-center border border-dashed border-zinc-900/50 bg-zinc-950/10">
                    <p className="text-[9px] tracking-[0.2em] text-zinc-700 uppercase">NO_EXTREME_SETUPS_FOUND</p>
                </div>
            )}
        </div>
    );

    return (
        <main className="min-h-screen bg-[#050505] text-zinc-400 p-4 md:p-12 font-mono uppercase tracking-tighter">
            <div className="max-w-6xl mx-auto">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-baseline mb-12 gap-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-[0.2em]">CRYPTO<span className="text-zinc-600">CROC</span> // OMNI_TERMINAL</h1>
                        <p className="mt-2 text-[9px] tracking-widest text-emerald-500 italic">MTF_SCANNER_ACTIVE</p>
                    </div>
                    <button 
                        onClick={scanMarket} 
                        disabled={loading} 
                        className="w-full md:w-auto border border-zinc-800 hover:border-zinc-200 hover:text-white px-8 py-3 text-[10px] transition-all disabled:opacity-20 bg-zinc-950"
                    >
                        {loading ? "[ RUNNING_OMNI_SCAN ]" : "[ EXECUTE_OMNI_SCAN ]"}
                    </button>
                </header>

                {loading ? (
                    <div className="py-32 text-center">
                        <p className="text-[10px] tracking-[0.3em] text-zinc-600 animate-pulse">Scanning_1000+_Data_Points...</p>
                    </div>
                ) : (
                    <>
                        {renderTable("4H // MACRO TIMEFRAME", marketData.h4, btcTrends.h4, "4H")}
                        {renderTable("1H // INTRADAY TIMEFRAME", marketData.h1, btcTrends.h1, "1H")}
                        {renderTable("15M // SCALP TIMEFRAME", marketData.m15, btcTrends.m15, "15M")}
                    </>
                )}

                <footer className="mt-20 pt-8 border-t border-zinc-900 text-center text-[8px] text-zinc-800 tracking-[0.2em]">
                    FUTURES_OMNI_TERMINAL_V5.0 // &copy; 2026 ACCESS_GRANTED
                </footer>
            </div>
        </main>
    );
}
