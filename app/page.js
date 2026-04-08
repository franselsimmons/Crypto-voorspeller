"use client";
import { useState, useEffect, useCallback } from 'react';

export default function Home() {
    const [allCoins, setAllCoins] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // State voor de Pop-up
    const [selectedCoin, setSelectedCoin] = useState(null);
    const [orderbookData, setOrderbookData] = useState(null);
    const [loadingOrderbook, setLoadingOrderbook] = useState(false);

    const fetchSignals = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/scanner');
            const result = await res.json();
            if (result.success) setAllCoins(result.data);
        } catch (error) { console.error("Fout bij ophalen:", error); }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchSignals();
        const interval = setInterval(fetchSignals, 5 * 60 * 1000); 
        return () => clearInterval(interval);
    }, [fetchSignals]);

    // Functie als je op een coin klikt
    const handleCoinClick = async (coin) => {
        setSelectedCoin(coin);
        setOrderbookData(null);
        setLoadingOrderbook(true);
        
        try {
            const res = await fetch(`/api/orderbook?symbol=${coin.symbol}`);
            const result = await res.json();
            if (result.success) setOrderbookData(result);
        } catch (error) { console.error(error); }
        setLoadingOrderbook(false);
    };

    const top10Mixed = [...allCoins].sort((a, b) => b.score - a.score).slice(0, 10);
    const longSignals = allCoins.filter(c => c.type === 'long').sort((a, b) => parseFloat(a.rsi) - parseFloat(b.rsi));
    const shortSignals = allCoins.filter(c => c.type === 'short').sort((a, b) => parseFloat(b.rsi) - parseFloat(a.rsi));

    const Table = ({ title, data, color }) => (
        <div className="mb-12">
            <h2 className={`text-xl font-bold mb-4 flex items-center gap-2 ${color}`}>
                <span className="w-2 h-6 rounded-full bg-current opacity-50"></span>
                {title} ({data.length})
            </h2>
            <div className="bg-gray-800 rounded-lg shadow-xl overflow-x-auto border border-gray-700">
                <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                        <tr className="bg-gray-950 text-gray-400 text-sm uppercase">
                            <th className="p-4 border-b border-gray-700">Score</th>
                            <th className="p-4 border-b border-gray-700">Coin</th>
                            <th className="p-4 border-b border-gray-700">RSI (30)</th>
                            <th className="p-4 border-b border-gray-700 hidden sm:table-cell">Target Band</th>
                            <th className="p-4 border-b border-gray-700">Signaal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((coin, index) => (
                            <tr 
                                key={index} 
                                onClick={() => handleCoinClick(coin)}
                                className="hover:bg-gray-700 cursor-pointer transition-colors border-b border-gray-700 last:border-none"
                            >
                                <td className="p-4">
                                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-900 text-blue-400 font-bold border border-gray-700">
                                        {Math.round(coin.score)}
                                    </div>
                                </td>
                                <td className="p-4 font-bold text-lg">{coin.symbol.replace('USDT', '')}</td>
                                <td className="p-4 font-mono font-bold">{coin.rsi}</td>
                                <td className="p-4 font-mono text-gray-400 hidden sm:table-cell">
                                    {coin.type === 'long' ? <span className="text-green-500">{coin.L1}</span> : <span className="text-red-500">{coin.U1}</span>}
                                </td>
                                <td className="p-4">
                                    <span className={`px-3 py-1 rounded text-sm font-bold whitespace-nowrap border ${
                                        coin.type === 'long' ? 'bg-green-900/40 text-green-300 border-green-700' :
                                        coin.type === 'short' ? 'bg-red-900/40 text-red-300 border-red-700' :
                                        'bg-gray-700 text-gray-300 border-gray-600'
                                    }`}>
                                        {coin.signal}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {data.length === 0 && (
                    <div className="p-8 text-center text-gray-500 italic">Geen kansen gevonden in deze categorie.</div>
                )}
            </div>
        </div>
    );

    return (
        <main className="min-h-screen p-4 md:p-8 font-sans bg-gray-950 text-white relative">
            <div className="max-w-5xl mx-auto">
                <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-white italic">CRYPTO<span className="text-blue-500">CROC</span> SCANNER</h1>
                        <p className="text-gray-500 font-medium">Klik op een coin voor TP & SL niveaus</p>
                    </div>
                    <button 
                        onClick={fetchSignals} 
                        className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-full font-black uppercase tracking-wider transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50"
                        disabled={loading}
                    >
                        {loading ? "Systeem Scant..." : "Ververs Markt"}
                    </button>
                </header>

                <Table title="Top 10 Beste Kansen (Mixed)" data={top10Mixed} color="text-blue-400" />
                <div className="grid grid-cols-1 gap-4">
                    <Table title="Potentiële Longs (Onderste Banden)" data={longSignals} color="text-green-400" />
                    <Table title="Potentiële Shorts (Bovenste Banden)" data={shortSignals} color="text-red-400" />
                </div>
            </div>

            {/* POP-UP (MODAL) */}
            {selectedCoin && (
                <div className="fixed inset-0 bg-black/80 flex justify-center items-center p-4 z-50 backdrop-blur-sm" onClick={() => setSelectedCoin(null)}>
                    <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="bg-gray-950 p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-2xl font-black tracking-wider">{selectedCoin.symbol.replace('USDT', '')} <span className="text-gray-500 text-sm font-normal">/ USDT</span></h3>
                            <button onClick={() => setSelectedCoin(null)} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                        </div>
                        
                        <div className="p-6">
                            <div className="mb-6 flex justify-between items-center bg-gray-800 p-4 rounded-lg">
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold">Richting</p>
                                    <p className={`text-lg font-bold ${selectedCoin.type === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                                        {selectedCoin.type === 'long' ? 'LONG OPZET' : 'SHORT OPZET'}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-400 uppercase font-bold">Signaal / RSI</p>
                                    <p className="font-mono text-lg">{selectedCoin.rsi}</p>
                                </div>
                            </div>

                            {loadingOrderbook ? (
                                <div className="text-center py-8 text-gray-400 animate-pulse">Orderboek & Muren analyseren...</div>
                            ) : orderbookData ? (
                                <div className="space-y-4">
                                    <div className="flex justify-between border-b border-gray-800 pb-2">
                                        <span className="text-gray-400">Actuele Prijs:</span>
                                        <span className="font-mono font-bold text-white">${orderbookData.currentPrice}</span>
                                    </div>
                                    
                                    {/* Dynamische TP en SL gebaseerd op het type trade (Long of Short) */}
                                    <div className="bg-green-900/20 border border-green-900/50 p-4 rounded-lg flex justify-between items-center">
                                        <div>
                                            <p className="text-green-400 font-bold text-sm uppercase">Take Profit (TP)</p>
                                            <p className="text-xs text-gray-500 mt-1">Grootste {selectedCoin.type === 'long' ? 'Verkoopmuur' : 'Koopmuur'}</p>
                                        </div>
                                        <p className="font-mono font-bold text-xl text-green-300">
                                            ${selectedCoin.type === 'long' ? orderbookData.resistance : orderbookData.support}
                                        </p>
                                    </div>

                                    <div className="bg-red-900/20 border border-red-900/50 p-4 rounded-lg flex justify-between items-center">
                                        <div>
                                            <p className="text-red-400 font-bold text-sm uppercase">Stop Loss (SL)</p>
                                            <p className="text-xs text-gray-500 mt-1">Achter {selectedCoin.type === 'long' ? 'Koopmuur' : 'Verkoopmuur'}</p>
                                        </div>
                                        <p className="font-mono font-bold text-xl text-red-300">
                                            ${selectedCoin.type === 'long' ? orderbookData.support : orderbookData.resistance}
                                        </p>
                                    </div>
                                    
                                    <p className="text-xs text-gray-500 text-center mt-4 italic">
                                        *Niveaus gebaseerd op de grootste volume-muren in het MEXC Orderboek.
                                    </p>
                                </div>
                            ) : (
                                <div className="text-center py-4 text-red-400">Orderboek data onbeschikbaar.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
