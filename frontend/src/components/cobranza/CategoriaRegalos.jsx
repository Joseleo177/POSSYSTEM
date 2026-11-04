import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import CustomSelect from "../ui/CustomSelect";

/**
 * De qué categoría salen los regalos. Son productos normales (se compran y se cargan en
 * Inventario); la categoría solo dice cuáles se ofrecen al dar un regalo.
 */
export default function CategoriaRegalos() {
    const { notify } = useApp();
    const [cfg, setCfg] = useState(null);

    useEffect(() => {
        api.cobranza.config().then(r => setCfg(r.data)).catch(() => setCfg({ categorias: [] }));
    }, []);

    const elegir = async (v) => {
        try {
            const r = await api.cobranza.guardarConfig({ regalos_category_id: v ? parseInt(v) : null });
            setCfg(r.data);
            notify(v ? `Los regalos salen de ${r.data.categoria_regalos?.name}` : "Regalos desactivados");
        } catch (e) { notify(e.message, "err"); }
    };

    const actual = cfg?.categoria_regalos;
    const cat = (cfg?.categorias || []).find(c => c.id === actual?.id);

    return (
        <section className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.04] shadow-card dark:shadow-none p-4">
            <div className="flex flex-col gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-content-subtle">Regalos</p>
                    {cfg === null ? (
                        <div className="mt-1 h-5 w-40 rounded bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
                    ) : actual ? (
                        <p className="text-[15px] font-semibold text-content dark:text-white">
                            Categoría {actual.name}
                            <span className="ml-1.5 text-[12px] font-medium text-content-subtle">· {cat?.productos ?? 0} productos</span>
                        </p>
                    ) : (
                        <p className="text-[14px] font-semibold text-content dark:text-white">Sin regalos</p>
                    )}
                    <p className="text-[12px] text-content-subtle">Se crean en Catálogo y se cargan en Inventario como cualquier mercancía.</p>
                </div>
                {cfg && (
                    <CustomSelect value={actual ? String(actual.id) : ""} onChange={elegir} className="sm:max-w-xs"
                        options={[{ value: "", label: "Sin regalos" }, ...(cfg.categorias || []).map(c => ({ value: String(c.id), label: c.name }))]} />
                )}
            </div>
        </section>
    );
}
