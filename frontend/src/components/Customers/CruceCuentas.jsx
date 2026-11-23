// Cruce de cuentas con un proveedor que también le compra a la tienda (services/cruces en el
// backend). El mismo RIF tiene dos fichas: proveedor (lo que la tienda le debe) y cliente (lo que
// él se llevó como venta normal). El cruce salda las dos deudas por el mismo monto, de lo más
// viejo a lo más nuevo en cada lado, sin mover caja. Cruzar y anular piden el permiso
// "Cruzar cuentas con proveedores" (customers.cross).
//
// Vive en la ficha del contacto (CustomerDetail), sea la de proveedor o la de cliente.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { fmtBase, fmtDateShort } from "../../helpers";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import Money from "../ui/Money";
import { Button } from "../ui/Button";

const SECTION = "bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none";
const num = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(n * 100) / 100;

const IconoCruce = ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M7 7h11m0 0l-3-3m3 3l-3 3M17 17H6m0 0l3 3m-3-3l3-3" />
    </svg>
);

// Cómo queda cada documento con el monto escrito: se reparte de lo más viejo a lo más nuevo,
// igual que el servidor.
function repartir(docs, monto) {
    let resto = monto;
    return docs.map(d => {
        const aplica = r2(Math.max(0, Math.min(resto, d.saldo)));
        resto = r2(resto - aplica);
        return { ...d, aplica, queda: r2(d.saldo - aplica) };
    });
}

function ListaDocs({ titulo, sub, docs, etiqueta, fmt }) {
    return (
        <div className="rounded-xl border border-border/70 dark:border-white/[0.08] overflow-hidden flex flex-col min-h-0">
            <div className="px-4 py-2.5 border-b border-border/60 dark:border-white/[0.06]">
                <p className="text-[13px] font-semibold text-content dark:text-white">{titulo}</p>
                <p className="text-[12px] text-content-subtle">{sub}</p>
            </div>
            <div className="divide-y divide-border/60 dark:divide-white/[0.06] max-h-56 overflow-y-auto">
                {docs.length === 0 && <p className="px-4 py-3 text-[12px] text-content-subtle">Nada pendiente.</p>}
                {docs.map(d => (
                    <div key={d.id} className="px-4 py-2 flex items-center justify-between gap-3 text-[13px]">
                        <div className="min-w-0">
                            <div className="font-medium text-content dark:text-white truncate">{etiqueta(d)}</div>
                            <div className="text-[12px] text-content-subtle tabular-nums">
                                {fmtDateShort(d.fecha)}
                            </div>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                            <Money value={fmt(d.saldo)} className="text-[13px] font-semibold text-content dark:text-white" />
                            {d.aplica > 0 && (
                                <div className="text-[11px] text-content-subtle">
                                    {d.queda <= 0.005 ? "Queda saldada" : <>Queda {fmt(d.queda)}</>}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function CruceCuentas({ detail, onRefresh }) {
    const { baseCurrency, notify, can } = useApp();
    const fmt = (n) => fmtBase(n, baseCurrency);
    const puedeCruzar = can("customers.cross");
    const [st, setSt] = useState(null);
    const [abierto, setAbierto] = useState(false);
    const [monto, setMonto] = useState("");
    const [notas, setNotas] = useState("");
    const [anular, setAnular] = useState(null);

    const cargar = useCallback(async () => {
        try { const r = await api.cruces.estado(detail.id); setSt(r.data); }
        catch { setSt(null); }
    }, [detail.id]);
    useEffect(() => { cargar(); }, [cargar]);

    const abrir = () => { setMonto(st?.sugerido ? String(st.sugerido) : ""); setNotas(""); setAbierto(true); };

    const m = r2(num(monto));
    const compras = useMemo(() => repartir(st?.compras || [], m), [st, m]);
    const ventas = useMemo(() => repartir(st?.ventas || [], m), [st, m]);
    const maximo = st ? r2(Math.min(st.le_debo, st.me_debe)) : 0;
    const montoValido = m > 0 && m <= maximo + 0.005;

    const registrarCliente = async () => {
        try {
            const r = await api.cruces.comoCliente(detail.id);
            notify(r.data.creado ? "Listo: ya puedes venderle con su RIF desde la caja" : "Ya estaba registrado como cliente");
            cargar();
            onRefresh?.();   // la ficha pasa a ser de "cliente y proveedor" (selector arriba)
        } catch (e) { notify(e.message, "err"); }
    };

    const cruzar = async () => {
        try {
            const r = await api.cruces.cruzar({ contacto_id: detail.id, monto: m, notas });
            setSt(r.data);
            setAbierto(false);
            notify(`Cruce #${r.data.cruce_id} registrado por ${fmt(m)}`);
            onRefresh?.();
        } catch (e) { notify(e.message, "err"); }
    };

    const confirmarAnular = async () => {
        try {
            await api.cruces.anular(anular.id);
            notify(`Cruce #${anular.id} anulado: las dos deudas vuelven como estaban`);
            setAnular(null);
            await cargar();
            onRefresh?.();
        } catch (e) { notify(e.message, "err"); }
    };

    if (!st) return null;
    const ambas = !!(st.proveedor && st.cliente);
    const esProveedor = detail.type === "proveedor";

    // Proveedor sin ficha de cliente: se ofrece crearla, solo a quien puede cruzar.
    if (!ambas) {
        if (!esProveedor || !puedeCruzar) return null;
        return (
            <div className={`${SECTION} shrink-0 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 print-hidden`}>
                <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className="w-8 h-8 rounded-lg bg-surface-2 dark:bg-white/[0.06] text-content-subtle flex items-center justify-center shrink-0"><IconoCruce /></span>
                    <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-content dark:text-white">¿Este proveedor también se lleva mercancía?</p>
                        <p className="text-[12px] text-content-subtle">Regístralo como cliente con su mismo RIF: le vendes desde la caja y después cruzan cuentas.</p>
                    </div>
                </div>
                <Button variant="ghost" onClick={registrarCliente} className="h-12 sm:h-9 px-3.5">Registrar como cliente</Button>
            </div>
        );
    }

    const activos = (st.cruces || []).filter(c => c.estado === "activo");
    return (
        <>
            <div className={`${SECTION} shrink-0 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 print-hidden`}>
                <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className="w-8 h-8 rounded-lg bg-surface-2 dark:bg-white/[0.06] text-content-subtle flex items-center justify-center shrink-0"><IconoCruce /></span>
                    <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-content dark:text-white">Cruce de cuentas</p>
                        <p className="text-[12px] text-content-subtle tabular-nums">
                            Le debes {fmt(st.le_debo)} · te debe {fmt(st.me_debe)}
                            {activos.length > 0 && <> · {activos.length} {activos.length === 1 ? "cruce hecho" : "cruces hechos"}</>}
                        </p>
                    </div>
                </div>
                {(puedeCruzar || st.cruces?.length > 0) && (
                    <button type="button" onClick={abrir}
                        className="btn-outline h-12 sm:h-9 px-3.5 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1.5 shrink-0">
                        <IconoCruce className="w-3.5 h-3.5" />
                        {puedeCruzar && st.sugerido > 0 ? "Cruzar cuentas" : "Ver cruces"}
                    </button>
                )}
            </div>

            <Modal
                open={abierto}
                onClose={() => setAbierto(false)}
                title={`Cruzar cuentas con ${st.proveedor.name}`}
                width={760}
                footer={puedeCruzar && st.sugerido > 0 ? (
                    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
                        <button type="button" onClick={() => setAbierto(false)} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                        <Button onClick={cruzar} disabled={!montoValido} className="h-12 sm:h-10 px-5">
                            {montoValido ? `Cruzar ${fmt(m)}` : m > maximo ? `Máximo ${fmt(maximo)}` : "Indica el monto"}
                        </Button>
                    </div>
                ) : null}
            >
                <div className="space-y-4">
                    <dl className="grid grid-cols-3 gap-3 text-[13px]">
                        <div>
                            <dt className="text-[12px] text-content-subtle">Le debes</dt>
                            <dd className="mt-0.5"><Money value={fmt(st.le_debo)} className="text-[16px] font-semibold text-content dark:text-white" /></dd>
                        </div>
                        <div>
                            <dt className="text-[12px] text-content-subtle">Te debe</dt>
                            <dd className="mt-0.5"><Money value={fmt(st.me_debe)} className="text-[16px] font-semibold text-content dark:text-white" /></dd>
                        </div>
                        <div>
                            <dt className="text-[12px] text-content-subtle">Se puede cruzar</dt>
                            <dd className="mt-0.5"><Money value={fmt(maximo)} className="text-[16px] font-semibold text-content dark:text-white" /></dd>
                        </div>
                    </dl>

                    {puedeCruzar && st.sugerido > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)] gap-3">
                            <label className="flex flex-col gap-1.5">
                                <span className="text-[12px] text-content-subtle">Monto a cruzar</span>
                                <span className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{baseCurrency?.symbol || "Ref."}</span>
                                    <input value={monto} onChange={e => setMonto(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" autoComplete="off" data-autofocus
                                        className={`input h-10 pl-11 text-right text-[14px] font-semibold tabular-nums ${m > maximo + 0.005 ? "!border-danger" : ""}`} />
                                </span>
                            </label>
                            <label className="flex flex-col gap-1.5">
                                <span className="text-[12px] text-content-subtle flex justify-between">Nota <span>Opcional</span></span>
                                <input value={notas} onChange={e => setNotas(e.target.value)} maxLength={300} autoComplete="off"
                                    placeholder="Ej: cuadre de noviembre" className="input h-10 text-[13px]" />
                            </label>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <ListaDocs titulo="Lo que le debes" sub="Sus compras pendientes, de la más vieja a la más nueva"
                            docs={compras} etiqueta={d => `Orden #${d.id}`} fmt={fmt} />
                        <ListaDocs titulo="Lo que te debe" sub="Lo que se llevó, de lo más viejo a lo más nuevo"
                            docs={ventas} etiqueta={d => d.numero ? `Factura ${d.numero}` : `Venta #${d.id}`} fmt={fmt} />
                    </div>

                    <p className="text-[12px] text-content-subtle leading-relaxed">
                        El cruce salda el mismo monto de los dos lados sin mover dinero de ninguna caja: no sale en el arqueo ni en Ingresos y egresos.
                        En cada documento queda un pago "Cruce de cuentas".
                    </p>

                    {st.cruces?.length > 0 && (
                        <div>
                            <p className="text-[13px] font-semibold text-content dark:text-white mb-1.5">Cruces anteriores</p>
                            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                                {st.cruces.map(c => (
                                    <div key={c.id} className={`px-4 py-2.5 flex items-center justify-between gap-3 text-[13px] ${c.estado === "anulado" ? "opacity-60" : ""}`}>
                                        <div className="min-w-0">
                                            <div className="font-medium text-content dark:text-white">
                                                Cruce #{c.id} · <span className="tabular-nums">{fmt(c.monto)}</span>
                                                {c.estado === "anulado" && <span className="ml-2 text-[12px] font-normal text-content-subtle">Anulado</span>}
                                            </div>
                                            <div className="text-[12px] text-content-subtle truncate">
                                                {fmtDateShort(c.created_at)}{c.hecho_por ? ` · ${c.hecho_por}` : ""}{c.notas ? ` · ${c.notas}` : ""}
                                                {c.estado === "anulado" && c.anulado_por ? ` · anuló ${c.anulado_por}` : ""}
                                            </div>
                                        </div>
                                        {c.estado === "activo" && puedeCruzar && (
                                            <button type="button" onClick={() => setAnular(c)}
                                                className="h-9 px-3 rounded-lg text-[12px] font-medium text-content-subtle hover:text-red-600 hover:bg-red-500/10 shrink-0">
                                                Anular
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            <ConfirmModal
                isOpen={!!anular}
                title={`¿Anular el cruce #${anular?.id}?`}
                message="Las compras y las facturas que saldó vuelven a quedar con su deuda, como antes del cruce."
                confirmText="Anular cruce"
                type="danger"
                onConfirm={confirmarAnular}
                onCancel={() => setAnular(null)}
            />
        </>
    );
}
