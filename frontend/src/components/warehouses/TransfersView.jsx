import { useState } from "react";
import CustomSelect from "../ui/CustomSelect";
import { fmtDate } from "../../helpers";
import { fmtQtyUnit } from "../../helpers/unitFormatter";
import { STATUS_FILTERS } from "../../hooks/useTransfers";

// Cómo se ve cada estado del documento. `sent` es el estado nuevo: la mercancía salió del
// origen y todavía no la ha contado nadie en el destino.
export const STATUS_META = {
    sent:                      { label: "En tránsito",   badge: "badge-warning" },
    received:                  { label: "Recibida",      badge: "badge-success" },
    received_with_differences: { label: "Con faltantes", badge: "badge-danger"  },
    cancelled:                 { label: "Anulada",       badge: "badge-neutral" },
};

const ArrowIcon = ({ className = "w-3.5 h-3.5" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
);

// Direcciones relativas al almacén filtrado (o a los del usuario, si no eligió ninguno).
const DIRECTIONS = [
    { value: "",    label: "Todas" },
    { value: "in",  label: "Entradas" },
    { value: "out", label: "Salidas" },
];

// Reparto de la tabla. Sin anchos declarados el navegador dimensiona por el texto de cada
// cabecera y amontona todo a la izquierda, dejando un hueco muerto a la derecha en pantallas
// anchas —y peor aún con la lista vacía, donde no hay contenido que reparta el espacio—.
const COLUMNS = [
    { label: "Documento",    width: "w-[15%]" },
    { label: "Ruta",         width: "w-[23%]" },
    { label: "Productos",    width: "w-[20%]" },
    { label: "Estado",       width: "w-[14%]" },
    { label: "Responsables", width: "w-[14%]" },
    { label: "",             width: "w-[14%]" },
];

export default function TransfersView({
    transfers, summary, loading,
    search, setSearch, filters, setFilter, clearFilters, activeFilterCount, warehouses = [],
    onOpenDetail, onOpenReceive, canReceive, currentEmployeeId, isAdmin,
}) {
    const [showFilters, setShowFilters] = useState(false);

    // Quien despachó no puede firmar su propia llegada: el backend lo rechaza, esto solo
    // evita mostrar un botón que va a rebotar.
    const receivable = (t) =>
        t.status === "sent" && canReceive && (isAdmin || t.employee_id !== currentEmployeeId);

    return (
        <div className="flex-1 overflow-hidden flex flex-col">
            {/* ── Barra: buscador, filtros y el estado de la mercancía en la calle ── */}
            <div className="shrink-0 px-4 py-2 flex flex-wrap items-center gap-2 border-b border-border/20 dark:border-white/5">
                {/* Buscador: por número de documento o por producto, que es como se recuerda
                    una transferencia —el papel en la mano, o qué venía dentro—. */}
                <div className="relative flex-1 min-w-[180px] max-w-md">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="input h-9 pl-9 text-[11px] w-full"
                        placeholder="Buscar por documento o producto..."
                    />
                </div>

                {/* Filtros */}
                <div className="relative shrink-0">
                    <button onClick={() => setShowFilters(!showFilters)}
                        className={`h-9 px-3 flex items-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${activeFilterCount > 0 ? "bg-warning/10 border-warning/30 text-warning" : "bg-surface-2 dark:bg-white/5 border-border/40 dark:border-white/10 text-content-subtle hover:text-content"}`}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                        Filtros
                        {activeFilterCount > 0 && <span className="w-4 h-4 rounded-full bg-warning text-black text-[9px] font-black flex items-center justify-center">{activeFilterCount}</span>}
                        <svg className={`w-3 h-3 transition-transform ${showFilters ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {showFilters && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setShowFilters(false)} />
                            <div className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] bg-surface-2 dark:bg-surface-dark-2 rounded-2xl border border-border/40 dark:border-white/10 shadow-2xl z-40 p-4 animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
                                <div>
                                    <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1.5">Estado</div>
                                    <div className="grid grid-cols-2 gap-1">
                                        {STATUS_FILTERS.map(opt => (
                                            <button key={opt.value} onClick={() => setFilter("status", opt.value)}
                                                className={`px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                                    filters.status === opt.value
                                                        ? "bg-brand-500 text-black"
                                                        : "bg-surface-3 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"
                                                }`}>
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1.5">Almacén</div>
                                    <CustomSelect
                                        value={filters.warehouseId}
                                        onChange={val => setFilter("warehouseId", val)}
                                        height="h-9"
                                        options={[
                                            { value: "", label: "Todos" },
                                            ...warehouses.filter(w => w.active).map(w => ({ value: String(w.id), label: w.name })),
                                        ]}
                                    />
                                </div>
                                <div>
                                    <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1.5">Dirección</div>
                                    <div className="grid grid-cols-3 gap-1">
                                        {DIRECTIONS.map(opt => (
                                            <button key={opt.value} onClick={() => setFilter("direction", opt.value)}
                                                className={`px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                                    filters.direction === opt.value
                                                        ? "bg-brand-500 text-black"
                                                        : "bg-surface-3 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"
                                                }`}>
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    {/* Entrada o salida se leen contra el almacén elegido; sin almacén, contra
                                        los del propio usuario. El admin, que los ve todos, necesita elegir uno. */}
                                    {isAdmin && filters.direction && !filters.warehouseId && (
                                        <p className="text-[9px] font-bold text-warning mt-1.5 leading-relaxed">
                                            Elige un almacén para que entradas y salidas tengan referencia
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1.5">Fecha</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="date"
                                            value={filters.dateFrom}
                                            onChange={e => setFilter("dateFrom", e.target.value)}
                                            className="input h-9 text-[10px] px-2"
                                            title="Desde"
                                        />
                                        <input
                                            type="date"
                                            value={filters.dateTo}
                                            onChange={e => setFilter("dateTo", e.target.value)}
                                            className="input h-9 text-[10px] px-2"
                                            title="Hasta"
                                        />
                                    </div>
                                </div>
                                {activeFilterCount > 0 && (
                                    <button onClick={() => { clearFilters(); setShowFilters(false); }} className="w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-danger hover:bg-danger/10 transition-all border border-danger/20">
                                        Limpiar filtros
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Lo que está en la calle, al otro extremo de la misma barra: es el dato que
                    hay que ver al entrar, y ocupando su propia fila desperdiciaba altura de
                    tabla. Son atajos: llevan al estado que corresponde. */}
                <div className="flex items-center gap-2 ml-auto">
                    {summary?.in_transit > 0 && (
                        <button
                            onClick={() => setFilter("status", "pending")}
                            className="flex items-center gap-2 h-9 px-3 rounded-xl bg-warning/10 border border-warning/25 hover:bg-warning/20 transition-all"
                        >
                            <svg className="w-3.5 h-3.5 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1" /></svg>
                            <span className="text-[10px] font-black uppercase tracking-widest text-warning whitespace-nowrap">
                                {summary.in_transit} en tránsito
                            </span>
                        </button>
                    )}
                    {summary?.with_differences > 0 && (
                        <button
                            onClick={() => setFilter("status", "received")}
                            className="flex items-center gap-2 h-9 px-3 rounded-xl bg-danger/10 border border-danger/25 hover:bg-danger/20 transition-all"
                        >
                            <svg className="w-3.5 h-3.5 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0l-7.1 12.25A2 2 0 004.99 19z" /></svg>
                            <span className="text-[10px] font-black uppercase tracking-widest text-danger whitespace-nowrap">
                                {summary.with_differences} con faltantes
                            </span>
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col py-3 px-4">
                <div className="card-premium overflow-auto flex-1">
                    <table className="table-pos table-fixed min-w-[980px]">
                        <thead>
                            <tr>
                                {COLUMNS.map((c, i) => (
                                    <th key={i} className={`text-left ${c.width}`}>{c.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40 dark:divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="py-20 text-center text-[11px] font-black uppercase tracking-widest text-content-subtle opacity-50">
                                        Cargando transferencias...
                                    </td>
                                </tr>
                            ) : transfers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-20 text-center">
                                        <div className="flex flex-col items-center gap-3 opacity-40">
                                            <svg className="w-10 h-10 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                                            <div className="text-[11px] font-black uppercase tracking-widest text-content-subtle">
                                                {search || activeFilterCount > 1
                                                    ? "Nada coincide con la búsqueda"
                                                    : filters.status === "pending"
                                                    ? "No hay transferencias pendientes"
                                                    : "No hay transferencias registradas"}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : transfers.map(t => {
                                const meta = STATUS_META[t.status] || STATUS_META.sent;
                                const pendingDiff = t.difference_status === "pending";
                                return (
                                    <tr key={t.id} className="group transition-colors">
                                        <td>
                                            <div className="font-black text-content dark:text-white text-xs uppercase tracking-tight tabular-nums truncate">
                                                {t.code || `#${t.id}`}
                                            </div>
                                            <div className="text-[10px] font-bold text-content-subtle tabular-nums uppercase opacity-70 truncate">
                                                {fmtDate(t.dispatched_at || t.created_at)}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                {t.from_warehouse_name ? (
                                                    <span className="badge badge-warning shadow-none text-[10px] truncate">{t.from_warehouse_name}</span>
                                                ) : (
                                                    <span className="text-[10px] text-content-subtle uppercase italic">Externo</span>
                                                )}
                                                <ArrowIcon className="w-3 h-3 text-content-subtle opacity-50 shrink-0" />
                                                <span className="badge badge-success shadow-none text-[10px] truncate">{t.to_warehouse_name}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight truncate">
                                                {t.item_count === 1
                                                    ? t.items[0]?.product_name
                                                    : `${t.item_count} productos`}
                                            </div>
                                            <div className="text-[9px] font-bold text-content-subtle tabular-nums truncate">
                                                {t.item_count === 1
                                                    ? fmtQtyUnit(t.items[0]?.qty_sent, t.items[0]?.unit)
                                                    : `${t.total_sent} despachadas`}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge ${meta.badge} shadow-none text-[10px]`}>{meta.label}</span>
                                            {pendingDiff && (
                                                <div className="text-[9px] font-black uppercase tracking-wide text-danger mt-0.5 truncate">
                                                    Faltante sin resolver
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <div className="text-[10px] font-black text-content dark:text-white uppercase tracking-tighter truncate">
                                                {t.employee_name || "Sistema"}
                                            </div>
                                            <div className="text-[9px] font-bold text-content-subtle uppercase truncate opacity-70">
                                                {t.received_by_name ? `Recibió: ${t.received_by_name}` : "Sin recibir"}
                                            </div>
                                        </td>
                                        <td>
                                            {/* Botones siempre visibles: en tablet no hay hover que valga. */}
                                            <div className="flex items-center justify-end gap-2">
                                                {receivable(t) && (
                                                    <button
                                                        onClick={() => onOpenReceive(t)}
                                                        className="h-8 px-3 rounded-lg bg-brand-500 text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all"
                                                    >
                                                        Recibir
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => onOpenDetail(t)}
                                                    className="h-8 px-3 rounded-lg border border-border/40 dark:border-white/10 text-[10px] font-black uppercase tracking-widest text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-2/60 dark:hover:bg-white/5 active:scale-95 transition-all"
                                                >
                                                    Ver
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
