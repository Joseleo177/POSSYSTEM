import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { useDebounce } from "../../hooks/useDebounce";
import Money from "../ui/Money";
import { fmtBaseCon } from "./shared";

/**
 * Lo que el cobrador puede dejar a crédito: la bolsa y lo que el negocio venda mañana. Quitar un
 * producto de esta lista no toca lo ya dejado: sus facturas siguen por cobrar.
 */
export default function ProductoCobranza() {
    const { notify, baseCurrency } = useApp();
    const fmtBase = fmtBaseCon(baseCurrency);
    const [productos, setProductos] = useState(null);
    const [agregando, setAgregando] = useState(false);
    const [search, setSearch] = useState("");
    const term = useDebounce(search, 300);
    const [opciones, setOpciones] = useState([]);
    const [ocupado, setOcupado] = useState(false);

    useEffect(() => {
        api.cobranza.config().then(r => setProductos(r.data?.productos || [])).catch(() => setProductos([]));
    }, []);

    useEffect(() => {
        if (!agregando || term.trim().length < 2) { setOpciones([]); return; }
        let vivo = true;
        api.cobranza.productos(term).then(r => { if (vivo) setOpciones(r.data || []); }).catch(() => {});
        return () => { vivo = false; };
    }, [term, agregando]);

    const guardar = async (ids, aviso) => {
        setOcupado(true);
        try {
            const r = await api.cobranza.guardarConfig({ product_ids: ids });
            setProductos(r.data?.productos || []);
            notify(aviso);
            return true;
        } catch (e) { notify(e.message, "err"); return false; }
        finally { setOcupado(false); }
    };

    const ids = (productos || []).map(p => p.id);
    const agregar = async (p) => {
        if (await guardar([...ids, p.id], `Ya se puede dejar: ${p.name}`)) { setAgregando(false); setSearch(""); }
    };
    const quitar = (p) => guardar(ids.filter(id => id !== p.id), `${p.name} salió de la lista`);

    // Lo que ya está en la lista no se vuelve a ofrecer.
    const disponibles = opciones.filter(o => !ids.includes(o.id));
    const buscando = agregando || productos?.length === 0;

    return (
        <section className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.04] shadow-card dark:shadow-none p-4">
            <p className="text-[14px] font-semibold text-content dark:text-white">Lo que deja el cobrador</p>
            <p className="text-[12px] text-content-subtle">Los productos que puede dejar a crédito.</p>

            {productos === null ? (
                <div className="mt-3 h-11 rounded-lg bg-surface-2 dark:bg-white/[0.05] animate-pulse" />
            ) : productos.length === 0 ? (
                <p className="mt-3 text-[13px] font-medium text-warning">Sin productos: los cobradores no pueden dejar mercancía.</p>
            ) : (
                <div className="mt-3 rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06]">
                    {productos.map(p => (
                        <div key={p.id} className="pl-3.5 pr-1.5 py-1.5 flex items-center justify-between gap-3">
                            <span className="min-w-0 text-[13px] font-medium text-content dark:text-white truncate">{p.name}</span>
                            <span className="shrink-0 flex items-center gap-1">
                                <Money value={fmtBase(p.price)} className="text-[13px] text-content-subtle" />
                                <button type="button" onClick={() => quitar(p)} disabled={ocupado} aria-label={`Quitar ${p.name}`} title="Quitar de la lista"
                                    className="w-9 h-9 rounded-lg flex items-center justify-center text-content-subtle hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/[0.06] disabled:opacity-50">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {productos !== null && (buscando ? (
                <div className="mt-3">
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar el producto (ej. bolsa)" autoComplete="off"
                        className="h-10 w-full px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                    {disponibles.length > 0 && (
                        <div className="mt-2 rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06]">
                            {disponibles.map(p => (
                                <button key={p.id} type="button" onClick={() => agregar(p)} disabled={ocupado}
                                    className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-surface-2/60 dark:hover:bg-white/[0.03] disabled:opacity-60">
                                    <span className="text-[13px] font-medium text-content dark:text-white truncate">{p.name}</span>
                                    <Money value={fmtBase(p.price)} className="shrink-0 text-[13px] text-content-subtle" />
                                </button>
                            ))}
                        </div>
                    )}
                    {term.trim().length >= 2 && disponibles.length === 0 && (
                        <p className="mt-2 text-[12px] text-content-subtle">No hay otro producto a la venta con ese nombre. Se crean en Catálogo.</p>
                    )}
                    {agregando && (
                        <button type="button" onClick={() => { setAgregando(false); setSearch(""); }} className="mt-2 text-[12px] text-content-subtle hover:text-content dark:hover:text-white">Cancelar</button>
                    )}
                </div>
            ) : (
                <button type="button" onClick={() => setAgregando(true)}
                    className="mt-2 h-12 sm:h-10 w-full rounded-lg border border-dashed border-border dark:border-white/15 text-[13px] font-medium text-content-muted dark:text-white/70 inline-flex items-center justify-center gap-2 hover:bg-surface-2/60 dark:hover:bg-white/[0.03]">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 5v14M5 12h14" /></svg>
                    Agregar otro producto
                </button>
            ))}
        </section>
    );
}
