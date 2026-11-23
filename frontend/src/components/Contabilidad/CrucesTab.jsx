// Contabilidad → Cuentas → Cruces: todos los cruces de cuentas con proveedores (services/cruces
// en el backend). Antes solo se veían dentro de la ficha de cada contacto (23-11-2026: "en ningún
// otro lado puedes ver los cruces que se han hecho"). Cada uno dice qué saldó de cada lado: las
// compras que se le debían al proveedor y las facturas que él debía como cliente.
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import { fmtDateShort, toNameCase } from "../../helpers";
import StatusMark from "../ui/StatusMark";
import Money from "../ui/Money";
import { ledgerRow, stopRow, LedgerSkeleton, LedgerEmpty, RowIcon } from "../ui/Ledger";
import ConfirmModal from "../ui/ConfirmModal";
import DateRangePicker from "../ui/DateRangePicker";

const saldo = (c) => [
    ...c.compras.map(x => `Compra #${x.id}`),
    ...c.ventas.map(x => x.numero ? `Factura ${x.numero}` : `Venta #${x.id}`),
].join(" · ");

export default function CrucesTab({ notify }) {
    const { baseCurrency, can } = useApp();
    const fmt = (n) => `${baseCurrency?.symbol || "Ref."} ${Number(n || 0).toFixed(2)}`;
    const puedeAnular = can("customers.cross");

    const [data, setData] = useState({ resumen: { cruces: 0, total: 0, anulados: 0 }, cruces: [] });
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [debounced, setDebounced] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [showFilterDrop, setShowFilterDrop] = useState(false);
    const [toAnnul, setToAnnul] = useState(null);

    useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(t); }, [search]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (debounced) params.buscar = debounced;
            if (dateFrom) params.desde = dateFrom;
            if (dateTo) params.hasta = dateTo;
            const r = await api.cruces.listar(params);
            setData(r.data);
        } catch (e) { notify(e.message, "err"); }
        setLoading(false);
    }, [debounced, dateFrom, dateTo, notify]);
    useEffect(() => { load(); }, [load]);

    const anular = async () => {
        try {
            await api.cruces.anular(toAnnul.id);
            notify(`Cruce #${toAnnul.id} anulado: las dos deudas vuelven como estaban`);
            setToAnnul(null);
            load();
        } catch (e) { notify(e.message, "err"); }
    };

    const hasFilters = !!(dateFrom || dateTo);
    const items = data.cruces;
    const acciones = (c) => (
        <div className="flex items-center justify-end gap-0.5">
            {c.estado === "activo" && puedeAnular && (
                <RowIcon icon="ban" tone="danger" title="Anular este cruce" onClick={() => setToAnnul(c)} />
            )}
        </div>
    );

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input type="text" placeholder="Buscar por contacto, RIF, nota o N° de cruce..." value={search}
                        onChange={e => setSearch(e.target.value)} autoComplete="off" className="input h-9 pl-9 w-full" />
                </div>
                <div className="relative">
                    <button onClick={() => setShowFilterDrop(p => !p)}
                        className={["h-9 px-3 rounded-lg text-[13px] font-medium border flex items-center gap-2 transition-colors",
                            hasFilters ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40"
                                : "bg-white dark:bg-white/5 border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:bg-surface-2 hover:text-content dark:hover:text-white"].join(" ")}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        Filtros
                        {hasFilters && <span className="bg-content text-white dark:bg-white dark:text-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center text-[10px]">1</span>}
                    </button>
                    {showFilterDrop && (
                        <>
                            <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
                            <div className="absolute top-full right-0 mt-1 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-surface-dark-2 border border-black/[0.07] dark:border-white/10 rounded-xl shadow-[0_12px_40px_-8px_rgb(0_0_0/0.22)] z-[70] popover-in">
                                <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                    <div className="text-[12px] font-medium text-content-subtle mb-2">Rango de fecha</div>
                                    <DateRangePicker from={dateFrom} to={dateTo} setFrom={setDateFrom} setTo={setDateTo} />
                                </div>
                                <div className="px-4 py-2">
                                    <button onClick={() => { setDateFrom(""); setDateTo(""); setShowFilterDrop(false); }}
                                        className="w-full h-8 text-[13px] font-medium text-content-muted hover:text-content hover:bg-surface-2 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/5 rounded-lg transition-colors">
                                        Limpiar todo
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
                {/* Cuánto se cruzó en lo que se está viendo. */}
                <div className="w-full sm:w-auto sm:ml-auto text-[12px] text-content-subtle tabular-nums">
                    {data.resumen.cruces} {data.resumen.cruces === 1 ? "cruce" : "cruces"} · <span className="font-semibold text-content dark:text-white">{fmt(data.resumen.total)}</span> cruzado
                    {data.resumen.anulados > 0 && ` · ${data.resumen.anulados} ${data.resumen.anulados === 1 ? "anulado" : "anulados"}`}
                </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                {/* Tablet y escritorio: tabla. */}
                <div className="hidden md:block overflow-auto flex-1">
                    <table className="table-ledger min-w-[820px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4">Cruce</th>
                                <th>Fecha</th>
                                <th>Contacto</th>
                                <th>Saldó</th>
                                <th className="text-right">Monto</th>
                                <th>Hecho por</th>
                                <th className="pr-4 w-px"><span className="sr-only">Acciones</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <LedgerSkeleton cols={7} />
                            ) : items.length === 0 ? (
                                <LedgerEmpty cols={7} title="Sin cruces de cuentas" hint="Los cruces con proveedores que también te compran aparecerán aquí. Se hacen desde la ficha del contacto." />
                            ) : items.map(c => {
                                const anulado = c.estado === "anulado";
                                return (
                                    <tr key={c.id} {...ledgerRow(undefined)}>
                                        <td className="pl-4">
                                            <span className={`text-[13px] font-semibold tabular-nums ${anulado ? "text-content-subtle line-through decoration-1" : "text-content dark:text-white"}`}>#{c.id}</span>
                                            {anulado && <div className="mt-0.5"><StatusMark status="anulado" /></div>}
                                        </td>
                                        <td><span className="text-[12px] font-medium text-content-subtle tabular-nums whitespace-nowrap">{fmtDateShort(c.created_at)}</span></td>
                                        <td className="max-w-0 w-[24%]">
                                            <span className={`block truncate font-semibold ${anulado ? "text-content-subtle" : "text-content dark:text-white"}`}>{toNameCase(c.contacto)}</span>
                                            {c.rif && <span className="block text-[12px] text-content-subtle tabular-nums">{c.rif}</span>}
                                        </td>
                                        <td className="max-w-0 w-[30%]">
                                            <span className="block truncate text-[12px] text-content-subtle" title={saldo(c)}>
                                                {anulado ? "Anulado: las deudas volvieron" : saldo(c) || "—"}
                                            </span>
                                            {c.notas && <span className="block truncate text-[12px] text-content-subtle/80" title={c.notas}>{c.notas}</span>}
                                        </td>
                                        <td className="text-right">
                                            <Money value={fmt(c.monto)} strike={anulado} className={`text-[14px] font-semibold ${anulado ? "text-content-subtle" : "text-content dark:text-white"}`} />
                                        </td>
                                        <td className="max-w-[150px]">
                                            <span className="block truncate text-[12px] font-medium text-content-subtle">{toNameCase(c.hecho_por) || "—"}</span>
                                            {anulado && c.anulado_por && <span className="block truncate text-[12px] text-content-subtle/80">Anuló {toNameCase(c.anulado_por)}</span>}
                                        </td>
                                        <td className="pr-4 whitespace-nowrap cursor-default" onClick={stopRow}>{acciones(c)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Teléfono: número y monto arriba; contacto; lo que saldó y la fecha abajo. */}
                <div className="md:hidden flex-1 overflow-y-auto px-4 py-3 space-y-2">
                    {loading ? (
                        <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                    ) : items.length === 0 ? (
                        <div className="py-16 px-6 text-center">
                            <div className="text-[14px] font-semibold text-content dark:text-white">Sin cruces de cuentas</div>
                            <div className="text-[13px] text-content-subtle mt-1">Se hacen desde la ficha del contacto que es cliente y proveedor.</div>
                        </div>
                    ) : items.map(c => {
                        const anulado = c.estado === "anulado";
                        return (
                            <div key={c.id} className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] pl-3.5 pr-2.5 py-3">
                                <div className="flex items-baseline justify-between gap-3 pr-1">
                                    <span className={`text-[14px] font-semibold tabular-nums ${anulado ? "text-content-subtle line-through decoration-1" : "text-content dark:text-white"}`}>Cruce #{c.id}</span>
                                    <Money value={fmt(c.monto)} strike={anulado} className={`text-[15px] font-semibold ${anulado ? "text-content-subtle" : "text-content dark:text-white"}`} />
                                </div>
                                <div className="mt-1 flex items-center justify-between gap-3 pr-1">
                                    <span className={`min-w-0 truncate text-[14px] font-semibold ${anulado ? "text-content-subtle" : "text-content dark:text-white"}`}>{toNameCase(c.contacto)}</span>
                                    {anulado && <span className="shrink-0"><StatusMark status="anulado" /></span>}
                                </div>
                                {!anulado && saldo(c) && <div className="mt-1 text-[12px] text-content-subtle break-words">{saldo(c)}</div>}
                                <div className="mt-1.5 flex items-center justify-between gap-3">
                                    <span className="min-w-0 truncate text-[12px] text-content-subtle tabular-nums">
                                        {[fmtDateShort(c.created_at), toNameCase(c.hecho_por), c.notas].filter(Boolean).join(" · ")}
                                    </span>
                                    <div className="shrink-0" onClick={stopRow}>{acciones(c)}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <ConfirmModal
                isOpen={!!toAnnul}
                title={`¿Anular el cruce #${toAnnul?.id}?`}
                message={`Las compras y las facturas que saldó (${fmt(toAnnul?.monto)} de cada lado) vuelven a quedar con su deuda, como antes del cruce.`}
                confirmText="Anular cruce"
                type="danger"
                onConfirm={anular}
                onCancel={() => setToAnnul(null)}
            />
        </div>
    );
}
