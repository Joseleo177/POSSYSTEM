import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import Segmented from "../ui/Segmented";
import CustomSelect from "../ui/CustomSelect";
import RegaloFila from "./RegaloFila";

const fmtCant = (n) => (Number(n) || 0).toLocaleString("es-VE", { maximumFractionDigits: 3 });

/**
 * Regalos de la ruta. Lo principal es "Por entregar": lo que el cobrador tiene que llevar en la
 * próxima vuelta, con el total por regalo arriba para cargar el carro de una vez.
 */
export default function RegalosView({ version = 0 }) {
    const { notify } = useApp();
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
        api.cobranza.regalos({ status: estado, ...(sector ? { sector_id: sector } : {}) })
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

    return (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <div className="max-w-3xl p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <Segmented value={estado} onChange={setEstado} className="self-start"
                        options={[{ key: "por_entregar", label: "Por entregar" }, { key: "entregado", label: "Entregados" }, { key: "anulado", label: "Anulados" }]} />
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

                {lista === null ? (
                    <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-surface-2 dark:bg-white/[0.04] animate-pulse" />)}</div>
                ) : lista.length === 0 ? (
                    <div className="py-12 text-center">
                        <p className="text-[14px] font-semibold text-content dark:text-white">
                            {estado === "por_entregar" ? "No hay regalos pendientes" : estado === "entregado" ? "Todavía no se ha entregado ninguno" : "No hay regalos anulados"}
                        </p>
                        <p className="mt-1 text-[12px] text-content-subtle">Los regalos se dan desde la ficha del cliente, en la Ruta.</p>
                    </div>
                ) : (
                    <div className="rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
                        {lista.map(r => <RegaloFila key={r.id} r={r} conCliente onChanged={() => setTick(t => t + 1)} />)}
                    </div>
                )}
            </div>
        </div>
    );
}
