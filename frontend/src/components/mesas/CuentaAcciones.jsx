import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { fmtMoney, fmtTime, toNameCase } from "../../helpers";
import { isIntegerUnit } from "../../helpers/unitFormatter";
import { TableGrid, agruparPorMesa } from "./TablePlan";

// Lo que se hace con una cuenta de la mesa antes de cobrarla: avisar que pidieron la cuenta,
// dividirla por platos, cambiarla de mesa y juntarla con otra. Lo usan el mesonero (en la mesa)
// y la caja (desde el mapa). Nada de esto cobra ni mueve inventario (ver services/mesaCuentas.js).

const fmtQty = (q) => {
    const n = parseFloat(q) || 0;
    return Number.isInteger(n) ? String(n) : n.toLocaleString("es-VE", { maximumFractionDigits: 3 });
};
const nombreCuenta = (c, i, total) => toNameCase(c.customer_name) || (total > 1 ? `Cuenta ${i + 1}` : "La cuenta");

const Svg = ({ d, className = "w-4 h-4" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} /></svg>
);
const ICONO = {
    cuenta: "M9 7h6m-6 4h6m-6 4h3M6 3h12v18l-3-2-3 2-3-2-3 2V3z",
    dividir: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
    mover: "M13 7l5 5m0 0l-5 5m5-5H6",
    juntar: "M4 6h7v12H4zM13 6h7v12h-7z",
};

// Platos de la cuenta con sus adicionales debajo: la venta guarda cada adicional detrás de su
// plato, y al dividir se va con él.
function platosDe(items) {
    const platos = [];
    for (const it of items || []) {
        if (it.is_addon && platos.length) platos[platos.length - 1].adicionales.push(it);
        else platos.push({ ...it, adicionales: [] });
    }
    return platos;
}
const montoDe = (it) => parseFloat(it.subtotal ?? (parseFloat(it.price) * parseFloat(it.quantity))) || 0;

function DividirModal({ cuenta, sym, notify, onClose, onDone }) {
    const platos = useMemo(() => platosDe(cuenta.items), [cuenta.items]);
    const [pasan, setPasan] = useState({});   // id de línea → cantidad que pasa

    const setQty = (p, q) => setPasan(s => ({ ...s, [p.id]: Math.max(0, Math.min(parseFloat(p.quantity), q)) }));
    // Lo que pasa de un plato arrastra la misma parte de sus adicionales.
    const monto = platos.reduce((s, p) => {
        const k = pasan[p.id] || 0;
        if (!k) return s;
        const parte = k / parseFloat(p.quantity);
        return s + montoDe(p) * parte + p.adicionales.reduce((a, x) => a + montoDe(x) * parte, 0);
    }, 0);
    const elegidos = platos.filter(p => pasan[p.id] > 0);
    const todo = platos.every(p => (pasan[p.id] || 0) >= parseFloat(p.quantity));

    const dividir = async () => {
        try {
            const r = await api.tables.splitAccount(cuenta.id, elegidos.map(p => ({ id: p.id, qty: pasan[p.id] })));
            notify("Listo: la mesa tiene una cuenta más");
            onDone(r.data?.new_sale_id);
        } catch (e) {
            notify(e.message || "No se pudo dividir la cuenta", "err");
        }
    };

    const pie = (
        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 w-full">
            <span className="text-[12px] text-content-subtle sm:mr-auto">
                {todo ? "Deja al menos un plato en esta cuenta" : elegidos.length ? `${elegidos.length} ${elegidos.length === 1 ? "plato pasa" : "platos pasan"} a una cuenta nueva` : "Elige lo que paga la otra persona"}
            </span>
            <button type="button" onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
            <Button className="h-12 sm:h-10 px-5" disabled={!elegidos.length || todo} onClick={dividir}>
                Pasar a cuenta nueva · <span className="tabular-nums">{fmtMoney(monto, sym)}</span>
            </Button>
        </div>
    );

    return (
        <Modal open onClose={onClose} title="Dividir la cuenta" width={560} footer={pie}>
            <p className="text-[13px] text-content-subtle mb-3">
                Marca lo que paga otra persona. Pasa a una cuenta nueva en la misma mesa, que se cobra y se factura aparte. Los adicionales van con su plato.
            </p>
            <ul className="divide-y divide-border/60 dark:divide-white/[0.06] border-y border-border/60 dark:border-white/[0.06]">
                {platos.map(p => {
                    const max = parseFloat(p.quantity);
                    const k = pasan[p.id] || 0;
                    // Lo que se pesa no se parte aquí: pasa entero o no pasa.
                    const paso = isIntegerUnit(p.unit) ? 1 : max;
                    return (
                        <li key={p.id} className="py-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="text-[14px] font-semibold text-content dark:text-white leading-snug">
                                    <span className="tabular-nums">{fmtQty(max)}</span> {p.name}
                                </div>
                                {(p.note || p.adicionales.length > 0) && (
                                    <div className="text-[12px] text-content-subtle leading-snug">
                                        {[p.note, ...p.adicionales.filter(x => parseFloat(x.price) > 0).map(x => `+ ${x.name}`)].filter(Boolean).join(" · ")}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button type="button" onClick={() => setQty(p, k - paso)} disabled={k <= 0} aria-label={`Quitar ${p.name}`}
                                    className="w-11 h-11 rounded-lg btn-outline text-[18px] font-semibold disabled:opacity-40">−</button>
                                <span className={`w-10 text-center text-[16px] font-bold tabular-nums ${k > 0 ? "text-content dark:text-white" : "text-content-subtle"}`}>{fmtQty(k)}</span>
                                <button type="button" onClick={() => setQty(p, k + paso)} disabled={k >= max} aria-label={`Pasar ${p.name}`}
                                    className="w-11 h-11 rounded-lg btn-outline text-[18px] font-semibold disabled:opacity-40">+</button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </Modal>
    );
}

function MoverModal({ table, cuenta, warehouseId, sym, notify, onClose, onDone }) {
    const [areas, setAreas] = useState(null);
    const [ocupacion, setOcupacion] = useState([]);
    const [areaId, setAreaId] = useState(null);
    const [destino, setDestino] = useState(null);   // mesa elegida

    useEffect(() => {
        Promise.all([api.tables.areas({ warehouse_id: warehouseId }), api.tables.occupancy({ warehouse_id: warehouseId })])
            .then(([a, o]) => {
                setAreas(a.data || []);
                setOcupacion(o.data || []);
                setAreaId((a.data || []).find(x => x.tables.some(t => t.id === table.id))?.id ?? null);
            })
            .catch(e => { notify(e.message || "No se pudo cargar el plano", "err"); onClose(); });
    }, [warehouseId, table.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const porMesa = useMemo(() => agruparPorMesa(ocupacion), [ocupacion]);
    const area = areas?.find(a => a.id === areaId) || areas?.[0] || null;
    const fmtTotal = (cs) => fmtMoney(cs.reduce((s, c) => s + parseFloat(c.total || 0), 0), sym);
    const cuentasDestino = destino ? porMesa.get(destino.id) || [] : [];

    const tocar = (t) => {
        if (!t) return;
        if (t.id === table.id) return notify("La cuenta ya está en esta mesa", "err");
        setDestino(t);
    };

    const mover = async (body, aviso) => {
        try {
            const r = await api.tables.moveAccount(cuenta.id, body);
            notify(aviso);
            onDone(r.data?.sale_id);
        } catch (e) {
            notify(e.message || "No se pudo mover la cuenta", "err");
        }
    };

    const pie = destino && (
        <div className="w-full space-y-2">
            <div className="text-[13px] text-content dark:text-white">
                <span className="font-semibold">{destino.name}</span>
                <span className="text-content-subtle">{cuentasDestino.length ? ` tiene ${cuentasDestino.length === 1 ? "una cuenta abierta" : `${cuentasDestino.length} cuentas abiertas`}` : " está libre"}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                {cuentasDestino.map((c, i) => (
                    <Button key={c.id} className="h-12 sm:h-10 px-4"
                        onClick={() => mover({ join_sale_id: c.id }, `Cuenta juntada con ${destino.name}`)}>
                        Juntar con {cuentasDestino.length > 1 ? nombreCuenta(c, i, cuentasDestino.length).toLowerCase() : "su cuenta"} · <span className="tabular-nums">{fmtMoney(c.total, sym)}</span>
                    </Button>
                ))}
                {cuentasDestino.length ? (
                    <button type="button" onClick={() => mover({ table_id: destino.id }, `Cuenta pasada a ${destino.name}`)}
                        className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-medium">Dejarla como cuenta aparte</button>
                ) : (
                    <Button className="h-12 sm:h-10 px-5" onClick={() => mover({ table_id: destino.id }, `Cuenta pasada a ${destino.name}`)}>
                        Mover a {destino.name}
                    </Button>
                )}
                <button type="button" onClick={() => setDestino(null)} className="h-12 sm:h-10 px-4 rounded-lg text-[13px] font-medium text-content-subtle sm:ml-auto">Elegir otra</button>
            </div>
        </div>
    );

    return (
        <Modal open onClose={onClose} title={`Mover la cuenta de ${table.name}`} width={760} footer={pie}>
            {!areas ? (
                <div className="py-16 flex justify-center"><Spinner /></div>
            ) : (
                <div className="space-y-3">
                    <p className="text-[13px] text-content-subtle">Toca la mesa a la que se cambian. Si está ocupada, puedes juntar las cuentas.</p>
                    {areas.length > 1 && (
                        <div className="flex gap-1 overflow-x-auto scrollbar-hide border-b border-border/60 dark:border-white/[0.06]">
                            {areas.map(a => (
                                <button key={a.id} type="button" onClick={() => { setAreaId(a.id); setDestino(null); }}
                                    className={`px-4 py-2 text-[13px] font-semibold border-b-2 whitespace-nowrap ${a.id === area?.id ? "border-brand-500 text-brand-700 dark:text-brand-300" : "border-transparent text-content-subtle"}`}>
                                    {a.name}
                                </button>
                            ))}
                        </div>
                    )}
                    {/* Tarjetas y no el plano a escala: dentro de un modal las mesas quedan chicas y
                        lo que importa aquí es leer el nombre y si está ocupada. */}
                    {area && (
                        <TableGrid tables={area.tables} cuentasPorMesa={porMesa} fmtTotal={fmtTotal} highlightId={destino?.id ?? table.id} onTap={tocar}
                            className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2" />
                    )}
                </div>
            )}
        </Modal>
    );
}

function JuntarModal({ cuenta, cuentas, sym, notify, onClose, onDone }) {
    const otras = cuentas.filter(c => c.id !== cuenta.id);
    const juntar = async (c) => {
        try {
            const r = await api.tables.moveAccount(cuenta.id, { join_sale_id: c.id });
            notify("Cuentas juntadas");
            onDone(r.data?.sale_id);
        } catch (e) {
            notify(e.message || "No se pudieron juntar", "err");
        }
    };
    return (
        <Modal open onClose={onClose} title="Juntar cuentas" width={460}>
            <p className="text-[13px] text-content-subtle mb-3">Los platos de esta cuenta pasan a la que elijas, y queda una sola.</p>
            <div className="space-y-2">
                {otras.map(c => {
                    const i = cuentas.indexOf(c);
                    return (
                        <Button key={c.id} variant="ghost" className="w-full h-12 px-4 !justify-between" onClick={() => juntar(c)}>
                            <span className="truncate">{nombreCuenta(c, i, cuentas.length)}</span>
                            <span className="tabular-nums">{fmtMoney(c.total, sym)}</span>
                        </Button>
                    );
                })}
            </div>
        </Modal>
    );
}

/**
 * Botonera de la cuenta. `onChanged(saleId?)`: la mesa cambió y hay que volver a leerla; con
 * `saleId`, la cuenta que conviene dejar elegida (la nueva al dividir, la que quedó al juntar).
 */
export default function CuentaAcciones({ table, cuenta, cuentas, warehouseId, sym, notify, onChanged }) {
    const [abierto, setAbierto] = useState(null);   // dividir · mover · juntar
    const [marcando, setMarcando] = useState(false);
    const bloqueada = !!cuenta.held_by_name;
    const pedida = cuenta.bill_requested_at;

    const alternarCuenta = async () => {
        if (marcando) return;
        setMarcando(true);
        try {
            await api.tables.requestBill(cuenta.id, !pedida);
            notify(pedida ? "Aviso de cuenta quitado" : `${table.name}: la caja ya sabe que pidieron la cuenta`);
            onChanged(cuenta.id);
        } catch (e) {
            notify(e.message || "No se pudo avisar", "err");
        } finally {
            setMarcando(false);
        }
    };
    const listo = (id) => { setAbierto(null); onChanged(id); };
    const platos = platosDe(cuenta.items);
    const unidades = platos.reduce((s, p) => s + parseFloat(p.quantity), 0);

    const BOTON = "h-11 px-3 rounded-lg text-[13px] font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50";
    return (
        <>
            <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={alternarCuenta} disabled={marcando}
                    className={`${BOTON} col-span-2 ${pedida ? "border border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300" : "btn-outline"}`}>
                    {marcando ? <Spinner /> : <Svg d={ICONO.cuenta} />}
                    {pedida ? `Pidió la cuenta · ${fmtTime(pedida)} · quitar aviso` : "Pidió la cuenta"}
                </button>
                <button type="button" onClick={() => setAbierto("mover")} disabled={bloqueada} className={`${BOTON} btn-outline`}>
                    <Svg d={ICONO.mover} /> Cambiar de mesa
                </button>
                <button type="button" onClick={() => setAbierto("dividir")} disabled={bloqueada || unidades < 2} className={`${BOTON} btn-outline`}
                    title={unidades < 2 ? "Hace falta más de un plato para dividir" : undefined}>
                    <Svg d={ICONO.dividir} /> Dividir
                </button>
                {cuentas.length > 1 && (
                    <button type="button" onClick={() => setAbierto("juntar")} disabled={bloqueada} className={`${BOTON} btn-outline col-span-2`}>
                        <Svg d={ICONO.juntar} /> Juntar con otra cuenta de la mesa
                    </button>
                )}
            </div>

            {abierto === "dividir" && <DividirModal cuenta={cuenta} sym={sym} notify={notify} onClose={() => setAbierto(null)} onDone={listo} />}
            {abierto === "mover" && <MoverModal table={table} cuenta={cuenta} warehouseId={warehouseId} sym={sym} notify={notify} onClose={() => setAbierto(null)} onDone={listo} />}
            {abierto === "juntar" && <JuntarModal cuenta={cuenta} cuentas={cuentas} sym={sym} notify={notify} onClose={() => setAbierto(null)} onDone={listo} />}
        </>
    );
}
