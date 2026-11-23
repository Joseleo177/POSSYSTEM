import { useMemo, useState } from "react";
import SuggestInput from "./SuggestInput";
import { separarPrincipios, unirPrincipios, normPrincipio } from "../../helpers/principios";

/**
 * Principios activos de un medicamento como etiquetas (módulo Farmacia, 23-11-2026).
 *
 * Un medicamento puede combinar varios ("Loratadina + Pseudoefedrina"). El valor sigue siendo
 * un texto —el mismo campo de siempre— con los principios unidos por " + "; aquí se ve y se
 * edita como lista. Se agregan eligiendo de lo ya usado en la empresa o escribiendo uno nuevo
 * (también "A + B" de una vez). Retroceso con el campo vacío quita el último.
 */
export default function PrincipiosInput({ value = "", onChange, options = [], placeholder = "" }) {
    const lista = useMemo(() => separarPrincipios(value), [value]);
    const [draft, setDraft] = useState("");

    const elegidos = useMemo(() => new Set(lista.map(normPrincipio)), [lista]);
    const libres = useMemo(() => options.filter(o => !elegidos.has(normPrincipio(o))), [options, elegidos]);

    // Lo escrito toma la grafía ya usada en la empresa ("loratadina" → "Loratadina").
    const canonico = (p) => options.find(o => normPrincipio(o) === normPrincipio(p)) || p;

    const agregar = (texto) => {
        const nuevos = separarPrincipios(texto).map(canonico);
        if (nuevos.length) onChange(unirPrincipios([...lista, ...nuevos]));
        setDraft("");
    };
    const quitar = (i) => onChange(unirPrincipios(lista.filter((_, j) => j !== i)));

    return (
        <div
            onKeyDown={(e) => { if (e.key === "Backspace" && !draft && lista.length) quitar(lista.length - 1); }}
            onBlur={() => { if (draft.trim()) agregar(draft); }}
        >
            {lista.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {lista.map((p, i) => (
                        <span key={normPrincipio(p)} className="inline-flex items-center gap-1 h-8 pl-3 pr-1 rounded-lg bg-surface-2 dark:bg-white/[0.06] border border-border/70 dark:border-white/10 text-[13px] font-medium text-content dark:text-white">
                            {p}
                            <button type="button" onClick={() => quitar(i)} aria-label={`Quitar ${p}`}
                                className="w-6 h-6 rounded-md flex items-center justify-center text-content-subtle hover:text-red-600 hover:bg-red-500/10 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </span>
                    ))}
                    {lista.length > 1 && <span className="text-[12px] text-content-subtle">Combinación de {lista.length}</span>}
                </div>
            )}
            <SuggestInput
                value={draft}
                onChange={setDraft}
                onPick={agregar}
                options={libres}
                placeholder={lista.length ? "Agregar otro principio activo" : placeholder}
            />
        </div>
    );
}
