import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { useDebounce } from "../../hooks/useDebounce";
import Money from "../ui/Money";
import { fmtBaseCon } from "./shared";

/**
 * Qué deja el cobrador ("la bolsa"). Uno solo por empresa: es lo que el cliente pidió (un único
 * producto); si mañana son varios, este es el lugar a ampliar.
 */
export default function ProductoCobranza() {
    const { notify, baseCurrency } = useApp();
    const fmtBase = fmtBaseCon(baseCurrency);
    const [producto, setProducto] = useState(undefined);
    const [cambiando, setCambiando] = useState(false);
    const [search, setSearch] = useState("");
    const term = useDebounce(search, 300);
    const [opciones, setOpciones] = useState([]);
    const [guardando, setGuardando] = useState(null);

    useEffect(() => {
        api.cobranza.config().then(r => setProducto(r.data?.product || null)).catch(() => setProducto(null));
    }, []);

    useEffect(() => {
        if (!cambiando || term.trim().length < 2) { setOpciones([]); return; }
        let vivo = true;
        api.cobranza.productos(term).then(r => { if (vivo) setOpciones(r.data || []); }).catch(() => {});
        return () => { vivo = false; };
    }, [term, cambiando]);

    const elegir = async (p) => {
        setGuardando(p.id);
        try {
            const r = await api.cobranza.guardarConfig({ product_id: p.id });
            setProducto(r.data?.product || p);
            setCambiando(false); setSearch("");
            notify(`Los cobradores dejan: ${p.name}`);
        } catch (e) { notify(e.message, "err"); }
        finally { setGuardando(null); }
    };

    const mostrarBuscador = cambiando || producto === null;

    return (
        <section className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.04] shadow-card dark:shadow-none p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[12px] text-content-subtle">Lo que deja el cobrador</p>
                    {producto === undefined ? (
                        <div className="mt-1 h-5 w-40 rounded bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
                    ) : producto ? (
                        <p className="text-[15px] font-semibold text-content dark:text-white truncate">
                            {producto.name} <Money value={fmtBase(producto.price)} className="ml-1 text-[13px] font-medium text-content-subtle" />
                        </p>
                    ) : (
                        <p className="text-[14px] font-semibold text-warning">Sin elegir: los cobradores no pueden dejar mercancía</p>
                    )}
                </div>
                {producto && !cambiando && (
                    <button type="button" onClick={() => setCambiando(true)} className="shrink-0 h-9 px-3 rounded-lg text-[13px] font-medium text-content-muted dark:text-white/60 hover:bg-surface-2 dark:hover:bg-white/[0.05]">
                        Cambiar
                    </button>
                )}
            </div>

            {mostrarBuscador && producto !== undefined && (
                <div className="mt-3">
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar el producto (ej. bolsa)"
                        autoComplete="off" data-autofocus
                        className="h-10 w-full px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                    {opciones.length > 0 && (
                        <div className="mt-2 rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06]">
                            {opciones.map(p => (
                                <button key={p.id} type="button" onClick={() => elegir(p)} disabled={!!guardando}
                                    className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-surface-2/60 dark:hover:bg-white/[0.03] disabled:opacity-60">
                                    <span className="text-[13px] font-medium text-content dark:text-white truncate">{p.name}</span>
                                    <Money value={fmtBase(p.price)} className="shrink-0 text-[13px] text-content-subtle" />
                                </button>
                            ))}
                        </div>
                    )}
                    {cambiando && (
                        <button type="button" onClick={() => { setCambiando(false); setSearch(""); }} className="mt-2 text-[12px] text-content-subtle hover:text-content dark:hover:text-white">Cancelar</button>
                    )}
                </div>
            )}
        </section>
    );
}
