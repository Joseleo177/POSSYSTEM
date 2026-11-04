import { useMemo, useState } from "react";
import { INPUT } from "../fabrica/shared";
import { fmtMoney } from "../../helpers";
import { duracion } from "./shared";

// Elegir los servicios de una cita. Una barbería tiene siete; un spa o un consultorio pueden
// tener cientos, así que no van como pastillas sueltas: buscador, categorías y una lista que se
// desplaza sola. Lo elegido queda arriba, en el orden en que se hará.
const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function ServicePicker({ services, selected, onToggle, sym = "Ref." }) {
    const [buscar, setBuscar] = useState("");
    const [categoria, setCategoria] = useState("");

    const categorias = useMemo(() => [...new Set(services.map(s => s.category_name || "Otros"))], [services]);
    const visibles = useMemo(() => {
        const q = sinAcentos(buscar.trim());
        return services.filter(s => (!categoria || (s.category_name || "Otros") === categoria) && (!q || sinAcentos(s.name).includes(q)));
    }, [services, buscar, categoria]);
    // Con categorías y sin buscar, la lista va por grupos.
    const agrupar = !buscar.trim() && !categoria && categorias.length > 1;
    const elegidos = selected.map(id => services.find(s => s.id === id)).filter(Boolean);

    const fila = (s) => {
        const on = selected.includes(s.id);
        return (
            <button key={s.id} type="button" onClick={() => onToggle(s.id)}
                className={`w-full px-3 h-12 sm:h-11 flex items-center gap-3 text-left transition-colors ${on ? "bg-brand-500/[0.06] dark:bg-brand-500/10" : "hover:bg-surface-2 dark:hover:bg-white/[0.03]"}`}>
                <span aria-hidden="true" className={`w-[18px] h-[18px] shrink-0 rounded-[5px] flex items-center justify-center ${on ? "bg-brand-600 text-white dark:bg-brand-500" : "border border-border dark:border-white/20 bg-white dark:bg-white/[0.04]"}`}>{on && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" /></svg>}</span>
                <span className="min-w-0 flex-1 text-[13px] font-medium text-content dark:text-white truncate">{s.name}</span>
                <span className="text-[12px] text-content-subtle tabular-nums shrink-0">{duracion(s.duration_min)} · {fmtMoney(s.price, sym)}</span>
            </button>
        );
    };

    return (
        <div className="space-y-2">
            {elegidos.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {elegidos.map(s => (
                        <span key={s.id} className="h-8 pl-3 pr-1 rounded-full bg-brand-500/10 text-brand-700 dark:text-brand-300 text-[12px] font-semibold inline-flex items-center gap-1">
                            {s.name}<span className="font-normal opacity-75"> · {duracion(s.duration_min)}</span>
                            <button type="button" onClick={() => onToggle(s.id)} aria-label={`Quitar ${s.name}`}
                                className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-brand-500/15">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2.6} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <div className="rounded-xl border border-border dark:border-white/10 overflow-hidden">
                <div className="p-2 space-y-2 border-b border-border/60 dark:border-white/[0.06] bg-surface-2/60 dark:bg-white/[0.02]">
                    <div className="relative">
                        <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" /></svg>
                        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder={`Buscar entre ${services.length} servicios`} autoComplete="off" className={`${INPUT} pl-9`} />
                    </div>
                    {categorias.length > 1 && (
                        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                            {["", ...categorias].map(c => (
                                <button key={c || "todas"} type="button" onClick={() => setCategoria(c)}
                                    className={`h-8 px-3 rounded-full text-[12px] font-medium whitespace-nowrap shrink-0 transition-colors
                                        ${categoria === c ? "bg-content text-white dark:bg-white dark:text-surface-dark-1" : "bg-white dark:bg-white/[0.06] border border-border dark:border-white/10 text-content dark:text-white"}`}>
                                    {c || "Todas"}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="max-h-[248px] overflow-y-auto divide-y divide-border/50 dark:divide-white/[0.05]">
                    {visibles.length === 0 ? (
                        <div className="py-6 text-center text-[13px] text-content-subtle">Ningún servicio coincide con «{buscar}»</div>
                    ) : agrupar ? categorias.map(c => {
                        const del = visibles.filter(s => (s.category_name || "Otros") === c);
                        if (!del.length) return null;
                        return (
                            <div key={c}>
                                <div className="px-3 py-1.5 text-[11px] font-semibold text-content-subtle bg-surface-2/70 dark:bg-white/[0.03] sticky top-0">{c}</div>
                                <div className="divide-y divide-border/50 dark:divide-white/[0.05]">{del.map(fila)}</div>
                            </div>
                        );
                    }) : visibles.map(fila)}
                </div>
            </div>
        </div>
    );
}
