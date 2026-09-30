import { useState, useRef } from "react";
import CustomSelect from "../ui/CustomSelect";
import { toNameCase } from "../../helpers";
import { fmtQtyUnit } from "../../helpers/unitFormatter";
import { STATUS_FILTERS } from "../../hooks/useTransfers";
import FilterPopover from "../ui/FilterPopover";
import DatePicker from "../ui/DatePicker";
import StatusMark, { statusTone } from "../ui/StatusMark";
import { LedgerSkeleton, LedgerEmpty, ledgerRow, stopRow, RowIcon, RowCta } from "../ui/Ledger";
import { fmtDateShort, fmtTime } from "../../helpers/dates";

// Cómo se ve cada estado del documento. `sent` es el estado nuevo: la mercancía salió del
// origen y todavía no la ha contado nadie en el destino.
//
// Mismo criterio que las facturas: lo que terminó bien va en gris con su marca, y solo lo
// que pide que alguien actúe lleva color y filete en la fila (en tránsito, con faltantes).
export const TRANSFER_STATUS = {
    sent:                      { label: "En tránsito",   tone: "warning", flag: true },
    received:                  { label: "Recibida",      tone: "success", quiet: "check" },
    received_with_differences: { label: "Con faltantes", tone: "danger",  flag: true },
    cancelled:                 { label: "Anulada",       tone: "neutral", quiet: "void" },
};

const SWAP = "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4";

// "4 productos · 25 despachadas" o el producto y su cantidad cuando es uno solo.
export function resumenItems(t) {
    const items = t.items || [];
    if (items.length === 1) {
        return { title: items[0].product_name, sub: fmtQtyUnit(items[0].qty_sent, items[0].unit).toLowerCase() };
    }
    const nombres = items.slice(0, 2).map(i => i.product_name).join(", ");
    return {
        title: items.length > 2 ? `${nombres} y ${items.length - 2} más` : nombres,
        sub: `${t.item_count ?? items.length} productos · ${Number(t.total_sent || 0).toLocaleString("es-VE", { maximumFractionDigits: 3 })} despachadas`,
    };
}

const ArrowIcon = ({ className = "w-3.5 h-3.5" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
);

// Origen → destino. El origen en gris, el destino en tinta: es a donde va la mercancía.
export function Ruta({ t, className = "" }) {
    return (
        <span className={`inline-flex items-center gap-1.5 min-w-0 text-[13px] ${className}`}>
            <span className="text-content-muted dark:text-white/60 truncate">{t.from_warehouse_name ? toNameCase(t.from_warehouse_name) : "Externo"}</span>
            <ArrowIcon className="w-3.5 h-3.5 text-content-subtle/70 shrink-0" />
            <span className="font-semibold text-content dark:text-white truncate">{toNameCase(t.to_warehouse_name)}</span>
        </span>
    );
}

// Direcciones relativas al almacén filtrado (o a los del usuario, si no eligió ninguno).
const DIRECTIONS = [
    { value: "",    label: "Todas" },
    { value: "in",  label: "Entradas" },
    { value: "out", label: "Salidas" },
];

export default function TransfersView({
    transfers, summary, loading,
    search, setSearch, filters, setFilter, clearFilters, activeFilterCount, warehouses = [],
    onOpenDetail, onOpenReceive, canReceive, currentEmployeeId, isAdmin,
}) {
    const [showFilters, setShowFilters] = useState(false);
    const filtrosRef = useRef(null);

    // Quien despachó no puede firmar su propia llegada: el backend lo rechaza, esto solo
    // evita mostrar un botón que va a rebotar.
    const receivable = (t) =>
        t.status === "sent" && canReceive && (isAdmin || t.employee_id !== currentEmployeeId);

    // Quitar filtros también borra la búsqueda: la lista vacía puede venir de cualquiera de los dos.
    const quitarFiltros = () => { clearFilters(); setSearch(""); };

    const vacio = search || activeFilterCount > 1
        ? { title: "Nada coincide", hint: "Prueba con otro documento, producto o filtro." }
        : filters.status === "pending"
        ? { title: "Nada pendiente", hint: "No hay mercancía en tránsito ni faltantes por resolver." }
        : { title: "Sin transferencias", hint: "Cuando despaches mercancía entre almacenes aparecerá aquí." };

    return (
        <div className="flex-1 overflow-hidden flex flex-col">
            {/* ── Barra: buscador, filtros y el estado de la mercancía en la calle ── */}
            <div className="shrink-0 px-4 py-2 flex flex-wrap items-center gap-2 border-b border-border/20 dark:border-white/5">
                {/* Buscador: por número de documento o por producto, que es como se recuerda
                    una transferencia —el papel en la mano, o qué venía dentro—. */}
                <div className="relative flex-1 min-w-[180px] max-w-md">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="input h-9 pl-9 text-[13px] w-full"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="Buscar por documento o producto…"
                    />
                </div>

                {/* Filtros */}
                <div className="relative shrink-0">
                    <button ref={filtrosRef} onClick={() => setShowFilters(!showFilters)}
                        className={`h-9 px-3 flex items-center gap-2 rounded-lg text-[13px] font-medium border transition-colors ${activeFilterCount > 0 ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40" : "bg-white dark:bg-white/5 border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:bg-surface-2 hover:text-content dark:hover:text-white"}`}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                        Filtros
                        {activeFilterCount > 0 && <span className="min-w-4 h-4 px-1 rounded-full bg-content text-white dark:bg-white dark:text-black text-[10px] font-semibold flex items-center justify-center">{activeFilterCount}</span>}
                        <svg className={`w-3 h-3 transition-transform ${showFilters ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <FilterPopover open={showFilters} onClose={() => setShowFilters(false)} anchorRef={filtrosRef} width={288}>
                        <div className="p-4 space-y-4">
                                <div>
                                    <div className="text-[12px] font-medium text-content-subtle mb-1.5">Estado</div>
                                    <div className="grid grid-cols-2 gap-1">
                                        {STATUS_FILTERS.map(opt => (
                                            <button key={opt.value} onClick={() => setFilter("status", opt.value)}
                                                className={`px-2 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                                                    filters.status === opt.value
                                                        ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-500/40"
                                                        : "bg-surface-3 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"
                                                }`}>
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[12px] font-medium text-content-subtle mb-1.5">Almacén</div>
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
                                    <div className="text-[12px] font-medium text-content-subtle mb-1.5">Dirección</div>
                                    <div className="grid grid-cols-3 gap-1">
                                        {DIRECTIONS.map(opt => (
                                            <button key={opt.value} onClick={() => setFilter("direction", opt.value)}
                                                className={`px-2 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                                                    filters.direction === opt.value
                                                        ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-500/40"
                                                        : "bg-surface-3 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"
                                                }`}>
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    {/* Entrada o salida se leen contra el almacén elegido; sin almacén, contra
                                        los del propio usuario. El admin, que los ve todos, necesita elegir uno. */}
                                    {isAdmin && filters.direction && !filters.warehouseId && (
                                        <p className="text-[11px] text-content-subtle mt-1.5 leading-relaxed">
                                            Elige un almacén para que entradas y salidas tengan referencia
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <div className="text-[12px] font-medium text-content-subtle mb-1.5">Fecha</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <DatePicker value={filters.dateFrom} onChange={v => setFilter("dateFrom", v)} placeholder="Desde" />
                                        <DatePicker value={filters.dateTo} onChange={v => setFilter("dateTo", v)} placeholder="Hasta" />
                                    </div>
                                </div>
                                {activeFilterCount > 0 && (
                                    <button onClick={() => { clearFilters(); setShowFilters(false); }} className="w-full h-9 rounded-lg text-[13px] font-medium text-content-muted dark:text-white/70 border border-border dark:border-white/10 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                        Limpiar filtros
                                    </button>
                                )}
                        </div>
                    </FilterPopover>
                </div>

                {/* Lo que está en la calle, al otro extremo de la misma barra: es el dato que
                    hay que ver al entrar, y ocupando su propia fila desperdiciaba altura de
                    tabla. Son atajos: llevan al estado que corresponde. */}
                <div className="flex items-center gap-2 ml-auto">
                    {summary?.in_transit > 0 && (
                        <button
                            onClick={() => setFilter("status", "pending")}
                            className="btn-outline flex items-center gap-2 h-9 px-3 rounded-lg"
                        >
                            <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1" /></svg>
                            <span className="text-[13px] font-medium whitespace-nowrap">
                                {summary.in_transit} en tránsito
                            </span>
                        </button>
                    )}
                    {summary?.with_differences > 0 && (
                        <button
                            onClick={() => setFilter("status", "received")}
                            className="btn-outline flex items-center gap-2 h-9 px-3 rounded-lg"
                        >
                            <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0l-7.1 12.25A2 2 0 004.99 19z" /></svg>
                            <span className="text-[13px] font-medium whitespace-nowrap">
                                {summary.with_differences} con faltantes
                            </span>
                        </button>
                    )}
                </div>
            </div>

            {/* ── Libro (escritorio) ── */}
            <div className="hidden md:flex flex-1 overflow-hidden flex-col py-3 px-4">
                <div className="card-premium overflow-auto flex-1">
                    <table className="table-ledger min-w-[900px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4 w-[200px]">Documento</th>
                                <th className="w-[220px]">Ruta</th>
                                <th>Productos</th>
                                <th className="w-[170px]">Estado</th>
                                <th className="w-[200px]">Responsables</th>
                                <th className="w-[120px] pr-4" />
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? <LedgerSkeleton cols={6} rows={6} />
                                : transfers.length === 0 ? (
                                    <LedgerEmpty cols={6} title={vacio.title} hint={vacio.hint}
                                        onClear={activeFilterCount > 0 || search ? quitarFiltros : undefined} />
                                ) : transfers.map(t => {
                                    const r = resumenItems(t);
                                    const pendingDiff = t.difference_status === "pending";
                                    return (
                                        <tr key={t.id} {...ledgerRow(() => onOpenDetail(t), statusTone(t.status, TRANSFER_STATUS))}>
                                            <td className="pl-4">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <span className="w-8 h-8 rounded-full bg-surface-3 dark:bg-white/[0.06] text-content-muted dark:text-white/60 flex items-center justify-center shrink-0">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={SWAP} /></svg>
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="text-[13px] font-semibold text-content dark:text-white tabular-nums truncate">{t.code || `#${t.id}`}</div>
                                                        <div className="text-[12px] text-content-subtle tabular-nums truncate">
                                                            {fmtDateShort(t.dispatched_at || t.created_at)} · {fmtTime(t.dispatched_at || t.created_at)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="max-w-0"><Ruta t={t} className="max-w-full" /></td>
                                            <td className="max-w-0">
                                                <div className="text-[13px] font-medium text-content dark:text-white truncate" title={r.title}>{r.title}</div>
                                                <div className="text-[12px] text-content-subtle tabular-nums truncate">{r.sub}</div>
                                            </td>
                                            <td>
                                                <StatusMark status={t.status} map={TRANSFER_STATUS} />
                                                {pendingDiff && <div className="text-[12px] text-red-600 dark:text-red-400 mt-0.5 truncate">Faltante sin resolver</div>}
                                            </td>
                                            <td className="max-w-0">
                                                <div className="text-[13px] text-content dark:text-white truncate">{toNameCase(t.employee_name) || "Sistema"}</div>
                                                <div className="text-[12px] text-content-subtle truncate">
                                                    {t.received_by_name ? `Recibió ${toNameCase(t.received_by_name)}` : t.status === "cancelled" ? "No se recibió" : "Por recibir"}
                                                </div>
                                            </td>
                                            <td className="pr-4" onClick={stopRow}>
                                                <div className="flex items-center justify-end">
                                                    {receivable(t) && <RowCta onClick={() => onOpenReceive(t)}>Recibir</RowCta>}
                                                    <RowIcon icon="eye" title="Ver detalle" onClick={() => onOpenDetail(t)} />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Tarjetas (teléfono) ── */}
            <div className="md:hidden flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {loading ? (
                    <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                ) : transfers.length === 0 ? (
                    <div className="py-16 text-center px-6">
                        <div className="text-[14px] font-semibold text-content dark:text-white">{vacio.title}</div>
                        <div className="text-[13px] text-content-subtle mt-1">{vacio.hint}</div>
                    </div>
                ) : transfers.map(t => {
                    const r = resumenItems(t);
                    const pendingDiff = t.difference_status === "pending";
                    const tone = statusTone(t.status, TRANSFER_STATUS);
                    return (
                        <div key={t.id} role="button" tabIndex={0} onClick={() => onOpenDetail(t)}
                            onKeyDown={e => { if (e.key === "Enter") onOpenDetail(t); }}
                            style={tone ? { boxShadow: `inset 3px 0 0 ${tone}` } : undefined}
                            className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3 active:scale-[0.99] transition-transform">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-[14px] font-semibold text-content dark:text-white tabular-nums">{t.code || `#${t.id}`}</span>
                                <StatusMark status={t.status} map={TRANSFER_STATUS} />
                            </div>
                            <Ruta t={t} className="mt-1.5 max-w-full" />
                            <div className="mt-2 flex items-end justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-[13px] text-content dark:text-white truncate">{r.title}</div>
                                    <div className="text-[12px] text-content-subtle truncate">
                                        {r.sub} · {fmtDateShort(t.dispatched_at || t.created_at)}
                                    </div>
                                    {pendingDiff && <div className="text-[12px] text-red-600 dark:text-red-400">Faltante sin resolver</div>}
                                </div>
                                {receivable(t) && (
                                    <button onClick={e => { e.stopPropagation(); onOpenReceive(t); }}
                                        className="btn-accent h-9 px-4 rounded-lg text-[13px] font-semibold shrink-0 active:scale-95">
                                        Recibir
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
