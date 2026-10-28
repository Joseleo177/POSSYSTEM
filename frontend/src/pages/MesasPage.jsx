import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import Page from "../components/ui/Page";
import Modal from "../components/ui/Modal";
import ConfirmModal from "../components/ui/ConfirmModal";
import Segmented from "../components/ui/Segmented";
import CustomSelect from "../components/ui/CustomSelect";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import TablePlan, { TableGrid, agruparPorMesa, minutosDesde, COLS, ROWS, TAMANOS, GIROS, huella, tamanoDe, giroDe } from "../components/mesas/TablePlan";
import KitchenMark from "../components/KitchenMark";
import WaiterOrder from "../components/mesas/WaiterOrder";
import CuentaAcciones from "../components/mesas/CuentaAcciones";
import { fmtMoney, fmtTime, toNameCase } from "../helpers";

// Mapa de mesas: el plano de cada área con lo que pasa en cada mesa, y el editor del plano.
// Las cuentas se cobran desde Venta (POS) → Mesas; aquí se mira y se arma el salón.
// El mesonero mira el mapa para saber qué llevar: cada 15 s alcanza y es una consulta liviana.
const REFRESCO_MS = 15_000;

const LABEL = "text-[12px] font-medium text-content-subtle";
const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";

// Icono de cada giro: la mesa misma, girada igual que quedará en el plano.
const IconoGiro = ({ shape, rot }) => (
    <svg className="w-5 h-5" viewBox="0 0 20 20" aria-hidden="true">
        <g transform={`rotate(${rot} 10 10)`}>
            {shape === "rect"
                ? <rect x="2.5" y="7" width="15" height="6" rx="1.5" fill="currentColor" opacity="0.85" />
                : <rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor" opacity="0.85" />}
        </g>
    </svg>
);
const NOMBRE_GIRO = { 0: "Recta", 90: "Vertical", 45: "Diagonal", 135: "Diagonal invertida" };

const leer = (k, def) => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } };

// Primer hueco libre del plano para una mesa nueva, de arriba abajo y de izquierda a derecha.
function hueco(tables, w, h) {
    const choca = (x, y) => tables.some(t => x < t.x + t.w && x + w > t.x && y < t.y + t.h && y + h > t.y);
    for (let y = 1; y + h <= ROWS; y += 1) {
        for (let x = 1; x + w <= COLS; x += 1) if (!choca(x, y)) return { x, y };
    }
    return { x: 0, y: 0 };
}

// "Mesa 7" después de "Mesa 6": el número más alto que ya se use, más uno.
function siguienteNombre(todas) {
    const n = Math.max(0, ...todas.map(t => parseInt(String(t.name).match(/(\d+)\s*$/)?.[1] || "0", 10)));
    return `Mesa ${n + 1}`;
}

export default function MesasPage() {
    const { can, notify, company, baseCurrency, employee } = useApp();
    const puedeEditar = can("tables.layout");
    const puedeServir = can("tables.serve");
    const cid = company?.id ?? "x";
    const sym = baseCurrency?.symbol || "Ref.";

    const [warehouses, setWarehouses] = useState([]);
    const [almacen, setAlmacenState] = useState(() => leer(`mesas_almacen_${cid}`, ""));
    const setAlmacen = (v) => { setAlmacenState(v); guardar(`mesas_almacen_${cid}`, v); };

    const [areas, setAreas] = useState([]);
    const [areaId, setAreaIdState] = useState(() => leer(`mesas_area_${cid}`, ""));
    const setAreaId = (v) => { setAreaIdState(String(v)); guardar(`mesas_area_${cid}`, String(v)); };
    const [loading, setLoading] = useState(true);
    const [cuentas, setCuentas] = useState([]);

    const [editando, setEditando] = useState(false);
    const [borrador, setBorrador] = useState([]);
    const [selId, setSelId] = useState(null);
    const [areaModal, setAreaModal] = useState(null);   // null · { id?, name }
    const [quitarArea, setQuitarArea] = useState(false);
    const [abierta, setAbierta] = useState(null);       // mesa cuyo detalle se está viendo
    const [atendiendo, setAtendiendo] = useState(null); // mesa en la que el mesonero toma el pedido
    // Quien toma pedidos entra a la mesa; quien solo mira, ve su detalle.
    const tocarMesa = (t) => (puedeServir ? setAtendiendo(t) : setAbierta(t));

    useEffect(() => {
        const elegir = (lista) => {
            setWarehouses(lista);
            // Sin sucursal elegida, la primera: el plano es de una sucursal, no de todas.
            if (!lista.some(w => String(w.id) === String(almacen))) {
                if (lista[0]) setAlmacen(String(lista[0].id));
                else setLoading(false);
            }
        };
        // El mesonero no tiene permiso de inventario, que es el que pide el listado de
        // sucursales: para él valen las que tiene asignadas en su usuario.
        api.warehouses.getAll()
            .then(r => elegir((r.data || []).filter(w => w.active !== false && w.sells !== false)))
            .catch(() => elegir((employee?.warehouses || []).filter(w => w.active !== false)));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const cargarAreas = useCallback(async () => {
        if (!almacen) return;
        try {
            const r = await api.tables.areas({ warehouse_id: almacen });
            setAreas(r.data || []);
        } catch (e) {
            notify(e.message || "No se pudo cargar el plano", "err");
        } finally {
            setLoading(false);
        }
    }, [almacen, notify]);

    // Ocupación desde el servicio de mesas y no desde el listado de ventas: el mesonero no
    // tiene permiso de ventas. Cuando una mesa pasa a "lista" en cocina se le avisa a quien
    // mira el mapa, que es el que tiene que llevarla.
    const estadoPrevio = useRef(null);
    const cargarCuentas = useCallback(async () => {
        if (!almacen) return;
        try {
            const r = await api.tables.occupancy({ warehouse_id: almacen });
            const data = r.data || [];
            const previo = estadoPrevio.current;
            if (previo) {
                const nombres = new Map(areas.flatMap(a => a.tables.map(t => [t.id, t.name])));
                for (const c of data) {
                    const antes = previo.get(c.id);
                    if (c.kitchen_status === "lista" && antes && antes !== "lista") {
                        notify(`${nombres.get(c.table_id) || "Una mesa"}: hay un pedido listo para llevar`);
                    }
                }
            }
            estadoPrevio.current = new Map(data.map(c => [c.id, c.kitchen_status]));
            setCuentas(data);
        } catch { /* carga de fondo */ }
    }, [almacen, areas, notify]);

    useEffect(() => { setLoading(true); estadoPrevio.current = null; cargarAreas(); }, [cargarAreas]);
    useEffect(() => { cargarCuentas(); }, [almacen]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const t = setInterval(() => { if (document.visibilityState === "visible") cargarCuentas(); }, REFRESCO_MS);
        return () => clearInterval(t);
    }, [cargarCuentas]);

    const area = areas.find(a => String(a.id) === String(areaId)) || areas[0] || null;
    const cuentasPorMesa = useMemo(() => agruparPorMesa(cuentas), [cuentas]);
    const fmtTotal = (cs) => fmtMoney(cs.reduce((s, c) => s + parseFloat(c.total || 0), 0), sym);

    const todasLasMesas = areas.flatMap(a => a.id === area?.id && editando ? borrador : a.tables);

    // ── Editor ──────────────────────────────────────────────
    const empezarEdicion = () => {
        setBorrador((area?.tables || []).map(t => ({ ...t })));
        setSelId(null);
        setEditando(true);
    };
    const cancelarEdicion = () => { setEditando(false); setSelId(null); };

    const cambiar = (id, patch) => setBorrador(b => b.map(t => (t.id === id ? { ...t, ...patch } : t)));
    const sel = borrador.find(t => t.id === selId) || null;

    const agregarMesa = () => {
        const [w, h] = TAMANOS.square.M;
        const pos = hueco(borrador, w, h);
        // Id provisional negativo: el servidor la crea al guardar.
        const nueva = { id: -Date.now(), name: siguienteNombre(todasLasMesas), seats: 4, shape: "square", rotation: 0, w, h, ...pos };
        setBorrador(b => [...b, nueva]);
        setSelId(nueva.id);
    };

    // Forma, tamaño y giro cambian la huella: se recalcula alrededor del mismo centro, para
    // que la mesa gire o crezca en su lugar, sin salirse del plano.
    const rehacer = (shape, k, rotation) => {
        const [w, h] = huella(shape, TAMANOS[shape][k] || TAMANOS[shape].M, rotation);
        const cx = sel.x + sel.w / 2, cy = sel.y + sel.h / 2;
        cambiar(sel.id, {
            shape, rotation, w, h,
            x: Math.min(Math.max(Math.round(cx - w / 2), 0), COLS - w),
            y: Math.min(Math.max(Math.round(cy - h / 2), 0), ROWS - h),
        });
    };
    const cambiarForma = (shape) => {
        if (!sel) return;
        // Lo que esa forma no admite se lleva al giro más parecido (la cuadrada a 90° es recta).
        const rot = giroDe(sel);
        const giro = GIROS[shape].includes(rot) ? rot : GIROS[shape].includes(rot % 90) ? rot % 90 : 0;
        rehacer(shape, tamanoDe(sel), giro);
    };
    const cambiarTamano = (k) => { if (sel) rehacer(sel.shape, k, giroDe(sel)); };
    const cambiarGiro = (rot) => { if (sel) rehacer(sel.shape, tamanoDe(sel), Number(rot)); };

    const guardarPlano = async () => {
        try {
            const r = await api.tables.saveLayout(area.id, borrador.map(({ id, name, seats, shape, rotation, x, y, w, h }) => ({
                id: id > 0 ? id : undefined, name, seats: parseInt(seats, 10) || 1, shape, rotation: rotation || 0, x, y, w, h,
            })));
            setAreas(r.data || []);
            setEditando(false);
            setSelId(null);
            notify("Plano guardado");
        } catch (e) {
            notify(e.message || "No se pudo guardar el plano", "err");
        }
    };

    const guardarArea = async () => {
        const name = (areaModal?.name || "").trim();
        if (!name) return notify("Ponle nombre al área", "err");
        try {
            if (areaModal.id) {
                await api.tables.renameArea(areaModal.id, name);
            } else {
                const r = await api.tables.createArea({ warehouse_id: almacen, name });
                setAreaId(r.data.id);
            }
            setAreaModal(null);
            await cargarAreas();
        } catch (e) {
            notify(e.message || "No se pudo guardar el área", "err");
        }
    };

    const borrarArea = async () => {
        try {
            await api.tables.deleteArea(area.id);
            setQuitarArea(false);
            setAreaId("");
            await cargarAreas();
            notify("Área quitada");
        } catch (e) {
            notify(e.message || "No se pudo quitar el área", "err");
            setQuitarArea(false);
        }
    };

    // ── Barra superior ──────────────────────────────────────
    const opcionesAlmacen = warehouses.map(w => ({ value: String(w.id), label: w.name }));
    const actions = editando ? (
        <div className="flex items-center gap-2">
            <button onClick={cancelarEdicion} className="btn-outline h-9 px-4 rounded-lg text-[13px] font-medium">Cancelar</button>
            <Button onClick={guardarPlano}>Guardar plano</Button>
        </div>
    ) : (
        <div className="flex items-center gap-2">
            {warehouses.length > 1 && (
                <CustomSelect value={almacen} onChange={v => { setAlmacen(v); setAreaId(""); }} options={opcionesAlmacen} className="w-44" height="h-9" />
            )}
            {puedeEditar && area && (
                <button onClick={empezarEdicion} className="btn-outline h-9 px-3 rounded-lg text-[13px] font-medium hidden lg:flex items-center gap-1.5 whitespace-nowrap">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Editar plano
                </button>
            )}
        </div>
    );

    // Pestañas de áreas, como las de Fábrica. Mientras se edita no se cambia de área: el
    // borrador es de una sola.
    const subheader = areas.length > 0 && (
        <div className="flex items-center gap-1 px-4 border-b border-border/20 dark:border-white/5 overflow-x-auto scrollbar-hide">
            {areas.map(a => (
                <button key={a.id} disabled={editando && a.id !== area?.id} onClick={() => setAreaId(a.id)}
                    className={["px-4 py-2 text-[13px] font-semibold border-b-2 transition-all whitespace-nowrap shrink-0 disabled:opacity-40",
                        a.id === area?.id ? "border-brand-500 text-brand-700 dark:text-brand-300" : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white",
                    ].join(" ")}>
                    {a.name}
                    {!editando && <span className="ml-1.5 text-[12px] font-medium text-content-subtle tabular-nums">{a.tables.filter(t => cuentasPorMesa.has(t.id)).length}/{a.tables.length}</span>}
                </button>
            ))}
            {puedeEditar && !editando && (
                <button onClick={() => setAreaModal({ name: "" })} className="hidden lg:flex ml-1 px-3 py-2 text-[13px] font-medium text-content-subtle hover:text-content dark:hover:text-white whitespace-nowrap items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M12 5v14M5 12h14" /></svg>
                    Área
                </button>
            )}
        </div>
    );

    const ocupadas = area ? area.tables.filter(t => cuentasPorMesa.has(t.id)).length : 0;

    return (
        <Page module="Mesas" title={editando ? `Editar plano · ${area?.name}` : "Mapa de mesas"} actions={actions} subheader={subheader}>
            {loading ? (
                <div className="py-16 flex justify-center"><Spinner /></div>
            ) : !area ? (
                <div className="py-16 text-center px-6 flex flex-col items-center">
                    <div className="w-12 h-12 rounded-xl bg-surface-2 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
                    </div>
                    <div className="text-[15px] font-semibold text-content dark:text-white mt-3">Todavía no hay plano</div>
                    <div className="text-[13px] text-content-subtle mt-1 max-w-sm">
                        {puedeEditar ? "Crea la primera área (Salón, Terraza, Barra) y acomoda sus mesas." : "Un administrador tiene que armar el plano del salón."}
                    </div>
                    {puedeEditar && <Button className="mt-4" onClick={() => setAreaModal({ name: "Salón" })}>+ Crear área</Button>}
                </div>
            ) : editando ? (
                <div className="flex-1 min-h-0 flex gap-4 py-1">
                    <div className="flex-1 min-w-0 min-h-0">
                        <TablePlan tables={borrador} editable selectedId={selId}
                            onTap={t => setSelId(t?.id ?? null)}
                            onMove={(id, pos) => { setSelId(id); cambiar(id, pos); }} />
                    </div>

                    {/* Inspector: lo que se edita de la mesa elegida, y las acciones del área. */}
                    <aside className="w-[280px] shrink-0 flex flex-col gap-3 overflow-y-auto">
                        <button onClick={agregarMesa}
                            className="h-10 rounded-lg border border-dashed border-border dark:border-white/15 text-[13px] font-medium text-content-subtle hover:text-content dark:hover:text-white hover:border-content/30 flex items-center justify-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M12 5v14M5 12h14" /></svg>
                            Agregar mesa
                        </button>

                        {sel ? (
                            <div className="bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none p-4 space-y-3">
                                <div className="text-[14px] font-semibold text-content dark:text-white">Mesa elegida</div>
                                <label className="block space-y-1">
                                    <span className={LABEL}>Nombre</span>
                                    <input className={INPUT} value={sel.name} maxLength={20} autoComplete="off"
                                        onChange={e => cambiar(sel.id, { name: e.target.value })} />
                                </label>
                                <label className="block space-y-1">
                                    <span className={LABEL}>Puestos</span>
                                    <input className={INPUT} type="number" inputMode="numeric" min={1} max={99} value={sel.seats}
                                        onChange={e => cambiar(sel.id, { seats: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
                                </label>
                                <div className="space-y-1">
                                    <span className={LABEL}>Forma</span>
                                    <Segmented value={sel.shape} onChange={cambiarForma}
                                        options={[{ key: "square", label: "Cuadrada" }, { key: "round", label: "Redonda" }, { key: "rect", label: "Larga" }]} />
                                </div>
                                <div className="space-y-1">
                                    <span className={LABEL}>Tamaño</span>
                                    <Segmented value={tamanoDe(sel)} onChange={cambiarTamano}
                                        options={[{ key: "S", label: "Chica" }, { key: "M", label: "Mediana" }, { key: "L", label: "Grande" }]} />
                                </div>
                                {GIROS[sel.shape].length > 1 && (
                                    <div className="space-y-1">
                                        <span className={LABEL}>Giro · {NOMBRE_GIRO[giroDe(sel)]}</span>
                                        <Segmented value={String(giroDe(sel))} onChange={cambiarGiro}
                                            options={GIROS[sel.shape].map(r => ({ key: String(r), label: <span title={NOMBRE_GIRO[r]}><IconoGiro shape={sel.shape} rot={r} /></span> }))} />
                                    </div>
                                )}
                                <button onClick={() => { setBorrador(b => b.filter(t => t.id !== sel.id)); setSelId(null); }}
                                    className="w-full h-9 rounded-lg text-[13px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10">
                                    Quitar mesa
                                </button>
                            </div>
                        ) : (
                            <p className="text-[12px] text-content-subtle px-1">
                                Arrastra las mesas para acomodarlas. Toca una para cambiarle el nombre, los puestos, la forma, el tamaño o el giro.
                            </p>
                        )}

                        <div className="mt-auto pt-3 border-t border-border/60 dark:border-white/[0.06] space-y-1">
                            <button onClick={() => setAreaModal({ id: area.id, name: area.name })}
                                className="w-full h-9 rounded-lg text-[13px] font-medium text-content-subtle hover:text-content dark:hover:text-white text-left px-2">
                                Renombrar el área
                            </button>
                            <button onClick={() => setQuitarArea(true)}
                                className="w-full h-9 rounded-lg text-[13px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 text-left px-2">
                                Quitar el área
                            </button>
                        </div>
                    </aside>
                </div>
            ) : area.tables.length === 0 ? (
                <div className="py-16 text-center px-6">
                    <div className="text-[15px] font-semibold text-content dark:text-white">{area.name} no tiene mesas</div>
                    <div className="text-[13px] text-content-subtle mt-1">
                        {puedeEditar ? "Entra en Editar plano para agregarlas." : "Un administrador tiene que agregarlas."}
                    </div>
                    {puedeEditar && <Button className="mt-4 hidden lg:inline-flex" onClick={empezarEdicion}>Editar plano</Button>}
                </div>
            ) : (
                <div className="flex-1 min-h-0 flex flex-col gap-2 py-1">
                    <div className="text-[12px] text-content-subtle tabular-nums">
                        {ocupadas === 0 ? "Todas las mesas libres" : `${ocupadas} de ${area.tables.length} ${area.tables.length === 1 ? "mesa ocupada" : "mesas ocupadas"}`}
                    </div>
                    <div className="hidden sm:block flex-1 min-h-0">
                        <TablePlan tables={area.tables} cuentasPorMesa={cuentasPorMesa} fmtTotal={fmtTotal} onTap={tocarMesa} />
                    </div>
                    <div className="sm:hidden pb-3">
                        <TableGrid tables={area.tables} cuentasPorMesa={cuentasPorMesa} fmtTotal={fmtTotal} onTap={tocarMesa} />
                    </div>
                </div>
            )}

            <DetalleMesa mesa={abierta} sym={sym} onClose={() => setAbierta(null)}
                warehouseId={almacen} notify={notify} puedeAtender={puedeServir || can("sales.create")} onCambio={cargarCuentas} />

            {atendiendo && (
                <WaiterOrder table={atendiendo} warehouseId={almacen} sym={sym} notify={notify}
                    onClose={(envio) => { setAtendiendo(null); if (envio) cargarCuentas(); }} />
            )}

            <Modal open={!!areaModal} onClose={() => setAreaModal(null)} title={areaModal?.id ? "Renombrar área" : "Nueva área"} width={420}>
                <div className="space-y-4">
                    <label className="block space-y-1">
                        <span className={LABEL}>Nombre</span>
                        <input className={INPUT} data-autofocus value={areaModal?.name || ""} maxLength={60} autoComplete="off"
                            placeholder="Salón, Terraza, Barra…"
                            onChange={e => setAreaModal(m => ({ ...m, name: e.target.value }))}
                            onKeyDown={e => { if (e.key === "Enter") guardarArea(); }} />
                    </label>
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                        <button onClick={() => setAreaModal(null)} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                        <Button className="h-12 sm:h-10 px-5" onClick={guardarArea}>{areaModal?.id ? "Guardar" : "Crear área"}</Button>
                    </div>
                </div>
            </Modal>

            <ConfirmModal isOpen={quitarArea} title={`Quitar ${area?.name || "el área"}`}
                message="El área y sus mesas dejan de aparecer en el mapa. Las ventas ya cobradas conservan su mesa."
                confirmText="Quitar área" onConfirm={borrarArea} onCancel={() => setQuitarArea(false)} />
        </Page>
    );
}

// Detalle de una mesa desde el mapa: sus cuentas abiertas. La caja también la cambia de mesa, la
// divide, la junta o marca que pidieron la cuenta; cobrar es en Venta (POS) → Mesa.
function DetalleMesa({ mesa, sym, onClose, warehouseId, notify, puedeAtender, onCambio }) {
    const ahora = Date.now();
    const [cuentas, setCuentas] = useState(null);
    const cargar = useCallback(() => {
        if (!mesa) { setCuentas(null); return; }
        api.tables.accounts(mesa.id).then(r => setCuentas(r.data?.accounts || [])).catch(() => setCuentas([]));
    }, [mesa]);
    useEffect(() => { cargar(); }, [cargar]);
    const cambio = () => { cargar(); onCambio?.(); };
    return (
        <Modal open={!!mesa} onClose={onClose} title={mesa ? mesa.name : ""} width={460}>
            {mesa && !cuentas ? (
                <div className="py-8 flex justify-center"><Spinner /></div>
            ) : mesa && (cuentas.length === 0 ? (
                <div className="py-6 text-center">
                    <div className="text-[14px] font-semibold text-content dark:text-white">Mesa libre</div>
                    <div className="text-[13px] text-content-subtle mt-1">{mesa.seats} {mesa.seats === 1 ? "puesto" : "puestos"}. Se abre desde la caja al pausar una venta en esta mesa.</div>
                </div>
            ) : (
                <div className="space-y-3">
                    {cuentas.map(c => (
                        <div key={c.id} className="rounded-2xl border border-border/60 dark:border-white/[0.06] p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[14px] font-semibold text-content dark:text-white truncate">
                                            {toNameCase(c.customer_name || c.web_customer_name) || "Cliente general"}
                                        </span>
                                        <KitchenMark status={c.kitchen_status} />
                                    </div>
                                    <div className="text-[12px] text-content-subtle tabular-nums">
                                        Abierta {fmtTime(c.created_at)} · hace {minutosDesde(c.created_at, ahora)} min
                                        {(c.waiter_name || c.employee_name) ? ` · ${toNameCase(c.waiter_name || c.employee_name)}` : ""}
                                    </div>
                                </div>
                                <div className="text-[18px] font-bold tracking-tight text-content dark:text-white tabular-nums whitespace-nowrap">
                                    {fmtMoney(c.total, sym)}
                                </div>
                            </div>
                            <ul className="mt-3 divide-y divide-border/60 dark:divide-white/[0.06] border-t border-border/60 dark:border-white/[0.06]">
                                {(c.items || []).map(i => (
                                    <li key={i.id} className="py-1.5 flex items-baseline gap-2 text-[13px]">
                                        <span className="font-semibold text-content dark:text-white tabular-nums w-6 text-right shrink-0">{parseFloat(i.quantity).toLocaleString("es-VE")}</span>
                                        <span className="flex-1 min-w-0 text-content dark:text-white truncate">{i.name}</span>
                                        <span className="text-content-subtle tabular-nums whitespace-nowrap">{fmtMoney(i.subtotal ?? i.price * i.quantity, sym)}</span>
                                    </li>
                                ))}
                            </ul>
                            {puedeAtender && (
                                <div className="mt-3">
                                    <CuentaAcciones table={mesa} cuenta={c} cuentas={cuentas} warehouseId={warehouseId} sym={sym} notify={notify} onChanged={cambio} />
                                </div>
                            )}
                        </div>
                    ))}
                    <p className="text-[12px] text-content-subtle">Para cobrarla, ábrela en Venta (POS) desde el botón Mesa.</p>
                </div>
            ))}
        </Modal>
    );
}
