import { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";

const STATUS_TABS = [
    { key: "all",      label: "Todos" },
    { key: "borrador", label: "Borrador" },
    { key: "pendiente",label: "Pendiente" },
    { key: "parcial",  label: "Parcial" },
];

function StatusBadge({ status }) {
    const map = {
        borrador:  "bg-white/5 text-white/40 border-white/10",
        pendiente: "bg-danger/10 text-danger border-danger/20",
        parcial:   "bg-brand-500/10 text-brand-500 border-brand-500/20",
        pagado:    "bg-green-500/10 text-green-500 border-green-500/20",
    };
    const label = { borrador: "Borrador", pendiente: "Pendiente", parcial: "Parcial", pagado: "Pagado" };
    return (
        <span className={`text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border ${map[status] || "bg-white/5 text-white/40 border-white/10"}`}>
            {label[status] || status}
        </span>
    );
}

export default function PendingSalesModal({ open, onClose, onSelect, baseCurrency }) {
    const [sales, setSales]         = useState([]);
    const [loading, setLoading]     = useState(false);
    const [search, setSearch]       = useState("");
    const [statusTab, setStatusTab] = useState("all");
    const sym = baseCurrency?.symbol || "$";

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { limit: 100 };
            if (search.trim()) params.search = search.trim();
            const r = await api.sales.getPending(params);
            setSales(r.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        if (!open) return;
        const t = setTimeout(load, search ? 300 : 0);
        return () => clearTimeout(t);
    }, [open, load, search]);

    useEffect(() => {
        if (!open) { setSearch(""); setStatusTab("all"); }
    }, [open]);

    if (!open) return null;

    const filtered = statusTab === "all" ? sales : sales.filter(s => s.status === statusTab);

    const fmt = (n) => `${sym}${parseFloat(n || 0).toFixed(2)}`;
    const fmtDate = (d) => {
        if (!d) return "—";
        const dt = new Date(d);
        return `${dt.getDate().toString().padStart(2,"0")}/${(dt.getMonth()+1).toString().padStart(2,"0")} ${dt.getHours().toString().padStart(2,"0")}:${dt.getMinutes().toString().padStart(2,"0")}`;
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="w-full max-w-3xl bg-[#0c0c0c] rounded-2xl border border-white/8 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" style={{ maxHeight: "85vh" }}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-warning/10 flex items-center justify-center border border-warning/20">
                            <svg className="w-4.5 h-4.5 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-white/30">POS</div>
                            <h2 className="text-sm font-black text-white">Facturas Pendientes</h2>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Toolbar */}
                <div className="px-5 py-3 border-b border-white/5 shrink-0 flex items-center gap-3">
                    {/* Search */}
                    <div className="relative flex-1 max-w-xs">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por nro. o cliente..."
                            className="w-full h-9 bg-white/5 border border-white/8 rounded-xl pl-9 pr-3 text-[11px] text-white placeholder:text-white/25 focus:outline-none focus:border-brand-500/50 focus:bg-brand-500/5 transition-all"
                        />
                    </div>
                    {/* Status tabs */}
                    <div className="flex items-center gap-1 ml-auto">
                        {STATUS_TABS.map(t => (
                            <button key={t.key} onClick={() => setStatusTab(t.key)}
                                className={`h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${statusTab === t.key ? "bg-brand-500 text-black" : "bg-white/5 text-white/40 hover:text-white hover:bg-white/10"}`}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-white/30">
                            <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span className="text-[11px] font-bold">Cargando...</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-white/20">
                            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-[11px] font-bold">No hay facturas pendientes</span>
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-white/5 text-[9px] font-black uppercase tracking-widest text-white/25 sticky top-0 bg-[#0c0c0c]">
                                    <th className="px-5 py-3">Factura</th>
                                    <th className="px-3 py-3">Cliente</th>
                                    <th className="px-3 py-3 text-right">Total</th>
                                    <th className="px-3 py-3 text-right">Pagado</th>
                                    <th className="px-3 py-3 text-right">Saldo</th>
                                    <th className="px-3 py-3">Estado</th>
                                    <th className="px-3 py-3">Fecha</th>
                                    <th className="px-3 py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(sale => (
                                    <tr key={sale.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors group">
                                        <td className="px-5 py-3">
                                            <span className="text-[11px] font-black text-white tabular-nums">
                                                {sale.invoice_number || `Borrador #${sale.id}`}
                                            </span>
                                            {sale.serie_name && (
                                                <div className="text-[9px] text-white/25 font-bold">{sale.serie_name}</div>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 max-w-[140px]">
                                            <span className="text-[11px] text-white/70 font-bold truncate block">
                                                {sale.customer_name || <span className="text-white/25 italic">Sin cliente</span>}
                                            </span>
                                            {sale.customer_rif && <div className="text-[9px] text-white/25">{sale.customer_rif}</div>}
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums">
                                            <span className="text-[11px] font-black text-white/80">{fmt(sale.total)}</span>
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums">
                                            <span className={`text-[11px] font-bold ${sale.amount_paid > 0 ? "text-green-400" : "text-white/25"}`}>
                                                {fmt(sale.amount_paid)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums">
                                            <span className={`text-[12px] font-black ${sale.balance > 0 ? "text-warning" : "text-green-400"}`}>
                                                {fmt(sale.balance)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3">
                                            <StatusBadge status={sale.status} />
                                        </td>
                                        <td className="px-3 py-3">
                                            <span className="text-[10px] text-white/30 font-bold tabular-nums">{fmtDate(sale.created_at)}</span>
                                        </td>
                                        <td className="px-3 py-3">
                                            <button
                                                onClick={() => onSelect(sale)}
                                                className="h-7 px-3 bg-brand-500/10 text-brand-500 border border-brand-500/20 hover:bg-brand-500 hover:text-black rounded-lg text-[10px] font-black uppercase tracking-wide transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                Cobrar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer count */}
                {!loading && filtered.length > 0 && (
                    <div className="px-5 py-2.5 border-t border-white/5 shrink-0 flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/20">
                            {filtered.length} factura{filtered.length !== 1 ? "s" : ""}
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-warning">
                            Saldo total: {fmt(filtered.reduce((s, x) => s + parseFloat(x.balance || 0), 0))}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
