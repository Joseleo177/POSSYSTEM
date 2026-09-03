import { useState, useEffect } from "react";
import { api } from "../services/api";

// Selector de las etiquetas de beneficio de un producto ("Repara y fortalece", "Reduce el
// frizz"), con creación al vuelo.
//
// Son chips que se marcan, no texto libre: la misma etiqueta es la que va a aparecer en
// todos los productos que la usan, así que el vendedor la escribe una vez —aquí mismo, sin
// salir del alta del producto— y de ahí en adelante solo la elige. Escribirla de nuevo cada
// vez terminaría con "Reduce el frizz" y "Anti-frizz" conviviendo en la misma vitrina.
//
// Se carga la lista de la empresa una sola vez por montaje: es un catálogo corto (unas
// decenas como mucho) que cambia poco, no hace falta recargarlo por cada apertura del modal.
export default function BenefitTagPicker({ selectedIds, onChange }) {
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [error, setError] = useState(null);

    useEffect(() => {
        let alive = true;
        api.benefitTags.getAll()
            .then(r => { if (alive) setTags(r.data || []); })
            .catch(() => { /* la ficha del producto no debe romperse por esto */ })
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, []);

    const toggle = (id) => {
        onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
    };

    const crear = async () => {
        const name = newName.trim();
        if (!name) return;
        setError(null);
        try {
            const r = await api.benefitTags.create(name);
            setTags(prev => [...prev, r.data].sort((a, b) => a.name.localeCompare(b.name)));
            onChange([...selectedIds, r.data.id]);
            setNewName("");
            setCreating(false);
        } catch (e) {
            setError(e.message || "No se pudo crear el beneficio");
        }
    };

    if (loading) {
        return <div className="h-8 rounded-lg bg-surface-2 dark:bg-white/5 animate-pulse" />;
    }

    return (
        <div>
            <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => {
                    const on = selectedIds.includes(tag.id);
                    return (
                        <button
                            key={tag.id}
                            type="button"
                            onClick={() => toggle(tag.id)}
                            className={`h-7 px-3 rounded-full text-[11px] font-bold transition-all border ${on
                                ? "bg-brand-500 text-black border-brand-500"
                                : "bg-transparent text-content-subtle dark:text-content-dark-muted border-border dark:border-white/10 hover:border-brand-500/50"}`}
                        >
                            {tag.name}
                        </button>
                    );
                })}

                {creating ? (
                    <div className="flex items-center gap-1">
                        <input
                            autoFocus
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === "Enter") { e.preventDefault(); crear(); }
                                if (e.key === "Escape") { setCreating(false); setNewName(""); }
                            }}
                            placeholder="Nombre del beneficio"
                            maxLength={60}
                            className="h-7 px-2.5 rounded-full text-[11px] font-bold bg-surface dark:bg-surface-dark-3 border border-brand-500/50 outline-none w-40"
                        />
                        <button type="button" onClick={crear} className="h-7 px-2 rounded-full bg-brand-500 text-black text-[11px] font-bold">
                            OK
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setCreating(true)}
                        className="h-7 px-3 rounded-full text-[11px] font-bold border border-dashed border-border dark:border-white/15 text-content-subtle hover:border-brand-500/50 hover:text-brand-500 transition-all"
                    >
                        + Nuevo
                    </button>
                )}
            </div>
            {error && <p className="text-[10px] font-bold text-danger mt-1.5">{error}</p>}
            {tags.length === 0 && !creating && (
                <p className="text-[10px] text-content-subtle dark:text-content-dark-muted mt-1.5">
                    Todavía no hay beneficios creados. Usa "+ Nuevo" para crear el primero.
                </p>
            )}
        </div>
    );
}
