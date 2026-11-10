import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import Segmented from "../../components/ui/Segmented";
import CustomSelect from "../../components/ui/CustomSelect";
import DatePicker from "../../components/ui/DatePicker";
import StatusMark from "../../components/ui/StatusMark";
import { Button } from "../../components/ui/Button";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { fmtNumber, todayISO, fmtDateShort } from "../../helpers";
import { Loading } from "./reportes.utils";

// Declaración de IVA del período (forma 30 del SENIAT). Igual que la de Odoo 19: las casillas salen de
// los libros de ventas y compras; el excedente y las retenciones no descontadas pasan a la siguiente.
// Se calcula en borrador y al presentarla queda fija. La ve quien ve reportes; calcularla, presentarla
// y marcarla pagada es del administrador. Ver backend services/fiscal/declaracionIva.js.

const ESTADOS = {
    borrador:  { label: "Borrador", tone: "neutral" },
    declarada: { label: "Presentada", tone: "warning" },
    pagada:    { label: "Pagada", tone: "success", quiet: "check" },
};
const PERIODOS = [
    { key: "mes", label: "Mes" },
    { key: "1", label: "1ra quincena" },
    { key: "2", label: "2da quincena" },
];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const SECTION = "bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none";
const INPUT = "w-32 h-9 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-right tabular-nums text-content dark:text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

// Los últimos 18 meses, del más reciente al más viejo: AAAAMM.
function mesesRecientes() {
    const hoy = todayISO();
    let y = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7));
    const out = [];
    for (let i = 0; i < 18; i++) {
        out.push({ value: `${y}${String(m).padStart(2, "0")}`, label: `${MESES[m - 1]} ${y}` });
        if (--m === 0) { m = 12; y--; }
    }
    return out;
}

export default function DeclaracionIvaReport() {
    const { notify, can, localCurrency } = useApp();
    const esAdmin = can("admin");
    const sym = localCurrency?.symbol || "Bs.";
    const fmtB = (n) => `${sym} ${fmtNumber(n || 0, 2)}`;

    const [lista, setLista] = useState(null);
    const [selId, setSelId] = useState(null);
    const [error, setError] = useState(null);
    const meses = useMemo(mesesRecientes, []);
    const [periodo, setPeriodo] = useState(meses[1]?.value || meses[0].value);
    const [quincena, setQuincena] = useState("mes");
    const [confirmar, setConfirmar] = useState(null);

    const cargar = useCallback(async (seleccionar) => {
        try {
            const r = await api.ivaDeclarations.list();
            setLista(r.data || []);
            setSelId(prev => seleccionar ?? prev ?? r.data?.[0]?.id ?? null);
        } catch (e) { setError(e.message); }
    }, []);
    useEffect(() => { cargar(); }, [cargar]);

    const sel = (lista || []).find(d => d.id === selId) || null;
    // Cada acción devuelve la declaración al día: se reemplaza en la lista sin volver a pedirla.
    const reemplazar = (d) => setLista(l => (l || []).map(x => (x.id === d.id ? d : x)));
    const accion = async (fn, ok) => {
        try {
            const r = await fn();
            if (r?.data?.id) reemplazar(r.data);
            if (ok) notify(ok);
        } catch (e) { notify(e.message, "err"); }
    };

    const nueva = async () => {
        try {
            const r = await api.ivaDeclarations.create({ periodo, quincena });
            notify("Declaración calculada con los libros del período");
            await cargar(r.data.id);
        } catch (e) { notify(e.message, "err"); }
    };

    if (error) return <div className="p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-semibold">{error}</div>;
    if (!lista) return <div className="flex-1 flex items-center justify-center"><Loading /></div>;

    return (
        <div className="lg:h-full flex flex-col lg:flex-row gap-3 lg:overflow-hidden">
            {/* Columna: nueva declaración y la lista. */}
            <aside className="lg:w-80 shrink-0 flex flex-col gap-3 lg:min-h-0">
                {esAdmin && (
                    <div className={`${SECTION} p-4 space-y-3 shrink-0`}>
                        <div>
                            <p className="text-[14px] font-semibold text-content dark:text-white">Nueva declaración</p>
                            <p className="text-[12px] text-content-subtle">Por mes, o por quincena si eres contribuyente especial.</p>
                        </div>
                        <CustomSelect value={periodo} onChange={setPeriodo} options={meses} className="w-full" />
                        <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={quincena} onChange={setQuincena} options={PERIODOS} />
                        <Button onClick={nueva} className="w-full h-12 sm:h-10 text-[13px]">Calcular declaración</Button>
                    </div>
                )}
                <div className={`${SECTION} overflow-hidden lg:flex-1 lg:min-h-0 flex flex-col`}>
                    <p className="px-4 pt-4 pb-2 text-[14px] font-semibold text-content dark:text-white shrink-0">Declaraciones</p>
                    {lista.length === 0 ? (
                        <p className="px-4 pb-6 text-[13px] text-content-subtle">Todavía no hay declaraciones.</p>
                    ) : (
                        <div className="divide-y divide-border/60 dark:divide-white/[0.06] border-t border-border/60 dark:border-white/[0.06] lg:overflow-y-auto">
                            {lista.map(d => (
                                <button key={d.id} onClick={() => setSelId(d.id)}
                                    className={`w-full text-left px-4 py-3 flex items-start justify-between gap-3 transition-colors ${d.id === selId ? "bg-brand-500/[0.06]" : "hover:bg-surface-2 dark:hover:bg-white/[0.03]"}`}>
                                    <span className="min-w-0">
                                        <span className="block text-[13px] font-semibold text-content dark:text-white">{d.nombre}</span>
                                        <span className="block text-[12px] text-content-subtle tabular-nums">
                                            {d.total_pagar > 0 ? `A pagar ${fmtB(d.total_pagar)}` : d.excedente_siguiente > 0 ? `Excedente ${fmtB(d.excedente_siguiente)}` : "Sin cuota"}
                                        </span>
                                    </span>
                                    <StatusMark status={d.state} map={ESTADOS} />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </aside>

            <main className="flex-1 min-w-0 lg:overflow-y-auto space-y-3">
                {sel ? (
                    <Detalle d={sel} esAdmin={esAdmin} fmtB={fmtB} sym={sym} accion={accion} setConfirmar={setConfirmar}
                        onEliminada={() => { setSelId(null); cargar(); }} />
                ) : (
                    <div className={`${SECTION} px-6 py-16 text-center`}>
                        <p className="text-[14px] font-semibold text-content dark:text-white">Elige o calcula una declaración</p>
                        <p className="text-[13px] text-content-subtle mt-1">Las casillas salen del Libro de ventas y del Libro de compras del período.</p>
                    </div>
                )}
            </main>

            <ConfirmModal
                isOpen={!!confirmar}
                title={confirmar?.titulo}
                message={confirmar?.mensaje}
                onConfirm={async () => { await confirmar.fn(); setConfirmar(null); }}
                onCancel={() => setConfirmar(null)}
                type={confirmar?.peligro ? "danger" : undefined}
                confirmText={confirmar?.boton}
            />
        </div>
    );
}

// Una casilla de la forma 30: número, rótulo y monto. Editable en borrador (las que admiten corrección).
function Casilla({ n, label, valor, fmtB, fuerte, editable, onGuardar, ayuda }) {
    const [texto, setTexto] = useState(null);
    const guardar = () => {
        if (texto === null) return;
        const v = parseFloat(String(texto).replace(",", "."));
        setTexto(null);
        if (Number.isFinite(v) && Math.abs(v - valor) > 0.004) onGuardar(v);
    };
    return (
        <div className="flex items-center justify-between gap-3 py-1.5">
            <div className="min-w-0">
                <p className={`text-[13px] ${fuerte ? "font-semibold text-content dark:text-white" : "text-content dark:text-white/85"}`}>
                    {n && <span className="text-content-subtle tabular-nums mr-1.5">{n}</span>}{label}
                </p>
                {ayuda && <p className="text-[12px] text-content-subtle leading-snug">{ayuda}</p>}
            </div>
            {editable ? (
                <input className={INPUT} inputMode="decimal" value={texto ?? fmtNumber(valor, 2)}
                    onFocus={() => setTexto(String(valor))} onChange={e => setTexto(e.target.value)}
                    onBlur={guardar} onKeyDown={e => e.key === "Enter" && e.currentTarget.blur()} />
            ) : (
                <span className={`shrink-0 tabular-nums text-[13px] ${fuerte ? "font-semibold text-content dark:text-white" : "text-content dark:text-white/85"}`}>{fmtB(valor)}</span>
            )}
        </div>
    );
}

function Bloque({ titulo, children }) {
    return (
        <div className={`${SECTION} p-4 sm:p-5`}>
            <p className="text-[14px] font-semibold text-content dark:text-white mb-2">{titulo}</p>
            <div className="divide-y divide-border/50 dark:divide-white/[0.05]">{children}</div>
        </div>
    );
}

function Detalle({ d, esAdmin, fmtB, sym, accion, setConfirmar, onEliminada }) {
    const borrador = d.state === "borrador";
    const editable = esAdmin && borrador;
    const guardar = (campo) => (v) => accion(() => api.ivaDeclarations.update(d.id, { [campo]: v }));
    const [fechaPago, setFechaPago] = useState(todayISO());
    const [referencia, setReferencia] = useState("");
    const [planilla, setPlanilla] = useState(d.planilla || "");
    useEffect(() => { setPlanilla(d.planilla || ""); }, [d.id, d.planilla]);

    const hayCuota = d.total_pagar > 0;
    return (
        <>
            <div className={`${SECTION} p-4 sm:p-5`}>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[20px] font-semibold text-content dark:text-white">{d.nombre}</p>
                            <StatusMark status={d.state} map={ESTADOS} />
                        </div>
                        <p className="text-[12px] text-content-subtle mt-0.5">
                            Del {fmtDateShort(d.fecha_desde)} al {fmtDateShort(d.fecha_hasta)} · {d.documentos_ventas} documentos de venta · {d.documentos_compras} de compra
                        </p>
                    </div>
                    <div className="sm:text-right shrink-0">
                        <p className="text-[12px] text-content-subtle">{hayCuota ? "Total a pagar" : "Excedente para el próximo período"}</p>
                        <p className="text-[26px] font-bold tracking-tight tabular-nums text-content dark:text-white">{fmtB(hayCuota ? d.total_pagar : d.excedente_siguiente)}</p>
                        {d.anticipo_islr > 0 && <p className="text-[12px] text-content-subtle tabular-nums">Más anticipo de ISLR {fmtB(d.anticipo_islr)}</p>}
                    </div>
                </div>

                {d.sin_iva_ventas > 0 && (
                    <p className="mt-3 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-2 text-[12px] leading-snug">
                        {d.sin_iva_ventas} {d.sin_iva_ventas === 1 ? "factura se emitió" : "facturas se emitieron"} antes de activar el IVA: no tienen desglose y no entran a las casillas.
                    </p>
                )}

                {esAdmin && (
                    <div className="mt-4 pt-4 border-t border-border/60 dark:border-white/[0.06] flex flex-col sm:flex-row sm:items-end gap-2 flex-wrap">
                        {borrador && <>
                            <Button onClick={() => setConfirmar({
                                titulo: "¿Presentar la declaración?",
                                mensaje: `Queda fija con ${hayCuota ? `${fmtB(d.total_pagar)} a pagar` : `${fmtB(d.excedente_siguiente)} de excedente`}. Si los libros cambiaron desde el cálculo, el sistema te pedirá calcular otra vez.`,
                                boton: "Presentar",
                                fn: () => accion(() => api.ivaDeclarations.declarar(d.id), "Declaración presentada"),
                            })} className="h-12 sm:h-10 px-5 text-[13px]">Presentar declaración</Button>
                            <button onClick={() => accion(() => api.ivaDeclarations.calcular(d.id), "Calculada otra vez con los libros de hoy")}
                                className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-medium">Calcular otra vez</button>
                            <button onClick={() => setConfirmar({
                                titulo: "¿Eliminar el borrador?", mensaje: `Se elimina ${d.nombre}. Se puede volver a calcular cuando quieras.`,
                                boton: "Eliminar", peligro: true,
                                fn: () => accion(async () => { await api.ivaDeclarations.remove(d.id); onEliminada(); }, "Borrador eliminado"),
                            })} className="h-12 sm:h-10 px-3 rounded-lg text-[13px] font-medium text-content-subtle hover:text-red-600 dark:hover:text-red-400">Eliminar</button>
                        </>}
                        {d.state === "declarada" && <>
                            <div className="flex items-end gap-2 flex-wrap">
                                <div>
                                    <p className="text-[12px] text-content-subtle mb-1">Fecha del pago</p>
                                    <DatePicker value={fechaPago} onChange={v => v && setFechaPago(v)} clearable={false} />
                                </div>
                                <input className="h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] w-44" placeholder="Referencia del pago" value={referencia} onChange={e => setReferencia(e.target.value)} />
                                <Button onClick={() => accion(() => api.ivaDeclarations.pago(d.id, { fecha_pago: fechaPago, referencia_pago: referencia }), "Declaración marcada como pagada")}
                                    className="h-12 sm:h-10 px-5 text-[13px]">Marcar pagada</Button>
                            </div>
                            <button onClick={() => accion(() => api.ivaDeclarations.borrador(d.id), "La declaración volvió a borrador")}
                                className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-medium">Volver a borrador</button>
                        </>}
                        {d.state === "pagada" && (
                            <>
                                <p className="text-[13px] text-content-subtle">Pagada el {fmtDateShort(d.fecha_pago)}{d.referencia_pago ? ` · ref. ${d.referencia_pago}` : ""}</p>
                                <button onClick={() => accion(() => api.ivaDeclarations.pago(d.id, { deshacer: true }), "Pago deshecho")}
                                    className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-medium">Deshacer pago</button>
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <Bloque titulo="Débitos fiscales (ventas)">
                    <Casilla n="40" label="Ventas exentas o no sujetas" valor={d.ventas_exentas} fmtB={fmtB} />
                    <Casilla n="42" label="Ventas alícuota general" valor={d.ventas_base_general} fmtB={fmtB} />
                    <Casilla n="43" label="Débito fiscal alícuota general" valor={d.debito_general} fmtB={fmtB} />
                    {(d.ventas_base_adicional > 0 || d.debito_adicional > 0) && <>
                        <Casilla n="442" label="Ventas alícuota general + adicional" valor={d.ventas_base_adicional} fmtB={fmtB} />
                        <Casilla n="452" label="Débito fiscal alícuota adicional" valor={d.debito_adicional} fmtB={fmtB} />
                    </>}
                    {(d.ventas_base_reducida > 0 || d.debito_reducida > 0) && <>
                        <Casilla n="443" label="Ventas alícuota reducida" valor={d.ventas_base_reducida} fmtB={fmtB} />
                        <Casilla n="453" label="Débito fiscal alícuota reducida" valor={d.debito_reducida} fmtB={fmtB} />
                    </>}
                    <Casilla n="46" label="Total ventas" valor={d.total_ventas} fmtB={fmtB} fuerte />
                    <Casilla n="49" label="Total débitos fiscales" valor={d.total_debitos} fmtB={fmtB} fuerte />
                </Bloque>

                <Bloque titulo="Créditos fiscales (compras)">
                    <Casilla n="30" label="Compras exentas o no sujetas" valor={d.compras_exentas} fmtB={fmtB} />
                    <Casilla n="33" label="Compras alícuota general" valor={d.compras_base_general} fmtB={fmtB} />
                    <Casilla n="34" label="Crédito fiscal alícuota general" valor={d.credito_general} fmtB={fmtB} />
                    {(d.compras_base_adicional > 0 || d.credito_adicional > 0) && <>
                        <Casilla n="332" label="Compras alícuota general + adicional" valor={d.compras_base_adicional} fmtB={fmtB} />
                        <Casilla n="342" label="Crédito fiscal alícuota adicional" valor={d.credito_adicional} fmtB={fmtB} />
                    </>}
                    {(d.compras_base_reducida > 0 || d.credito_reducida > 0) && <>
                        <Casilla n="333" label="Compras alícuota reducida" valor={d.compras_base_reducida} fmtB={fmtB} />
                        <Casilla n="343" label="Crédito fiscal alícuota reducida" valor={d.credito_reducida} fmtB={fmtB} />
                    </>}
                    <Casilla n="35" label="Total compras" valor={d.total_compras} fmtB={fmtB} fuerte />
                    <Casilla n="36" label="Total créditos fiscales" valor={d.total_creditos} fmtB={fmtB} fuerte />
                    <Casilla n="37" label="Créditos deducibles" valor={d.creditos_prorrata} fmtB={fmtB} editable={editable}
                        onGuardar={guardar("creditos_prorrata")}
                        ayuda={d.prorrata_manual
                            ? <>Corregida a mano. {editable && <button className="underline" onClick={() => guardar("prorrata_manual")(false)}>Volver al cálculo</button>}</>
                            : d.ventas_exentas > 0 ? `Prorrata: la parte de las ventas gravadas sobre el total de ventas` : null} />
                    {d.creditos_no_deducibles > 0 && <Casilla label="Créditos no deducibles (van a gasto)" valor={d.creditos_no_deducibles} fmtB={fmtB} />}
                    <Casilla n="20" label="Excedente del período anterior" valor={d.excedente_anterior} fmtB={fmtB} editable={editable}
                        onGuardar={guardar("excedente_anterior")} ayuda={editable ? "Sale de la declaración anterior; corrígelo si venía de antes de usar el sistema" : null} />
                    <Casilla n="39" label="Total créditos deducibles" valor={d.total_creditos_deducibles} fmtB={fmtB} fuerte />
                </Bloque>

                <Bloque titulo="Autoliquidación">
                    <Casilla n="53" label="Cuota tributaria del período" valor={d.cuota} fmtB={fmtB} fuerte />
                    <Casilla n="60" label="Excedente para el período siguiente" valor={d.excedente_siguiente} fmtB={fmtB} />
                </Bloque>

                <Bloque titulo="Retenciones de IVA (clientes)">
                    <Casilla n="54" label="Retenciones acumuladas por descontar" valor={d.retenciones_anteriores} fmtB={fmtB} editable={editable} onGuardar={guardar("retenciones_anteriores")} />
                    <Casilla n="66" label="Retenciones del período" valor={d.retenciones_periodo} fmtB={fmtB} />
                    <Casilla n="55" label="Retenciones descontadas" valor={d.retenciones_descontadas} fmtB={fmtB} />
                    <Casilla n="67" label="Saldo de retenciones no aplicado" valor={d.retenciones_saldo} fmtB={fmtB} />
                    <Casilla n="90" label="Total a pagar" valor={d.total_pagar} fmtB={fmtB} fuerte />
                </Bloque>

                <Bloque titulo="Anticipo de ISLR y planilla">
                    <div className="flex items-center justify-between gap-3 py-1.5">
                        <p className="text-[13px] text-content dark:text-white/85">Anticipo de ISLR (% de las ventas)</p>
                        {editable ? (
                            <input className={INPUT} inputMode="decimal" defaultValue={d.anticipo_porcentaje || ""} placeholder="0"
                                onBlur={e => { const v = parseFloat(e.target.value.replace(",", ".")) || 0; if (v !== d.anticipo_porcentaje) guardar("anticipo_porcentaje")(v); }} />
                        ) : <span className="text-[13px] tabular-nums">{fmtNumber(d.anticipo_porcentaje || 0, 2)} %</span>}
                    </div>
                    <Casilla label="Anticipo de ISLR" valor={d.anticipo_islr} fmtB={fmtB} />
                    <div className="flex items-center justify-between gap-3 py-1.5">
                        <p className="text-[13px] text-content dark:text-white/85">N° de planilla del SENIAT</p>
                        {esAdmin ? (
                            <input className="w-40 h-9 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white" value={planilla}
                                onChange={e => setPlanilla(e.target.value)} onBlur={() => planilla !== (d.planilla || "") && accion(() => api.ivaDeclarations.update(d.id, { planilla }), "Planilla guardada")} placeholder="Al presentar" />
                        ) : <span className="text-[13px]">{d.planilla || "—"}</span>}
                    </div>
                </Bloque>
            </div>
            <p className="text-[12px] text-content-subtle px-1">Montos en {sym}, con los mismos totales que el Libro de ventas y el Libro de compras del período.</p>
        </>
    );
}
