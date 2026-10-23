import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { useDebounce } from "../../hooks/useDebounce";
import { toNameCase, fmtBase, fmtDateShort } from "../../helpers";
import Segmented from "../ui/Segmented";
import CustomSelect from "../ui/CustomSelect";
import Money from "../ui/Money";
import Pagination from "../ui/Pagination";
import StatusMark from "../ui/StatusMark";
import { LedgerSkeleton, LedgerEmpty, ledgerRow } from "../ui/Ledger";
import { ORDER_STATUS, SHEET_ICON } from "./shared";
import BoardView from "./BoardView";
import StageMoveModal from "./StageMoveModal";

const VISTA_KEY = "fabrica_vista";

const FILTROS = [
    { key: "abierta",      label: "Abiertas" },
    { key: "por_facturar", label: "Por facturar" },
    { key: "terminada",    label: "Terminadas" },
    { key: "todas",        label: "Todas" },
];

const LIMIT = 50;

// Lo que dice la fila debajo del trabajo: tipo, para quién y si hay piezas afuera.
function subtitulo(o) {
    const partes = [o.type === "estandar" ? "Estándar" : "A medida"];
    partes.push(o.destination === "stock" ? "Para inventario" : (o.customer_name ? toNameCase(o.customer_name) : "Sin cliente"));
    if (o.quantity !== 1) partes.push(`${Number(o.quantity).toLocaleString("es-VE")} und.`);
    return partes.join(" · ");
}

export default function OrdersView({ warehouses, stages = [], canManage, version, onOpen, onChanged }) {
    const { baseCurrency, notify } = useApp();
    const [status, setStatus] = useState("abierta");
    const [search, setSearch] = useState("");
    const [warehouseId, setWarehouseId] = useState("");
    const [page, setPage] = useState(1);
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const q = useDebounce(search, 300);
    // Lista (todas, con filtros) o tablero del taller (las abiertas, por etapa).
    const [vista, setVistaState] = useState(() => { try { return localStorage.getItem(VISTA_KEY) || "lista"; } catch { return "lista"; } });
    const setVista = (v) => { setVistaState(v); try { localStorage.setItem(VISTA_KEY, v); } catch { /* modo privado */ } };
    const [moving, setMoving] = useState(null);   // { order, target, finish }

    useEffect(() => { setPage(1); }, [status, q, warehouseId]);

    useEffect(() => {
        let vivo = true;
        setLoading(true);
        const params = { status, page, limit: LIMIT };
        if (q.trim()) params.search = q.trim();
        if (warehouseId) params.warehouse_id = warehouseId;
        api.factory.orders(params)
            .then(r => { if (vivo) { setRows(r.data || []); setTotal(r.total || 0); } })
            .catch(e => { if (vivo) notify(e.message || "No se pudieron cargar las órdenes", "err"); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [status, q, warehouseId, page, version]);

    const money = (n) => fmtBase(n, baseCurrency);
    const vacio = q || warehouseId
        ? { title: "Nada coincide", hint: "Prueba con otro número, trabajo o cliente." }
        : status === "abierta"
        ? { title: "Sin órdenes abiertas", hint: "Crea una orden cuando el taller pida material para un trabajo." }
        : status === "por_facturar"
        ? { title: "Nada por facturar", hint: "Las órdenes para clientes que falten por facturar aparecen aquí." }
        : { title: "Sin órdenes", hint: "Las órdenes de fabricación aparecerán aquí." };

    // Precio del lote y la factura, o lo que falta para facturar.
    const precio = (o) => o.destination === "stock"
        ? <span className="text-[12px] text-content-subtle">Inventario</span>
        : o.sale_price != null ? <Money value={money(o.sale_price)} className="text-[13px] font-semibold text-content dark:text-white" />
        : <span className="text-[12px] text-content-subtle">Sin precio</span>;

    return (
        <div className="flex-1 flex flex-col overflow-y-auto lg:overflow-hidden -mx-3 sm:-mx-4 -my-2">
            <div className="shrink-0 px-4 py-2 flex flex-wrap items-center gap-2 border-b border-border/20 dark:border-white/5">
                <div className="relative flex-1 min-w-[180px] max-w-md">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input value={search} onChange={e => setSearch(e.target.value)} className="input h-9 pl-9 text-[13px] w-full"
                        autoComplete="off" spellCheck={false} placeholder="Buscar por número, trabajo o cliente…" />
                </div>
                {warehouses.length > 1 && (
                    <CustomSelect value={warehouseId} onChange={setWarehouseId} height="h-9" className="w-40"
                        options={[{ value: "", label: "Todos los almacenes" }, ...warehouses.map(w => ({ value: String(w.id), label: toNameCase(w.name) }))]} />
                )}
                <Segmented value={vista} onChange={setVista} options={[{ key: "lista", label: "Lista" }, { key: "tablero", label: "Tablero" }]} />
                {vista === "lista" && (
                    <div className="w-full sm:w-auto sm:ml-auto overflow-x-auto scrollbar-hide">
                        <Segmented options={FILTROS} value={status} onChange={setStatus} />
                    </div>
                )}
            </div>

            {vista === "tablero" && (
                <BoardView stages={stages} warehouseId={warehouseId} search={q} version={version} canManage={canManage}
                    onOpen={onOpen}
                    onMove={(o, target) => setMoving({ order: o, target })}
                    onFinish={o => setMoving({ order: o, finish: true })} />
            )}
            <StageMoveModal order={moving?.order} target={moving?.target} finish={!!moving?.finish} stages={stages}
                onClose={() => setMoving(null)} onDone={() => { setMoving(null); onChanged?.(); }} />

            {vista === "lista" && (<>

            {/* Escritorio */}
            <div className="hidden lg:flex flex-1 min-h-0 flex-col py-3 px-4">
                <div className="card-premium overflow-auto flex-1">
                    <table className="table-ledger min-w-[860px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4 w-[170px]">Orden</th>
                                <th>Trabajo</th>
                                <th className="w-[140px]">Estado</th>
                                <th className="w-[130px] text-right">Costo</th>
                                <th className="w-[150px] text-right pr-4">Precio</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? <LedgerSkeleton cols={5} rows={6} />
                                : rows.length === 0 ? <LedgerEmpty cols={5} title={vacio.title} hint={vacio.hint} />
                                : rows.map(o => (
                                    <tr key={o.id} {...ledgerRow(() => onOpen(o), o.pieces_in_shop > 0 ? "#f59e0b" : undefined)}>
                                        <td className="pl-4">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className="w-8 h-8 rounded-full bg-surface-3 dark:bg-white/[0.06] text-content-muted dark:text-white/60 flex items-center justify-center shrink-0">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={SHEET_ICON} /></svg>
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="text-[13px] font-semibold text-content dark:text-white tabular-nums">{o.code}</div>
                                                    <div className="text-[12px] text-content-subtle tabular-nums">{fmtDateShort(o.created_at)}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="max-w-0">
                                            <div className="text-[13px] font-medium text-content dark:text-white truncate" title={o.description}>{o.description}</div>
                                            <div className="text-[12px] text-content-subtle truncate">{subtitulo(o)}</div>
                                        </td>
                                        <td>
                                            <StatusMark status={o.status} map={ORDER_STATUS} />
                                            {o.stage_name && <div className="text-[12px] text-content-subtle mt-0.5 truncate">En {o.stage_name}</div>}
                                            {o.pieces_in_shop > 0 && (
                                                <div className="text-[12px] text-amber-700 dark:text-amber-400 mt-0.5 whitespace-nowrap">
                                                    {o.pieces_in_shop === 1 ? "1 pieza en el taller" : `${o.pieces_in_shop} piezas en el taller`}
                                                </div>
                                            )}
                                        </td>
                                        <td className="text-right">
                                            <Money value={money(o.total_cost)} className="text-[13px] text-content dark:text-white" />
                                        </td>
                                        <td className="text-right pr-4">
                                            {precio(o)}
                                            {o.invoice_number && <div className="text-[12px] text-content-subtle tabular-nums">Factura {o.invoice_number}{o.sale_status === "anulado" ? " anulada" : ""}</div>}
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
                {total > LIMIT && (
                    <div className="pt-3"><Pagination page={page} totalPages={Math.ceil(total / LIMIT)} total={total} limit={LIMIT} onPageChange={setPage} /></div>
                )}
            </div>

            {/* Teléfono y tablet */}
            <div className="lg:hidden px-3 py-3 space-y-2">
                {loading ? (
                    <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                ) : rows.length === 0 ? (
                    <div className="py-16 text-center px-6">
                        <div className="text-[14px] font-semibold text-content dark:text-white">{vacio.title}</div>
                        <div className="text-[13px] text-content-subtle mt-1">{vacio.hint}</div>
                    </div>
                ) : rows.map(o => (
                    <div key={o.id} role="button" tabIndex={0} onClick={() => onOpen(o)}
                        onKeyDown={e => { if (e.key === "Enter") onOpen(o); }}
                        style={o.pieces_in_shop > 0 ? { boxShadow: "inset 3px 0 0 #f59e0b" } : undefined}
                        className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3 active:scale-[0.99] transition-transform">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[14px] font-semibold text-content dark:text-white tabular-nums">{o.code}</span>
                            <Money value={money(o.total_cost)} className="text-[14px] font-semibold text-content dark:text-white" />
                        </div>
                        <div className="text-[13px] text-content dark:text-white truncate mt-1">{o.description}</div>
                        <div className="mt-1 flex items-center justify-between gap-3">
                            <span className="text-[12px] text-content-subtle truncate">{subtitulo(o)}</span>
                            <StatusMark status={o.status} map={ORDER_STATUS} />
                        </div>
                        {o.pieces_in_shop > 0 && (
                            <div className="text-[12px] text-amber-700 dark:text-amber-400 mt-1">
                                {o.pieces_in_shop === 1 ? "1 pieza en el taller" : `${o.pieces_in_shop} piezas en el taller`}
                            </div>
                        )}
                    </div>
                ))}
                {total > LIMIT && <Pagination page={page} totalPages={Math.ceil(total / LIMIT)} total={total} limit={LIMIT} onPageChange={setPage} />}
            </div>
            </>)}
        </div>
    );
}
