import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";

// Lo que se acabó, desde la cocina: la cocina es la primera en saber que no quedan tostones.
// Marcar una opción la apaga al instante en la caja, en la tablet del mesonero y en el catálogo
// (la ven como "Agotado" y el servidor la rechaza). Lo que tiene inventario se agota solo; esto
// es para lo que no se cuenta.
//
// Una opción que se repite en varios grupos ("Tostones" en Contorno y en Dos contornos) se
// muestra una sola vez y se marca en todos: el servidor la agota por nombre.
const mismo = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function marcarPorNombre(grupos, nombre, valor) {
    return grupos.map(g => ({ ...g, options: g.options.map(x => (mismo(x.name, nombre) ? { ...x, sold_out: valor } : x)) }));
}

export default function AgotadosModal({ notify, onClose }) {
    const [grupos, setGrupos] = useState(null);

    useEffect(() => {
        api.addons.list()
            .then(r => setGrupos(r.data || []))
            .catch(e => { notify(e.message || "No se pudieron cargar los adicionales", "err"); setGrupos([]); });
    }, [notify]);

    const alternar = async (o) => {
        const valor = !o.sold_out;
        setGrupos(gs => marcarPorNombre(gs, o.name, valor));
        try {
            await api.addons.setSoldOut(o.id, valor);
        } catch (e) {
            setGrupos(gs => marcarPorNombre(gs, o.name, !valor));
            notify(e.message || "No se pudo cambiar", "err");
        }
    };

    // Cada nombre una sola vez, en el primer grupo donde aparece.
    const vistos = new Set();
    const secciones = (grupos || []).map(g => ({
        ...g,
        options: g.options.filter(o => {
            const k = o.name.trim().toLowerCase();
            if (vistos.has(k)) return false;
            vistos.add(k);
            return true;
        }),
    })).filter(g => g.options.length);
    const total = secciones.reduce((s, g) => s + g.options.filter(o => o.sold_out).length, 0);

    return (
        <Modal open onClose={onClose} title="Agotados" width={560}>
            {!grupos ? (
                <div className="py-10 flex justify-center"><Spinner /></div>
            ) : secciones.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-content-subtle">No hay adicionales configurados.</p>
            ) : (
                <div className="space-y-5">
                    <p className="text-[13px] text-content-subtle">
                        Toca lo que se acabó. Deja de ofrecerse enseguida en la caja, en las mesas y en el catálogo.
                        {total > 0 && <span className="text-content dark:text-white font-medium"> {total} agotado{total === 1 ? "" : "s"} ahora.</span>}
                    </p>
                    {secciones.map(g => (
                        <section key={g.id}>
                            <h4 className="text-[14px] font-semibold text-content dark:text-white mb-2">{g.name}</h4>
                            <div className="flex flex-wrap gap-2">
                                {g.options.map(o => (
                                    <button key={o.id} type="button" onClick={() => alternar(o)}
                                        className={`h-11 px-4 rounded-xl border text-[14px] flex items-center gap-2 transition-colors active:scale-[0.98] ${o.sold_out
                                            ? "border-red-500/40 bg-red-500/[0.07] text-content-subtle"
                                            : "border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-content dark:text-white"}`}>
                                        <span className={o.sold_out ? "line-through" : ""}>{o.name}</span>
                                        {o.sold_out && <span className="text-[12px] font-semibold text-red-600 dark:text-red-400">Agotado</span>}
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </Modal>
    );
}
