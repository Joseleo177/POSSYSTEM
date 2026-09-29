import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { fmtMoney } from "../../helpers";
import CustomSelect from "../../components/ui/CustomSelect";

export default function ExpiryReport() {
    const [loading, setLoading] = useState(true);
    const [lots, setLots] = useState([]);
    const [filter, setFilter] = useState("all"); // all, expired, soon

    // Los lotes viven en un almacén concreto: sin poder elegir cuál, un vencimiento en la
    // Sucursal A aparecía igual en la pantalla de la B, que no tiene esa mercancía.
    const [warehouseId, setWarehouseId] = useState("");
    const [warehouses, setWarehouses] = useState([]);
    useEffect(() => {
        api.warehouses.getAll()
            .then(r => setWarehouses(r.data || []))
            .catch(e => console.error("[ExpiryReport] no se pudieron cargar los almacenes:", e));
    }, []);
    const todasLabel = warehouses.length === 1 ? warehouses[0].name : "Todas las sucursales";

    useEffect(() => {
        const loadLots = async () => {
            setLoading(true);
            try {
                const r = await api.reports.expiry(warehouseId ? { warehouse_id: warehouseId } : {});
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
    }, [warehouseId]);

    const getStatus = (expiryDate) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Solo comparar días
        const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return { label: "VENCIDO", class: "bg-danger text-white", icon: "✕" };
        if (diffDays <= 7) return { label: `VENCE EN ${diffDays} DÍAS`, class: "bg-orange-500 text-white", icon: "!" };
        if (diffDays <= 30) return { label: "Próximo a vencer", class: "bg-warning text-black", icon: "⚠" };
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

    if (loading) return <div className="p-20 text-center animate-pulse text-[11px] font-bold opacity-40">Cargando cronograma de vencimientos...</div>;

    return (
        <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div className="flex gap-2">
                    {[
                        { key: "all", label: "Ver todos" },
                        { key: "expired", label: "Vencidos" },
                        { key: "soon", label: "Próximos a vencer" }
                    ].map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${filter === f.key ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-500/40 shadow-sm" : "bg-surface-3 dark:bg-white/5 text-content-subtle hover:bg-white/10"}`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                {/* Con una sola sucursal no hay nada que elegir: mostrar el selector solo
                    insinuaría que hay más, cuando no las hay. */}
                {warehouses.length > 1 && (
                <CustomSelect
                    value={warehouseId}
                    onChange={setWarehouseId}
                    placeholder={todasLabel}
                    boxClassName="h-9 min-w-[190px]"
                    options={[
                        { value: "", label: todasLabel },
                        ...warehouses.map(w => ({ value: String(w.id), label: w.name }))
                    ]}
                />
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredLots.map(lot => {
                    const status = getStatus(lot.expiryDate);
                    return (
                        <div key={lot.id} className="bg-white dark:bg-white/[0.02] border border-black/5 dark:border-white/5 rounded-[24px] p-5 relative overflow-hidden group hover:border-brand-500/30 transition-all">
                            <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl text-[10px] font-bold ${status.class}`}>
                                {status.icon} {status.label}
                            </div>

                            <div className="flex flex-col h-full">
                                <div className="text-[11px] font-semibold text-content-subtle uppercase tracking-[0.08em] mb-1 opacity-60">Lote: {lot.lot} · {lot.warehouse}</div>
                                <h3 className="text-sm font-bold dark:text-white mb-4 leading-tight">{lot.product}</h3>

                                <div className="mt-auto pt-4 border-t border-black/5 dark:border-white/5 flex items-end justify-between">
                                    <div>
                                        <div className="text-[12px] font-medium text-content-subtle mb-1">Stock en lote</div>
                                        <div className="text-lg font-bold dark:text-white tabular-nums">{lot.stock} <span className="text-[11px] opacity-40 uppercase">{lot.unit}</span></div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[12px] font-medium text-content-subtle mb-1">Vencimiento</div>
                                        <div className="text-sm font-bold dark:text-white tabular-nums">{lot.expiryDate.toLocaleDateString()}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {filteredLots.length === 0 && (
                <div className="p-20 text-center border-2 border-dashed border-black/5 dark:border-white/5 rounded-[40px]">
                    <p className="text-[12px] font-bold text-content-subtle">No hay alertas críticas en este momento</p>
                </div>
            )}
        </div>
    );
}
