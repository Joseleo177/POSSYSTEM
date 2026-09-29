import { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";
import { hasTopOverlay } from "../../helpers/overlayGuard";
import { toNameCase } from "../../helpers";
import BulkPaymentModal from "../Customers/BulkPaymentModal";
import Check from "../ui/Check";
import Money from "../ui/Money";
import Segmented from "../ui/Segmented";
import StatusMark from "../ui/StatusMark";
import { LedgerSkeleton } from "../ui/Ledger";

const STATUS_TABS = [
    { key: "all",      label: "Todas" },
    { key: "borrador", label: "Borrador" },
    { key: "pendiente",label: "Pendiente" },
    { key: "parcial",  label: "Parcial" },
];

// Todo lo de esta lista debe algo, así que "Pendiente" va en gris: pintarlo de rojo en cada
// fila no distinguía nada. Solo lleva color lo que difiere: el borrador (aún sin factura) y
// la parcial (ya abonada).
const STATUS_MAP = {
    pendiente: { label: "Pendiente", tone: "neutral" },
    borrador:  { label: "Borrador",  tone: "info" },
    parcial:   { label: "Parcial",   tone: "warning" },
    pagado:    { label: "Pagada",    tone: "success", quiet: "check" },
    exonerado: { label: "Exonerada", tone: "violet" },
};

export default function PendingSalesModal({ open, onClose, onSelect, baseCurrency, warehouseId }) {
    const [sales, setSales]         = useState([]);
    const [loading, setLoading]     = useState(false);
    const [search, setSearch]       = useState("");
    const [statusTab, setStatusTab] = useState("all");
    // Cobro conjunto: el cliente trae cuentas viejas y las salda todas con un solo monto.
    // Solo entre facturas del MISMO cliente: un pago no puede cubrir la deuda de dos personas.
    const [checkedIds, setCheckedIds] = useState([]);
    const [showBulk, setShowBulk]     = useState(false);
    const sym = baseCurrency?.symbol || "Ref.";

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { limit: 100 };
            if (search.trim()) params.search = search.trim();
            // Con la caja de una sucursal abierta, solo sus cuentas: cobrar la pendiente de
            // otra tienda desde acá sería registrar el ingreso en la caja equivocada.
            if (warehouseId) params.warehouse_id = warehouseId;
            const r = await api.sales.getPending(params);
            setSales(r.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [search, warehouseId]);

    useEffect(() => {
        if (!open) return;
        const t = setTimeout(load, search ? 300 : 0);
        return () => clearTimeout(t);
    }, [open, load, search]);

    // `showBulk` también se reinicia: si no, al volver a abrir el listado la primera factura
    // que se marcara disparaba sola el cobro conjunto (la condición de render vuelve a ser
    // cierta en cuanto hay una seleccionada).
    useEffect(() => {
        if (!open) { setSearch(""); setStatusTab("all"); setCheckedIds([]); setShowBulk(false); }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (e.key !== "Escape") return;
            // Escape es de la capa de encima, no de este listado: con el cobro conjunto abierto
            // lo cierra su propio Modal, y con la botonera de cajas encima ella retrocede un
            // paso. Sin esto una sola tecla tumbaba las tres pantallas de golpe.
            if (showBulk || hasTopOverlay()) return;
            e.stopPropagation();
            onClose();
        };
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [open, onClose, showBulk]);

    if (!open) return null;

    const filtered = statusTab === "all" ? sales : sales.filter(s => s.status === statusTab);
    const countOf = (k) => k === "all" ? sales.length : sales.filter(s => s.status === k).length;
    const saldoTotal = filtered.reduce((s, x) => s + parseFloat(x.balance || 0), 0);

    // Con qué cliente quedó amarrada la selección: la primera marcada fija el grupo y las
    // demás quedan bloqueadas. Un cobro se aplica a las facturas de una sola persona.
    const seleccionadas = sales.filter(s => checkedIds.includes(s.id));
    const clienteFijado = seleccionadas[0]?.customer_id ?? null;
    // Mismo criterio: el cobro conjunto genera un solo movimiento de caja, así que las
    // facturas marcadas también tienen que ser de la misma sucursal.
    const sucursalFijada = seleccionadas[0]?.warehouse_id ?? null;
    const totalSeleccionado = seleccionadas.reduce((acc, s) => acc + parseFloat(s.balance || 0), 0);
    // Sin cliente identificado no hay a quién agrupar, y una factura sin saldo no se cobra.
    const marcable = (sale) =>
        !!sale.customer_id
        && parseFloat(sale.balance || 0) > 0.10
        && (clienteFijado === null || sale.customer_id === clienteFijado)
        && (sucursalFijada === null || sale.warehouse_id === sucursalFijada);
    const toggleChecked = (sale) =>
        setCheckedIds(p => p.includes(sale.id) ? p.filter(x => x !== sale.id) : [...p, sale.id]);
    const motivo = (sale) =>
        !sale.customer_id ? "Sin cliente: no se puede cobrar junto a otras"
        : (clienteFijado !== null && sale.customer_id !== clienteFijado) ? "Es de otro cliente"
        : (sucursalFijada !== null && sale.warehouse_id !== sucursalFijada) ? "Es de otra sucursal"
        : "Cobrar junto con las demás";

    const fmt = (n) => `${sym}${parseFloat(n || 0).toFixed(2)}`;
    const fmtDate = (d) => {
        if (!d) return "—";
        const dt = new Date(d);
        return `${dt.getDate().toString().padStart(2,"0")}/${(dt.getMonth()+1).toString().padStart(2,"0")} · ${dt.getHours().toString().padStart(2,"0")}:${dt.getMinutes().toString().padStart(2,"0")}`;
    };
    const docLabel = (sale) => sale.invoice_number || `Borrador #${sale.id}`;
    const clientName = (sale) => toNameCase(sale.customer_name) || null;

    return (
        <div className="fixed inset-0 z-[200] bg-black/40 dark:bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4 overlay-in" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="w-full max-w-3xl bg-white dark:bg-surface-dark-2 border border-black/[0.06] dark:border-white/[0.08] rounded-xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.25)] flex flex-col overflow-hidden modal-in" style={{ maxHeight: "85vh" }} onKeyDown={e => e.stopPropagation()}>

                {/* Cabecera: el resumen va arriba, donde se mira primero. Antes el saldo total
                    vivía en el pie, en versalitas ámbar, y había que buscarlo. */}
                <div className="flex items-start justify-between gap-4 pl-6 pr-4 pt-5 pb-4 shrink-0">
                    <div className="min-w-0">
                        <h2 className="text-[17px] font-bold tracking-[-0.015em] text-content dark:text-white">Facturas pendientes</h2>
                        <p className="text-[13px] text-content-subtle mt-0.5 tabular-nums">
                            {loading ? "Cargando…" : (
                                <>
                                    {filtered.length} {filtered.length === 1 ? "factura" : "facturas"}
                                    {filtered.length > 0 && <> · saldo <Money value={fmt(saldoTotal)} className="font-semibold text-content dark:text-white" /></>}
                                </>
                            )}
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 flex items-center justify-center rounded-lg text-content-subtle dark:text-white/40 hover:text-content hover:bg-surface-3 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Barra. En móvil el buscador toma su propia línea: al lado de las cuatro
                    opciones se comprimía hasta quedar en el ancho del icono. */}
                <div className="px-6 pb-4 shrink-0 flex flex-wrap items-center gap-2 sm:gap-3 border-b border-border/60 dark:border-white/[0.06]">
                    <div className="relative w-full sm:w-auto sm:flex-1 sm:max-w-xs">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por número o cliente"
                            autoComplete="off"
                            className="input h-9 pl-9 w-full"
                        />
                    </div>
                    <Segmented
                        className="sm:ml-auto max-w-full overflow-x-auto scrollbar-hide"
                        value={statusTab}
                        onChange={setStatusTab}
                        options={STATUS_TABS.map(t => ({ ...t, count: loading ? null : countOf(t.key) }))}
                    />
                </div>

                {/* Lista */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    {loading ? (
                        <table className="table-ledger"><tbody><LedgerSkeleton cols={6} rows={5} /></tbody></table>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-1 text-center">
                            <svg className="w-8 h-8 mb-2 text-content-subtle/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-[13px] font-semibold text-content dark:text-white">Nada pendiente</span>
                            <span className="text-[12px] text-content-subtle">{search ? "Ninguna factura coincide con la búsqueda." : "Todas las ventas de esta caja están cobradas."}</span>
                        </div>
                    ) : (
                      <>
                        {/* Móvil: tarjetas. En un teléfono la tabla no cabe y el saldo y el
                            botón de cobrar quedaban tras un scroll horizontal que nadie descubre. */}
                        <div className="lg:hidden divide-y divide-border/60 dark:divide-white/[0.06]">
                            {filtered.map(sale => (
                                <div
                                    key={sale.id}
                                    onClick={() => onSelect(sale)}
                                    className={`px-4 py-3 flex items-start gap-3 active:bg-surface-2 dark:active:bg-white/[0.04] ${checkedIds.includes(sale.id) ? "bg-brand-500/[0.05]" : ""}`}
                                >
                                    <div className="pt-0.5">
                                        <Check
                                            checked={checkedIds.includes(sale.id)}
                                            onChange={() => toggleChecked(sale)}
                                            disabled={!marcable(sale) && !checkedIds.includes(sale.id)}
                                            title={motivo(sale)}
                                        />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="text-[14px] font-semibold text-brand-700 dark:text-brand-300 tabular-nums">{docLabel(sale)}</span>
                                            <Money value={fmt(sale.balance)} className="text-[14px] font-semibold text-content dark:text-white" />
                                        </div>
                                        <div className="text-[13px] text-content-muted truncate">{clientName(sale) || "Sin cliente"}</div>
                                        <div className="flex items-center justify-between gap-2 mt-1">
                                            <span className="text-[12px] text-content-subtle tabular-nums">{fmtDate(sale.created_at)}</span>
                                            <StatusMark status={sale.status} map={STATUS_MAP} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <table className="hidden lg:table table-ledger table-fixed">
                            <colgroup>
                                <col className="w-[52px]" />
                                <col className="w-[140px]" />
                                <col />
                                <col className="w-[120px]" />
                                <col className="w-[130px]" />
                                <col className="w-[110px]" />
                                <col className="w-[96px]" />
                            </colgroup>
                            <thead className="sticky top-0 z-10">
                                <tr>
                                    <th className="pl-6"><span className="sr-only">Seleccionar</span></th>
                                    <th>Factura</th>
                                    <th>Cliente</th>
                                    <th className="text-right">Total</th>
                                    <th className="text-right">Saldo</th>
                                    <th>Estado</th>
                                    <th className="pr-6"><span className="sr-only">Acciones</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(sale => {
                                    const marcada = checkedIds.includes(sale.id);
                                    return (
                                    <tr key={sale.id} className={marcada ? "[&>td]:!bg-brand-500/[0.05]" : ""}>
                                        <td className="pl-6">
                                            <Check
                                                checked={marcada}
                                                onChange={() => toggleChecked(sale)}
                                                disabled={!marcable(sale) && !marcada}
                                                title={motivo(sale)}
                                            />
                                        </td>
                                        <td>
                                            <div className="text-[14px] font-semibold text-brand-700 dark:text-brand-300 tabular-nums truncate">{docLabel(sale)}</div>
                                            <div className="text-[12px] text-content-subtle tabular-nums truncate">
                                                {fmtDate(sale.created_at)}{sale.serie_name ? ` · ${sale.serie_name}` : ""}
                                            </div>
                                        </td>
                                        <td className="max-w-0">
                                            {clientName(sale)
                                                ? <div className="font-semibold text-content dark:text-white truncate">{clientName(sale)}</div>
                                                : <div className="text-content-subtle">Sin cliente</div>}
                                            {sale.customer_rif && <div className="text-[12px] text-content-subtle tabular-nums truncate">{sale.customer_rif}</div>}
                                        </td>
                                        <td className="text-right">
                                            <Money value={fmt(sale.total)} className="text-[13px] font-medium text-content-subtle" />
                                        </td>
                                        <td className="text-right">
                                            <Money value={fmt(sale.balance)} className="text-[14px] font-semibold text-content dark:text-white" />
                                            {/* Lo abonado solo cuando hay: una columna "Pagado" en
                                                cero en cada fila era ruido. */}
                                            {sale.amount_paid > 0 && (
                                                <div className="text-[12px] text-content-subtle">Abonado <Money value={fmt(sale.amount_paid)} /></div>
                                            )}
                                        </td>
                                        <td><StatusMark status={sale.status} map={STATUS_MAP} /></td>
                                        <td className="pr-6 text-right">
                                            {/* Siempre visible: en tablet no hay hover que revele el
                                                botón, y esta es la acción principal de la fila. */}
                                            <button
                                                onClick={() => onSelect(sale)}
                                                className="btn-outline h-8 px-3 rounded-lg text-[13px] font-semibold active:scale-[0.98]"
                                            >
                                                Cobrar
                                            </button>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                      </>
                    )}
                </div>

                {/* Pie: con facturas marcadas es la barra del cobro conjunto; sin ninguna,
                    explica cómo se usa en vez de repetir el conteo de la cabecera. */}
                {!loading && filtered.length > 0 && (
                    <div className="px-6 py-3 border-t border-border/60 dark:border-white/[0.06] bg-surface-2/60 dark:bg-white/[0.02] shrink-0 flex items-center justify-between gap-3 min-h-[60px]">
                        {seleccionadas.length > 0 ? (
                            <>
                                <div className="min-w-0">
                                    <div className="text-[13px] font-semibold text-content dark:text-white truncate">
                                        {seleccionadas.length} {seleccionadas.length === 1 ? "marcada" : "marcadas"} · {toNameCase(seleccionadas[0]?.customer_name)}
                                    </div>
                                    <div className="text-[12px] text-content-subtle">Se cobran con un solo pago</div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button onClick={() => setCheckedIds([])} className="btn-outline h-9 px-3.5 rounded-lg text-[13px] font-semibold">
                                        Quitar
                                    </button>
                                    <button onClick={() => setShowBulk(true)} className="btn-accent h-9 px-4 rounded-lg text-[13px] font-semibold tabular-nums active:scale-[0.98]">
                                        Cobrar {seleccionadas.length} · <Money value={fmt(totalSeleccionado)} className="[&>span]:!text-brand-ink/60" />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <span className="text-[12px] text-content-subtle">
                                Marca varias del mismo cliente para cobrarlas con un solo pago.
                            </span>
                        )}
                    </div>
                )}
            </div>

            {showBulk && seleccionadas.length > 0 && (
                <div onClick={e => e.stopPropagation()}>
                    <BulkPaymentModal
                        customer={{ id: clienteFijado, name: seleccionadas[0]?.customer_name }}
                        sales={seleccionadas}
                        onClose={() => setShowBulk(false)}
                        onSuccess={() => { setShowBulk(false); setCheckedIds([]); load(); }}
                    />
                </div>
            )}
        </div>
    );
}
