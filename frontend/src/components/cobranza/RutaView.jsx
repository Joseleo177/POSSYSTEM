import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { useDebounce } from "../../hooks/useDebounce";
import CustomSelect from "../ui/CustomSelect";
import Money from "../ui/Money";
import { toNameCase } from "../../helpers";
import FichaCliente from "./FichaCliente";
import { fmtBaseCon, ultimoAbonoTexto, pideAtencion } from "./shared";

/**
 * Ruta del cobrador: los clientes de sus sectores con lo que deben, y la ficha del elegido.
 * En escritorio la ficha es una columna al lado; en el teléfono —que es donde se usa en la
 * calle— sube como hoja inferior y la lista se queda con toda la pantalla.
 */
export default function RutaView({ version = 0 }) {
    const { notify, baseCurrency } = useApp();
    const fmtBase = fmtBaseCon(baseCurrency);

    const [sectores, setSectores] = useState(null);
    const [sector, setSector] = useState("");
    const [search, setSearch] = useState("");
    const term = useDebounce(search, 300);
    const [clientes, setClientes] = useState(null);
    const [selId, setSelId] = useState(null);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        api.cobranza.sectores()
            .then(r => { setSectores(r.data || []); if ((r.data || []).length === 1) setSector(String(r.data[0].id)); })
            .catch(e => { notify(e.message, "err"); setSectores([]); });
    }, [version]);   // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (sectores === null) return;
        let vivo = true;
        api.cobranza.clientes({ ...(sector ? { sector_id: sector } : {}), ...(term.trim() ? { search: term.trim() } : {}) })
            .then(r => { if (vivo) setClientes(r.data || []); })
            .catch(e => { if (vivo) { notify(e.message, "err"); setClientes([]); } });
        return () => { vivo = false; };
    }, [sectores, sector, term, tick, version]);   // eslint-disable-line react-hooks/exhaustive-deps

    const recargar = useCallback(() => setTick(t => t + 1), []);

    const resumen = useMemo(() => {
        const lista = clientes || [];
        const deben = lista.filter(c => c.deuda > 0);
        return { total: lista.length, deben: deben.length, deuda: deben.reduce((s, c) => s + c.deuda, 0) };
    }, [clientes]);

    const opcionesSector = [
        { value: "", label: (sectores || []).length > 1 ? "Todos mis sectores" : "Mi sector" },
        ...(sectores || []).map(s => ({ value: String(s.id), label: s.name })),
    ];

    if (sectores && sectores.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-sm">
                    <div className="mx-auto w-12 h-12 rounded-2xl bg-surface-2 dark:bg-white/[0.05] flex items-center justify-center text-content-subtle">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 21s-6-5.3-6-10a6 6 0 1112 0c0 4.7-6 10-6 10zM12 13a2 2 0 100-4 2 2 0 000 4z" /></svg>
                    </div>
                    <p className="mt-3 text-[15px] font-semibold text-content dark:text-white">No tienes sectores asignados</p>
                    <p className="mt-1 text-[13px] text-content-subtle">Pide que te asignen uno en Cobranza → Sectores.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_440px]">
            {/* ── Lista ── */}
            <div className="flex flex-col min-h-0">
                <div className="shrink-0 px-4 pt-4 pb-3 flex flex-col sm:flex-row gap-2">
                    {(sectores || []).length > 1 && (
                        <CustomSelect value={sector} onChange={setSector} options={opcionesSector} className="sm:w-56" />
                    )}
                    <div className="relative flex-1">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.3-4.3M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" /></svg>
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente, cédula, teléfono o dirección"
                            autoComplete="off" inputMode="search"
                            className="h-10 w-full pl-9 pr-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                    </div>
                </div>

                {clientes && (
                    <p className="shrink-0 px-4 pb-2 text-[12px] text-content-subtle tabular-nums">
                        {resumen.total} {resumen.total === 1 ? "cliente" : "clientes"}
                        {resumen.deben > 0 && <> · {resumen.deben} {resumen.deben === 1 ? "debe" : "deben"} · <span className="font-semibold text-content dark:text-white">{fmtBase(resumen.deuda)}</span></>}
                    </p>
                )}

                <div className="px-4 pb-6 space-y-2 lg:flex-1 lg:min-h-0 lg:overflow-y-auto custom-scrollbar">
                    {clientes === null ? (
                        [0, 1, 2, 3, 4].map(i => <div key={i} className="h-[68px] rounded-xl bg-surface-2 dark:bg-white/[0.04] animate-pulse" />)
                    ) : clientes.length === 0 ? (
                        <div className="py-12 text-center">
                            <p className="text-[14px] font-semibold text-content dark:text-white">{term ? "Nadie coincide con la búsqueda" : "Este sector no tiene clientes"}</p>
                            <p className="mt-1 text-[12px] text-content-subtle">{term ? "Prueba con el nombre, la cédula o el teléfono." : "Se agregan desde Contactos, eligiendo el sector."}</p>
                        </div>
                    ) : clientes.map(c => {
                        const atencion = pideAtencion(c);
                        const activo = selId === c.id;
                        return (
                            <button key={c.id} type="button" onClick={() => setSelId(c.id)}
                                className={`relative w-full text-left rounded-xl border pl-3.5 pr-3 py-3 overflow-hidden transition-colors active:scale-[0.995] ${
                                    activo
                                        ? "border-brand-500/50 bg-brand-500/[0.04]"
                                        : "border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] hover:bg-surface-2/60 dark:hover:bg-white/[0.04]"
                                }`}>
                                {atencion && <span aria-hidden="true" className="absolute left-0 inset-y-0 w-[3px] bg-red-500" />}
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="min-w-0 truncate text-[14px] font-semibold text-content dark:text-white">{toNameCase(c.name)}</span>
                                    {c.deuda > 0
                                        ? <Money value={fmtBase(c.deuda)} className="shrink-0 text-[14px] font-semibold text-red-600 dark:text-red-400" />
                                        : <span className="shrink-0 text-[12px] font-medium text-content-subtle">Al día</span>}
                                </div>
                                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[12px] text-content-subtle">
                                    <span className="min-w-0 truncate">
                                        {!sector && (sectores || []).length > 1 && c.sector_name ? `${c.sector_name} · ` : ""}
                                        {c.address || c.phone || c.rif}
                                    </span>
                                    <span className={`shrink-0 whitespace-nowrap ${atencion ? "text-red-600 dark:text-red-400" : ""}`}>{ultimoAbonoTexto(c.ultimo_abono)}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Ficha: columna en escritorio, hoja inferior en el teléfono ── */}
            {selId && <div onClick={() => setSelId(null)} className="lg:hidden fixed inset-0 z-[790] bg-black/50 catalog-overlay-in" />}
            <div className={`flex-col min-h-0 lg:flex lg:static lg:z-auto lg:max-h-none lg:rounded-none lg:border-0 lg:border-l lg:border-border/60 lg:dark:border-white/[0.06] lg:shadow-none lg:bg-surface-2/40 lg:dark:bg-white/[0.01] ${
                selId
                    ? "flex fixed inset-x-0 bottom-0 z-[800] max-h-[90vh] rounded-t-3xl border-t border-border/20 dark:border-white/10 bg-white dark:bg-surface-dark-2 shadow-[0_-8px_30px_rgba(0,0,0,0.3)] sheet-up safe-area-bottom"
                    : "hidden"
            }`}>
                <div className="lg:hidden shrink-0 pt-2.5 pb-1 px-5 flex items-center justify-between border-b border-border/10 dark:border-white/[0.06] relative">
                    <div className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 rounded-full bg-border dark:bg-white/20" />
                    <p className="text-[12px] font-medium text-content-subtle mt-2">Ficha del cliente</p>
                    <button onClick={() => setSelId(null)} aria-label="Cerrar"
                        className="mt-2 w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle active:scale-95">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {selId ? (
                        <FichaCliente key={selId} id={selId} onChanged={recargar} />
                    ) : (
                        <div className="h-full flex items-center justify-center p-8 text-center">
                            <div>
                                <p className="text-[14px] font-semibold text-content dark:text-white">Elige un cliente</p>
                                <p className="mt-1 text-[12px] text-content-subtle">Verás lo que debe, sus abonos y lo que se le dejó.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
