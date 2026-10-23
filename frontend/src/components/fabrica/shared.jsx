import { useEffect, useRef, useState } from "react";
import { useSearchDropdown } from "../../hooks/useSearchDropdown";
import { toNameCase } from "../../helpers";
import Segmented from "../ui/Segmented";

// Piezas comunes del módulo Fábrica: campos, medidas, estados y el buscador con selección.

export const LABEL   = "text-[12px] font-medium text-content-subtle";
export const INPUT   = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";
export const AGREGAR = "w-full h-9 rounded-lg border border-dashed border-border dark:border-white/15 text-[12px] font-medium text-content-subtle hover:text-content hover:border-content-subtle/60 dark:hover:text-white dark:hover:border-white/30 transition-colors flex items-center justify-center gap-1.5";
export const QUITAR  = "w-10 h-10 shrink-0 rounded-lg border border-border dark:border-white/10 text-content-subtle hover:text-red-600 hover:border-red-500/40 dark:hover:text-red-400 transition-colors flex items-center justify-center";
export const CARD    = "bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none";

export const Prefijo = ({ children }) => (
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{children}</span>
);

export function Field({ label, hint, children }) {
    return (
        <div>
            <p className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className={LABEL}>{label}</span>
                {hint && <span className="text-[11px] text-content-subtle/70">{hint}</span>}
            </p>
            {children}
        </div>
    );
}

export const PlusIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M12 5v14M5 12h14" /></svg>
);
export const XIcon = ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
);
export const SHEET_ICON = "M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 9h9V4m0 10v6";

// ── Medidas ─────────────────────────────────────────────────────────────────────────────
// En el sistema todo va en milímetros; en pantalla se escribe en la unidad que use el taller
// ("una silla de 1,50 × 1,22" o "150 × 122 cm"). La elegida se recuerda en el equipo.

export const UNITS = [
    { key: "m",  label: "m",  factor: 1000 },
    { key: "cm", label: "cm", factor: 10 },
    { key: "mm", label: "mm", factor: 1 },
];
const UNIT_KEY = "fabrica_unidad";

export function useMeasureUnit() {
    const [unit, setUnitState] = useState(() => {
        try { return localStorage.getItem(UNIT_KEY) || "m"; } catch { return "m"; }
    });
    const setUnit = (u) => {
        setUnitState(u);
        try { localStorage.setItem(UNIT_KEY, u); } catch { /* modo privado */ }
    };
    return [unit, setUnit];
}

export const parseNum = (s) => {
    const n = parseFloat(String(s ?? "").trim().replace(",", "."));
    return isFinite(n) ? n : NaN;
};

// "1,22" en metros → 1220 mm. NaN si no es un número positivo.
export const toMm = (value, unit) => {
    const n = parseNum(value);
    const f = UNITS.find(u => u.key === unit)?.factor || 1;
    return n > 0 ? Math.round(n * f) : NaN;
};

// 1220 mm → "1,22" en la unidad pedida, para prellenar un campo.
export const fromMm = (mm, unit) => {
    if (!mm) return "";
    const f = UNITS.find(u => u.key === unit)?.factor || 1;
    return (mm / f).toLocaleString("es-VE", { maximumFractionDigits: 3, useGrouping: false });
};

// Dos maneras de controlar un material por piezas: láminas (ancho × largo, en m²) o barras y
// tubos (solo largo, en m). Es lo que hace que el módulo sirva a una herrería, una vidriería o
// una carpintería, y no solo al taller de acero que lo pidió.
export const MODES = [
    { key: "area",   label: "Por área",     hint: "Láminas, vidrio, MDF: ancho × largo" },
    { key: "length", label: "Por longitud", hint: "Tubos, perfiles, cabillas: largo" },
];

// Las medidas se muestran en metros, que es como se nombra una lámina (1,22 × 2,44).
export const fmtM = (mm) => (mm / 1000).toLocaleString("es-VE", { maximumFractionDigits: 3 });
export const fmtDims = (p) => {
    // Un retazo en L sabe su forma: se muestra con su contorno.
    if (p.is_irregular) return Array.isArray(p.shape) && p.shape.length && p.width_mm
        ? `Irregular · ${fmtM(p.width_mm)} × ${fmtM(p.length_mm)} m`
        : "Irregular";
    if (!p.width_mm) return p.length_mm ? `${fmtM(p.length_mm)} m` : "—";
    return `${fmtM(p.width_mm)} × ${fmtM(p.length_mm)} m`;
};
// Tamaño en la unidad del material: m² para láminas, m para tubos.
export const unitLabel = (unit) => (String(unit || "").toUpperCase() === "M2" ? "m²" : "m");
export const fmtSize = (n, unit = "M2") =>
    `${Number(n || 0).toLocaleString("es-VE", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${unitLabel(unit)}`;

export function UnitSwitch({ unit, setUnit, className = "" }) {
    return <Segmented className={className} value={unit} onChange={setUnit} options={UNITS.map(u => ({ key: u.key, label: u.label }))} />;
}

// Ancho × largo en una sola fila, con la unidad dentro de cada campo. Por longitud, solo el largo.
export function DimsInput({ w, l, onW, onL, unit, autoFocus = false, mode = "area" }) {
    if (mode === "length") {
        return (
            <div className="relative">
                <input value={l} onChange={e => onL(e.target.value)} inputMode="decimal" placeholder="Largo"
                    data-autofocus={autoFocus || undefined} className={`${INPUT} pr-10 tabular-nums`} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{unit}</span>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
                <input value={w} onChange={e => onW(e.target.value)} inputMode="decimal" placeholder="Ancho"
                    data-autofocus={autoFocus || undefined} className={`${INPUT} pr-10 tabular-nums`} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{unit}</span>
            </div>
            <XIcon className="w-3.5 h-3.5 text-content-subtle shrink-0" />
            <div className="relative flex-1 min-w-0">
                <input value={l} onChange={e => onL(e.target.value)} inputMode="decimal" placeholder="Largo"
                    className={`${INPUT} pr-10 tabular-nums`} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{unit}</span>
            </div>
        </div>
    );
}

// ── Estados ─────────────────────────────────────────────────────────────────────────────
// Lo normal en gris; solo lo que pide que alguien actúe lleva color (ver ui/StatusMark).

export const ORDER_STATUS = {
    abierta:   { label: "Abierta",   tone: "neutral" },
    terminada: { label: "Terminada", tone: "success", quiet: "check" },
    anulada:   { label: "Anulada",   tone: "neutral", quiet: "void" },
};

export const PIECE_STATUS = {
    disponible: { label: "Disponible", tone: "success", quiet: "check" },
    en_taller:  { label: "En el taller", tone: "warning", flag: true },
    consumida:  { label: "Consumida", tone: "neutral", quiet: "void" },
    baja:       { label: "De baja",   tone: "neutral", quiet: "void" },
    anulada:    { label: "Anulada",   tone: "neutral", quiet: "void" },
};

export const ORIGIN_LABEL = {
    compra:        "Compra",
    carga_inicial: "Carga inicial",
    existencia:    "Existencia",
    retazo:        "Retazo",
};

export const orderCode = (n) => `OF-${String(n).padStart(4, "0")}`;

// ── Buscador con selección ──────────────────────────────────────────────────────────────
// Escribe, elige de la lista y queda la ficha elegida con una X para cambiarla.

export function SearchPick({ searchFn, value, onChange, placeholder, renderItem, renderValue, autoFocus = false, disabled = false }) {
    const { term, setTerm, results, searching, clear } = useSearchDropdown(searchFn, { limit: 8 });
    const [open, setOpen] = useState(false);
    const boxRef = useRef(null);

    useEffect(() => {
        const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, []);

    if (value) {
        return (
            <div className={`${INPUT} flex items-center justify-between gap-2`}>
                <span className="truncate">{renderValue ? renderValue(value) : toNameCase(value.name)}</span>
                {!disabled && (
                    <button type="button" onClick={() => onChange(null)} aria-label="Quitar" className="shrink-0 text-content-subtle hover:text-content dark:hover:text-white">
                        <XIcon />
                    </button>
                )}
            </div>
        );
    }

    return (
        <div ref={boxRef} className="relative">
            <input
                value={term}
                onChange={e => { setTerm(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                placeholder={placeholder}
                autoComplete="off"
                spellCheck={false}
                data-autofocus={autoFocus || undefined}
                disabled={disabled}
                className={INPUT}
            />
            {open && term.trim() && (
                <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-surface-dark-2 shadow-lg max-h-64 overflow-y-auto">
                    {searching && results.length === 0 ? (
                        <div className="px-3 py-3 text-[12px] text-content-subtle">Buscando…</div>
                    ) : results.length === 0 ? (
                        <div className="px-3 py-3 text-[12px] text-content-subtle">Sin resultados</div>
                    ) : results.map(r => (
                        <button type="button" key={r.id}
                            onClick={() => { onChange(r); clear(); setOpen(false); }}
                            className="w-full text-left px-3 py-2 text-[13px] hover:bg-surface-2 dark:hover:bg-white/5 border-b last:border-b-0 border-border/40 dark:border-white/[0.04]">
                            {renderItem ? renderItem(r) : toNameCase(r.name)}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// Candado por botón: varias acciones en la misma pantalla, cada una con su spinner, y un
// segundo clic sobre la que corre no la repite (mismo criterio que hooks/useAsyncAction).
export function useKeyedAction() {
    const [running, setRunning] = useState({});
    const lock = useRef(new Set());
    const run = async (key, fn) => {
        if (lock.current.has(key)) return;
        lock.current.add(key);
        setRunning(r => ({ ...r, [key]: true }));
        try { return await fn(); }
        finally {
            lock.current.delete(key);
            setRunning(r => { const n = { ...r }; delete n[key]; return n; });
        }
    };
    return { run, busy: (key) => !!running[key] };
}

// Mensaje de error de la API, o el de respaldo.
export const errMsg = (e, fallback = "No se pudo completar") => e?.message || fallback;
