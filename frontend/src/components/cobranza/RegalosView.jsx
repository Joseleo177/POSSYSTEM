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

/**
 * Regalos de la ruta. Dos listas que se pueden sacar en papel o PDF:
 *   Para llevar  lo que el cobrador tiene que cargar en la próxima vuelta y a quién le toca
 *   Quedan       de cada regalo, cuánto hay, cuánto está apartado y cuánto está libre
 * Más el historial de entregados y anulados.
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
        return [...m.entries()].sort((a, b) => b[1] - a[1]);
    }, [lista, estado]);

    const nombreSector = sectores.find(s => String(s.id) === sector)?.name || "";
    const imprimir = () => {
        const op = { sector: nombreSector, companyInfo };
        if (estado === "por_entregar") printRegalosParaLlevar(lista, op);
        else if (estado === "quedan") printRegalosQuedan(lista, op);
        else if (estado === "entregado") printRegalosEntregados(lista, op);
    };
    const imprimible = estado !== "anulado" && lista?.length > 0;
    const etiquetaImprimir = estado === "por_entregar" ? "Sacar lista para llevar" : estado === "quedan" ? "Sacar lista de lo que queda" : "Sacar lista de entregados";

    return (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <div className="max-w-3xl p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
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

                {porProducto.length > 0 && (
                    <div className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.04] shadow-card dark:shadow-none p-4">
                        <p className="text-[12px] text-content-subtle">Para llevar en la ruta</p>
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
                            {porProducto.map(([nombre, n]) => (
                                <p key={nombre} className="text-[14px] text-content dark:text-white">
                                    <span className="font-bold tabular-nums">{fmtCant(n)}</span> × {nombre}
                                </p>
                            ))}
                        </div>
                    </div>
                )}

                {imprimible && (
                    <button type="button" onClick={imprimir}
                        className="btn-outline h-12 sm:h-10 w-full sm:w-auto px-4 rounded-lg text-[13px] font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.99]">
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        {etiquetaImprimir}
                    </button>
                )}

                {lista === null ? (
                    <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-surface-2 dark:bg-white/[0.04] animate-pulse" />)}</div>
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
    );
}

// De cada regalo: lo libre en grande (es lo que se puede prometer) y de dónde sale esa cifra.
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
    return (
        <div className="space-y-3">
            {grupos.map(g => (
                <section key={g.clave}>
                    {(sucursales > 1 || categorias > 1) && (
                        <p className="mb-1.5 text-[14px] font-semibold text-content dark:text-white">
                            {g.categoria}{sucursales > 1 ? <span className="font-medium text-content-subtle"> · {g.sucursal}</span> : null}
                        </p>
                    )}
                    <div className="rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
                        {g.items.map(f => {
                            const sin = f.libre <= 0;
                            return (
                                <div key={`${f.warehouse_id}-${f.product_id}`} className={`relative px-3.5 py-3 flex items-center justify-between gap-3 ${sin ? "pl-4" : ""}`}>
                                    {sin && <span aria-hidden="true" className="absolute left-0 inset-y-0 w-[3px] bg-red-500" />}
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-semibold text-content dark:text-white truncate">{f.name}</p>
                                        <p className="text-[12px] text-content-subtle tabular-nums">
                                            Hay {fmtCant(f.stock)}{f.apartado > 0 ? ` · ${fmtCant(f.apartado)} ${f.apartado === 1 ? "apartado" : "apartados"}` : ""}
                                        </p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        {sin ? (
                                            <p className="text-[13px] font-semibold text-red-600 dark:text-red-400">{f.libre < 0 ? `Faltan ${fmtCant(-f.libre)}` : "Agotado"}</p>
                                        ) : (
                                            <>
                                                <p className="text-[18px] font-bold tracking-tight tabular-nums text-content dark:text-white leading-tight">{fmtCant(f.libre)}</p>
                                                <p className="text-[12px] text-content-subtle">{f.libre === 1 ? "libre" : "libres"}</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            ))}
        </div>
    );
}
