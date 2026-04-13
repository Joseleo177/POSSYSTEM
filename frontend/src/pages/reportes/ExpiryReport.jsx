import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { fmtMoney } from "../../helpers";

export default function ExpiryReport() {
    const [loading, setLoading] = useState(true);
    const [lots, setLots] = useState([]);
    const [filter, setFilter] = useState("all"); // all, expired, soon

    useEffect(() => {
        const loadLots = async () => {
            setLoading(true);
            try {
                const r = await api.reports.expiry();
                // Convertimos las strings de fecha a objetos Date para los cálculos
                const formatted = r.data.map(l => ({
                    ...l,
                    expiryDate: new Date(l.expiry + "T00:00:00")
                }));
                setLots(formatted);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadLots();
    }, []);

    const getStatus = (expiryDate) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Solo comparar días
        const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return { label: "VENCIDO", class: "bg-danger text-white", icon: "✕" };
        if (diffDays <= 7) return { label: `VENCE EN ${diffDays} DÍAS`, class: "bg-orange-500 text-white", icon: "!" };
        if (diffDays <= 30) return { label: "PRÓXIMO A VENCER", class: "bg-warning text-black", icon: "⚠" };
        return { label: "VIGENTE", class: "bg-success text-black", icon: "✓" };
    };

    const filteredLots = lots.filter(l => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((l.expiryDate - today) / (1000 * 60 * 60 * 24));
        if (filter === "expired") return diffDays < 0;
        if (filter === "soon") return diffDays >= 0 && diffDays <= 30;
        return true;
    });

    if (loading) return <div className="p-20 text-center animate-pulse text-[10px] font-black uppercase tracking-widest opacity-40">Cargando cronograma de vencimientos...</div>;

    return (
        <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-6">
                <div className="flex gap-2">
                    {[
                        { key: "all", label: "Ver Todos" },
                        { key: "expired", label: "Vencidos" },
                        { key: "soon", label: "Próximos a Vencer" }
                    ].map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${filter === f.key ? "bg-brand-500 text-black shadow-lg shadow-brand-500/20" : "bg-surface-3 dark:bg-white/5 text-content-subtle hover:bg-white/10"}`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredLots.map(lot => {
                    const status = getStatus(lot.expiryDate);
                    return (
                        <div key={lot.id} className="bg-white dark:bg-white/[0.02] border border-black/5 dark:border-white/5 rounded-[24px] p-5 relative overflow-hidden group hover:border-brand-500/30 transition-all">
                            <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl text-[9px] font-black tracking-widest uppercase ${status.class}`}>
                                {status.icon} {status.label}
                            </div>
                            
                            <div className="flex flex-col h-full">
                                <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest mb-1 opacity-60">Lote: {lot.lot} · {lot.warehouse}</div>
                                <h3 className="text-sm font-black dark:text-white uppercase mb-4 leading-tight">{lot.product}</h3>
                                
                                <div className="mt-auto pt-4 border-t border-black/5 dark:border-white/5 flex items-end justify-between">
                                    <div>
                                        <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1">Stock en Lote</div>
                                        <div className="text-lg font-black dark:text-white tabular-nums">{lot.stock} <span className="text-[10px] opacity-40 uppercase">{lot.unit}</span></div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1">Vencimiento</div>
                                        <div className="text-sm font-black dark:text-white tabular-nums">{lot.expiryDate.toLocaleDateString()}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {filteredLots.length === 0 && (
                <div className="p-20 text-center border-2 border-dashed border-black/5 dark:border-white/5 rounded-[40px]">
                    <div className="text-4xl mb-4 opacity-20">🎉</div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-content-subtle">No hay alertas críticas en este momento</p>
                </div>
            )}
        </div>
    );
}
