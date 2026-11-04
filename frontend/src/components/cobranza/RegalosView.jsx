import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import Segmented from "../ui/Segmented";
import CustomSelect from "../ui/CustomSelect";
import RegaloFila from "./RegaloFila";
import { printRegalosParaLlevar, printRegalosQuedan, printRegalosEntregados } from "../../helpers/printRegalos";

const fmtCant = (n) => (Number(n) || 0).toLocaleString("es-VE", { maximumFractionDigits: 3 });
const VACIO = {
    por_entregar: ["No hay regalos para llevar", "Los regalos se dan desde la ficha del cliente, en la Ruta."],
    quedan: ["No hay regalos en esta sucursal", "Se crean en Catálogo y se cargan en Inventario."],
    entregado: ["Todavía no se ha entregado ninguno", "Los regalos se dan desde la ficha del cliente, en la Ruta."],
    anulado: ["No hay regalos anulados", "Aquí aparecen los que se anulan, con su motivo."],
};
const IMPRIMIR = { por_entregar: "Sacar lista para llevar", quedan: "Sacar lista de lo que queda", entregado: "Sacar lista de entregados" };

/**
 * Regalos de la ruta. Dos listas que se pueden sacar en papel o PDF:
 *   Para llevar  lo que el cobrador tiene que cargar en la próxima vuelta y a quién le toca
 *   Quedan       de cada regalo, cuánto hay, cuánto está apartado y cuánto está libre
 * Más el historial de entregados y anulados.
 *
 * En escritorio la lista va a la izquierda y el resumen con "Sacar lista" queda fijo a la
 * derecha, como la ficha en la Ruta; en el teléfono el resumen va arriba de la lista.
 */
export default function RegalosView({ version = 0 }) {
    const { notify, companyInfo } = useApp();
    const [estado, setEstado] = useState("por_entregar");
    const [sector, setSector] = useState("");
    const [sectores, setSectores] = useState([]);
    const [lista, setLista] = useState(null);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        api.cobranza.sectores().then(r => setSectores(r.data || [])).catch(() => setSectores([]));
    }, [version]);

    useEffect(() => {
        let vivo = true;
        setLista(null);
        const filtro = sector ? { sector_id: sector } : {};
        const pedir = estado === "quedan" ? api.cobranza.regalosExistencia(filtro) : api.cobranza.regalos({ status: estado, ...filtro });
        pedir
            .then(r => { if (vivo) setLista(r.data || []); })
            .catch(e => { if (vivo) { notify(e.message, "err"); setLista([]); } });
        return () => { vivo = false; };
    }, [estado, sector, tick, version]);   // eslint-disable-line react-hooks/exhaustive-deps

    // Para cargar el carro: cuánto de cada regalo hay que llevar.
    const porProducto = useMemo(() => {
        if (estado !== "por_entregar" || !lista?.length) return [];
        const m = new Map();
        for (const r of lista) m.set(r.product_name, (m.get(r.product_name) || 0) + Number(r.qty || 0));
        return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
    }, [lista, estado]);

    const nombreSector = sectores.find(s => String(s.id) === sector)?.name || "";
    const imprimir = () => {
        const op = { sector: nombreSector, companyInfo };
        if (estado === "por_entregar") printRegalosParaLlevar(lista, op);
        else if (estado === "quedan") printRegalosQuedan(lista, op);
        else if (estado === "entregado") printRegalosEntregados(lista, op);
    };
    const imprimible = IMPRIMIR[estado] && lista?.length > 0;

    return (
        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col">
            <div className="shrink-0 px-4 pt-4 pb-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="max-w-full overflow-x-auto scrollbar-hide">
                    <Segmented value={estado} onChange={setEstado}
                        options={[
                            { key: "por_entregar", label: "Para llevar" },
                            { key: "quedan", label: "Quedan" },
                            { key: "entregado", label: "Entregados" },
                            { key: "anulado", label: "Anulados" },
                        ]} />
                </div>
                {sectores.length > 1 && (
                    <CustomSelect value={sector} onChange={setSector} className="sm:w-56 sm:ml-auto"
                        options={[{ value: "", label: "Todos mis sectores" }, ...sectores.map(s => ({ value: String(s.id), label: s.name }))]} />
                )}
            </div>

            <div className="px-4 pb-6 lg:pb-4 flex flex-col gap-4 lg:flex-1 lg:min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                {/* Resumen: arriba en el teléfono, columna fija a la derecha en escritorio. */}
                <aside className="lg:order-2 lg:max-h-full lg:overflow-y-auto custom-scrollbar">
                    <Resumen estado={estado} lista={lista} porProducto={porProducto} imprimible={imprimible} onImprimir={imprimir} />
                </aside>

                <div className="lg:order-1 lg:h-full lg:min-h-0 lg:overflow-y-auto custom-scrollbar">
                    {lista === null ? (
                        <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-surface-2 dark:bg-white/[0.04] animate-pulse" />)}</div>
                    ) : lista.length === 0 ? (
                        <div className="py-12 text-center">
                            <p className="text-[14px] font-semibold text-content dark:text-white">{VACIO[estado][0]}</p>
                            <p className="mt-1 text-[12px] text-content-subtle">{VACIO[estado][1]}</p>
                        </div>
                    ) : estado === "quedan" ? (
                        <ListaQuedan filas={lista} />
                    ) : (
                        <div className="rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
                            {lista.map(r => <RegaloFila key={r.id} r={r} conCliente onChanged={() => setTick(t => t + 1)} />)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

const BotonImprimir = ({ texto, onClick }) => (
    <button type="button" onClick={onClick}
        className="btn-outline mt-3 h-12 sm:h-10 w-full px-4 rounded-lg text-[13px] font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.99]">
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
        {texto}
    </button>
);

// Lo que cada pestaña necesita tener a la vista mientras se recorre la lista.
function Resumen({ estado, lista, porProducto, imprimible, onImprimir }) {
    const tarjeta = "rounded-2xl border border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.04] shadow-card dark:shadow-none p-4";
    if (lista === null) return <div className="h-28 rounded-2xl bg-surface-2 dark:bg-white/[0.04] animate-pulse" />;
    if (!lista.length) return null;

    if (estado === "por_entregar") {
        const unidades = porProducto.reduce((s, [, n]) => s + n, 0);
        return (
            <div className={tarjeta}>
                <p className="text-[14px] font-semibold text-content dark:text-white">Para llevar en la ruta</p>
                <p className="text-[12px] text-content-subtle">{fmtCant(unidades)} {unidades === 1 ? "unidad" : "unidades"} · {lista.length} {lista.length === 1 ? "entrega" : "entregas"}</p>
                <div className="mt-3 divide-y divide-border/60 dark:divide-white/[0.06]">
                    {porProducto.map(([nombre, n]) => (
                        <div key={nombre} className="py-2 flex items-baseline justify-between gap-3">
                            <span className="min-w-0 text-[13px] text-content dark:text-white truncate">{nombre}</span>
                            <span className="shrink-0 text-[15px] font-bold tabular-nums text-content dark:text-white">{fmtCant(n)}</span>
                        </div>
                    ))}
                </div>
                {imprimible && <BotonImprimir texto={IMPRIMIR[estado]} onClick={onImprimir} />}
            </div>
        );
    }

    if (estado === "quedan") {
        const suma = (k) => lista.reduce((s, f) => s + Number(f[k] || 0), 0);
        const agotados = lista.filter(f => f.libre <= 0).length;
        const dato = (k, v, tono = "") => (
            <div className="py-2 flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-content-subtle">{k}</span>
                <span className={`text-[15px] font-bold tabular-nums ${tono || "text-content dark:text-white"}`}>{v}</span>
            </div>
        );
        return (
            <div className={tarjeta}>
                <p className="text-[14px] font-semibold text-content dark:text-white">Regalos en la sucursal</p>
                <p className="text-[12px] text-content-subtle">{lista.length} {lista.length === 1 ? "regalo" : "regalos"} distintos</p>
                <div className="mt-2 divide-y divide-border/60 dark:divide-white/[0.06]">
                    {dato("Hay", fmtCant(suma("stock")))}
                    {dato("Apartados", fmtCant(suma("apartado")))}
                    {dato("Libres", fmtCant(suma("libre")))}
                    {agotados > 0 && dato("Agotados", agotados, "text-red-600 dark:text-red-400")}
                </div>
                {imprimible && <BotonImprimir texto={IMPRIMIR[estado]} onClick={onImprimir} />}
            </div>
        );
    }

    return (
        <div className={tarjeta}>
            <p className="text-[14px] font-semibold text-content dark:text-white">
                {lista.length} {estado === "entregado" ? (lista.length === 1 ? "regalo entregado" : "regalos entregados") : (lista.length === 1 ? "regalo anulado" : "regalos anulados")}
            </p>
            <p className="text-[12px] text-content-subtle">{estado === "entregado" ? "Los más recientes primero." : "Cada uno con su motivo."}</p>
            {imprimible && <BotonImprimir texto={IMPRIMIR[estado]} onClick={onImprimir} />}
        </div>
    );
}

// De cada regalo: hay, apartado y libre. En escritorio son columnas alineadas; en el teléfono,
// lo libre en grande a la derecha (es lo que se puede prometer) y el resto debajo del nombre.
function ListaQuedan({ filas }) {
    const sucursales = new Set(filas.map(f => f.warehouse_id)).size;
    const categorias = new Set(filas.map(f => f.category_id)).size;
    const grupos = [];
    for (const f of filas) {
        const clave = `${f.warehouse_id}-${f.category_id}`;
        let g = grupos[grupos.length - 1];
        if (!g || g.clave !== clave) { g = { clave, sucursal: f.warehouse_name, categoria: f.category_name, items: [] }; grupos.push(g); }
        g.items.push(f);
    }
    const cols = "sm:grid sm:grid-cols-[minmax(0,1fr)_88px_88px_96px] sm:items-center sm:gap-3";
    return (
        <div className="space-y-4">
            {grupos.map(g => (
                <section key={g.clave}>
                    {(sucursales > 1 || categorias > 1) && (
                        <p className="mb-1.5 text-[14px] font-semibold text-content dark:text-white">
                            {g.categoria}{sucursales > 1 ? <span className="font-medium text-content-subtle"> · {g.sucursal}</span> : null}
                        </p>
                    )}
                    <div className="rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
                        <div className={`hidden ${cols} px-3.5 py-2 text-[12px] text-content-subtle bg-surface-2/50 dark:bg-white/[0.02]`}>
                            <span>Regalo</span><span className="text-right">Hay</span><span className="text-right">Apartado</span><span className="text-right">Libre</span>
                        </div>
                        {g.items.map(f => {
                            const sin = f.libre <= 0;
                            const libreTxt = sin ? (f.libre < 0 ? `Faltan ${fmtCant(-f.libre)}` : "Agotado") : fmtCant(f.libre);
                            return (
                                <div key={`${f.warehouse_id}-${f.product_id}`}
                                    className={`relative px-3.5 py-2.5 flex items-center justify-between gap-3 ${cols} ${sin ? "pl-4" : ""}`}>
                                    {sin && <span aria-hidden="true" className="absolute left-0 inset-y-0 w-[3px] bg-red-500" />}
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-semibold text-content dark:text-white truncate">{f.name}</p>
                                        <p className="sm:hidden text-[12px] text-content-subtle tabular-nums">
                                            Hay {fmtCant(f.stock)}{f.apartado > 0 ? ` · ${fmtCant(f.apartado)} ${f.apartado === 1 ? "apartado" : "apartados"}` : ""}
                                        </p>
                                    </div>
                                    <span className="hidden sm:block text-right text-[13px] tabular-nums text-content dark:text-white/85">{fmtCant(f.stock)}</span>
                                    <span className="hidden sm:block text-right text-[13px] tabular-nums text-content-subtle">{f.apartado > 0 ? fmtCant(f.apartado) : "—"}</span>
                                    <span className={`shrink-0 text-right tabular-nums ${sin ? "text-[13px] font-semibold text-red-600 dark:text-red-400" : "text-[16px] font-bold text-content dark:text-white"}`}>
                                        {libreTxt}{!sin && <span className="sm:hidden ml-1 text-[12px] font-normal text-content-subtle">{f.libre === 1 ? "libre" : "libres"}</span>}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </section>
            ))}
        </div>
    );
}
