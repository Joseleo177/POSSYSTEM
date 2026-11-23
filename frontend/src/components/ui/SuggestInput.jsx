import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";

// Normalización sin tildes ni mayúsculas para filtrar y deduplicar opciones.
const norm = (s) => String(s || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Combobox buscable y auto-alimentado (mismo patrón de portal que CustomSelect):
 * - Flota por encima de cualquier modal (createPortal a document.body) sin causar scroll ni recortarse.
 * - Muestra las opciones existentes filtradas sin importar mayúsculas ni tildes.
 * - Si el texto coincide con una opción existente (ignorando tildes/mayúsculas), al salir o
 *   elegir usa la grafía canónica existente para evitar duplicados ("calox" -> "Calox").
 * - Si no existe, ofrece "+ Usar «...»" para crear un valor nuevo al vuelo.
 * - `onPick` (opcional): recibe lo elegido en la lista o con Enter, en vez de `onChange`. Lo usa
 *   quien junta varios valores (ui/PrincipiosInput): escribir no es lo mismo que elegir.
 */
export default function SuggestInput({
    value = "",
    onChange,
    onPick,
    options = [],
    placeholder = "",
    className = "",
    inputClassName = "",
}) {
    const [open, setOpen] = useState(false);
    const [activeIdx, setActiveIdx] = useState(0);
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
    const triggerRef = useRef(null);
    const menuRef = useRef(null);

    const q = norm(value);
    const filtered = useMemo(() => {
        if (!q) return options.slice(0, 40);
        return options.filter(o => norm(o).includes(q)).slice(0, 40);
    }, [options, q]);

    const exactMatch = useMemo(() => {
        if (!q) return null;
        return options.find(o => norm(o) === q) || null;
    }, [options, q]);

    const canCreate = Boolean(String(value || "").trim()) && !exactMatch;
    const totalRows = filtered.length + (canCreate ? 1 : 0);

    useEffect(() => { setActiveIdx(0); }, [value, open]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (triggerRef.current?.contains(e.target)) return;
            if (menuRef.current?.contains(e.target)) return;
            setOpen(false);
            if (exactMatch && exactMatch !== value) onChange(exactMatch);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open, exactMatch, value, onChange]);

    useLayoutEffect(() => {
        if (!open || totalRows === 0) return;
        const update = () => {
            const r = triggerRef.current?.getBoundingClientRect();
            if (!r) return;
            const menuH = Math.min(220, totalRows * 36 + 12);
            const spaceBelow = window.innerHeight - r.bottom;
            const openUp = spaceBelow < menuH + 16 && r.top > menuH + 16;
            let left = r.left;
            if (left + r.width > window.innerWidth - 12) {
                left = Math.max(12, window.innerWidth - r.width - 12);
            }
            setPos({
                top: openUp ? r.top - menuH - 6 : r.bottom + 6,
                left,
                width: r.width,
            });
        };
        update();
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        return () => {
            window.removeEventListener("scroll", update, true);
            window.removeEventListener("resize", update);
        };
    }, [open, totalRows]);

    const pick = (val) => {
        if (onPick) onPick(val); else onChange(val);
        setOpen(false);
    };

    const handleKeyDown = (e) => {
        if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setOpen(true);
            return;
        }
        if (!open) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (totalRows > 0) setActiveIdx(i => (i + 1) % totalRows);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (totalRows > 0) setActiveIdx(i => (i - 1 + totalRows) % totalRows);
        } else if (e.key === "Enter" && totalRows > 0) {
            e.preventDefault();
            if (activeIdx < filtered.length) pick(filtered[activeIdx]);
            else if (canCreate) pick(String(value).trim());
        } else if (e.key === "Escape") {
            setOpen(false);
        }
    };

    return (
        <div ref={triggerRef} className={`relative ${className}`}>
            <input
                type="text"
                className={`input pr-8 ${inputClassName}`}
                value={value}
                placeholder={placeholder}
                autoComplete="off"
                onFocus={() => setOpen(true)}
                onChange={e => { onChange(e.target.value); setOpen(true); }}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                    if (exactMatch && exactMatch !== value) onChange(exactMatch);
                }}
            />
            <button
                type="button"
                tabIndex={-1}
                onClick={() => setOpen(o => !o)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-subtle/70 hover:text-content dark:hover:text-white transition-colors"
                aria-label="Ver opciones"
            >
                <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && totalRows > 0 && createPortal(
                <div
                    ref={menuRef}
                    style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
                    className="max-h-[220px] overflow-y-auto rounded-xl border border-border/80 dark:border-white/10 bg-white dark:bg-[#12141a] shadow-2xl py-1"
                >
                    {filtered.map((opt, idx) => (
                        <button
                            key={opt}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); pick(opt); }}
                            onMouseEnter={() => setActiveIdx(idx)}
                            className={`w-full text-left px-3 py-2 text-[13px] transition-colors flex items-center justify-between gap-2 ${
                                idx === activeIdx
                                    ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 font-medium"
                                    : "text-content dark:text-white hover:bg-surface-2 dark:hover:bg-white/5"
                            }`}
                        >
                            <span className="truncate">{opt}</span>
                            {norm(opt) === q && (
                                <svg className="w-3.5 h-3.5 shrink-0 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </button>
                    ))}
                    {canCreate && (
                        <button
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); pick(String(value).trim()); }}
                            onMouseEnter={() => setActiveIdx(filtered.length)}
                            className={`w-full text-left px-3 py-2 text-[12.5px] border-t border-border/40 dark:border-white/[0.06] transition-colors ${
                                activeIdx === filtered.length
                                    ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 font-semibold"
                                    : "text-brand-600 dark:text-brand-400 hover:bg-surface-2 dark:hover:bg-white/5"
                            }`}
                        >
                            + Usar «{String(value).trim()}»
                        </button>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}
