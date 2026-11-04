import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import Check from "../ui/Check";

/**
 * De qué categorías salen los regalos, una o varias. Son productos normales (se compran y se
 * cargan en Inventario); las categorías solo dicen cuáles se ofrecen al dar un regalo.
 */
export default function CategoriaRegalos() {
    const { notify } = useApp();
    const [cfg, setCfg] = useState(null);
    const [ocupado, setOcupado] = useState(false);

    useEffect(() => {
        api.cobranza.config().then(r => setCfg(r.data)).catch(() => setCfg({ categorias: [], categorias_regalos: [] }));
    }, []);

    const marcadas = new Set((cfg?.categorias_regalos || []).map(c => c.id));

    const alternar = async (c) => {
        if (ocupado) return;
        const ids = marcadas.has(c.id) ? [...marcadas].filter(id => id !== c.id) : [...marcadas, c.id];
        setOcupado(true);
        try {
            const r = await api.cobranza.guardarConfig({ regalos_category_ids: ids });
            setCfg(r.data);
            notify(marcadas.has(c.id) ? `${c.name} ya no ofrece regalos` : `Los regalos también salen de ${c.name}`);
        } catch (e) { notify(e.message, "err"); }
        finally { setOcupado(false); }
    };

    const categorias = cfg?.categorias || [];

    return (
        <section className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.04] shadow-card dark:shadow-none p-4">
            <p className="text-[14px] font-semibold text-content dark:text-white">Regalos</p>
            <p className="text-[12px] text-content-subtle">Las categorías de las que salen. Sus productos se crean en Catálogo y se cargan en Inventario.</p>

            {cfg === null ? (
                <div className="mt-3 h-11 rounded-lg bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
            ) : categorias.length === 0 ? (
                <p className="mt-3 text-[13px] text-content-subtle">Todavía no hay categorías. Se crean en Catálogo.</p>
            ) : (
                <>
                    {marcadas.size === 0 && <p className="mt-3 text-[13px] font-medium text-warning">Sin categorías: los cobradores no pueden dar regalos.</p>}
                    <div className="mt-3 rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06] lg:max-h-52 lg:overflow-y-auto custom-scrollbar">
                        {categorias.map(c => (
                            <div key={c.id} role="button" tabIndex={0} aria-disabled={ocupado} onClick={() => alternar(c)}
                                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(c); } }}
                                className="px-3.5 py-3 flex items-center gap-3 cursor-pointer hover:bg-surface-2/60 dark:hover:bg-white/[0.03]">
                                <Check checked={marcadas.has(c.id)} disabled={ocupado} onChange={() => alternar(c)} title={c.name} />
                                <span className="min-w-0 flex-1 text-[13px] font-medium text-content dark:text-white truncate">{c.name}</span>
                                <span className="shrink-0 text-[12px] text-content-subtle tabular-nums">{c.productos} {c.productos === 1 ? "producto" : "productos"}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </section>
    );
}
