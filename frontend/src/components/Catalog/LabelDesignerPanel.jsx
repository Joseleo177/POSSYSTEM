import CustomSelect from "../ui/CustomSelect";
import { LABEL_ELEMENTS, LABEL_ZONES, LABEL_ALIGNS } from "./labelTemplate";

const ZONE_OPTIONS = LABEL_ZONES.map(z => ({ value: z.id, label: z.label }));

const ArrowIcon = ({ up }) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
        {up ? <path d="M10 15V5M5 10l5-5 5 5" /> : <path d="M10 5v10M5 10l5 5 5-5" />}
    </svg>
);

// Panel de diseño de la etiqueta. Solo toca la plantilla; el tamaño del rollo y la moneda
// siguen viviendo en la barra superior porque se cambian en cada tirada, no en el diseño.
export default function LabelDesignerPanel({
    template,
    layoutMode,
    onLayoutMode,
    selectedId,
    onSelect,
    onElement,
    onMove,
    onReset,
    border,
    onBorder,
    altCurrencyId,
    onAltCurrency,
    currencies,
    canSave,
    saving,
    onSave,
    onClose,
}) {
    return (
        <aside className="print:hidden w-[330px] shrink-0 h-full overflow-y-auto bg-surface-1 dark:bg-surface-dark-1 border-l border-border/40 dark:border-white/5">
            <div className="sticky top-0 z-10 bg-surface-1 dark:bg-surface-dark-1 px-4 py-3 border-b border-border/40 dark:border-white/5 flex items-center justify-between">
                <div>
                    <div className="text-xs font-black uppercase text-content dark:text-content-dark">Diseño de etiqueta</div>
                    <div className="text-[10px] font-bold text-content-subtle dark:text-content-dark-muted">Qué se imprime y dónde</div>
                </div>
                <button onClick={onClose} className="w-7 h-7 rounded-lg bg-surface-2 dark:bg-white/5 flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-content-dark transition-colors">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-3.5 h-3.5"><path d="M5 5l10 10M15 5L5 15" /></svg>
                </button>
            </div>

            <div className="p-3 space-y-3">
                {/* ── Opciones generales ── */}
                <div className="bg-surface-2 dark:bg-surface-dark-2 rounded-xl p-3 border border-border/40 dark:border-white/5 space-y-3">
                    <h3 className="text-[10px] font-black uppercase text-content-subtle dark:text-content-dark-muted">Etiqueta</h3>

                    <div>
                        <div className="text-[10px] font-black uppercase text-content-subtle dark:text-content-dark-muted mb-1.5">Colocación</div>
                        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-border/40 dark:border-white/5">
                            <button onClick={() => onLayoutMode("zones")}
                                className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${layoutMode === "zones" ? "bg-brand-500 text-black" : "text-content-subtle hover:bg-white/5"}`}>
                                Por zonas
                            </button>
                            <button onClick={() => onLayoutMode("free")}
                                className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${layoutMode === "free" ? "bg-brand-500 text-black" : "text-content-subtle hover:bg-white/5"}`}>
                                Libre
                            </button>
                        </div>
                        <p className="text-[9px] font-bold text-content-subtle dark:text-content-dark-muted mt-1.5 leading-tight">
                            {layoutMode === "free"
                                ? "Arrastrá cada elemento sobre la etiqueta. Las posiciones se guardan en proporción, así el diseño aguanta el cambio de tamaño de rollo."
                                : "Cada elemento se acomoda solo dentro de su zona. Es lo más seguro cuando se imprime en varios tamaños."}
                        </p>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] font-bold text-content dark:text-content-dark">Marco de corte</div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={border} onChange={e => onBorder(e.target.checked)} />
                            <div className="w-9 h-5 bg-border/50 peer-focus:outline-none dark:bg-white/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500"></div>
                        </label>
                    </div>

                    <div>
                        <div className="text-[10px] font-black uppercase text-content-subtle dark:text-content-dark-muted mb-1.5">Segunda moneda</div>
                        <CustomSelect
                            value={altCurrencyId}
                            onChange={onAltCurrency}
                            options={[{ value: "", label: "NINGUNA" }, ...currencies.map(c => ({ value: String(c.id), label: `${c.symbol} ${c.code}` }))]}
                            height="h-9"
                            className="w-full"
                        />
                    </div>
                </div>

                {/* ── Elementos ── */}
                <div className="space-y-2">
                    <h3 className="text-[10px] font-black uppercase text-content-subtle dark:text-content-dark-muted px-1">Elementos</h3>

                    {LABEL_ELEMENTS.map(def => {
                        const el = template[def.id];
                        return (
                            <div
                                key={def.id}
                                onClick={() => el.on && onSelect?.(def.id)}
                                className={`rounded-xl border transition-all ${selectedId === def.id && el.on
                                    ? "bg-surface-2 dark:bg-surface-dark-2 border-brand-500/70 ring-1 ring-brand-500/30"
                                    : el.on
                                        ? "bg-surface-2 dark:bg-surface-dark-2 border-border/40 dark:border-white/10"
                                        : "bg-surface-2/40 dark:bg-white/[0.02] border-border/30 dark:border-white/5"}`}
                            >
                                <div className="flex items-center justify-between gap-2 p-3">
                                    <div className="min-w-0">
                                        <div className={`text-[11px] font-bold truncate ${el.on ? "text-content dark:text-content-dark" : "text-content-subtle dark:text-content-dark-muted"}`}>
                                            {def.label}
                                        </div>
                                        {def.hint && (
                                            <div className="text-[9px] font-bold text-content-subtle dark:text-content-dark-muted mt-0.5 truncate">{def.hint}</div>
                                        )}
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                        <input type="checkbox" className="sr-only peer" checked={el.on} onChange={e => onElement(def.id, { on: e.target.checked })} />
                                        <div className="w-9 h-5 bg-border/50 peer-focus:outline-none dark:bg-white/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500"></div>
                                    </label>
                                </div>

                                {el.on && (
                                    <div className="px-3 pb-3 space-y-2.5 border-t border-border/30 dark:border-white/5 pt-2.5">
                                        <div className="grid grid-cols-2 gap-2">
                                            {layoutMode === "zones" ? (
                                                <div>
                                                    <div className="text-[9px] font-black uppercase text-content-subtle dark:text-content-dark-muted mb-1">Zona</div>
                                                    <CustomSelect
                                                        value={el.zone}
                                                        onChange={v => onElement(def.id, { zone: v })}
                                                        options={ZONE_OPTIONS}
                                                        height="h-8"
                                                        boxClassName="text-[10px]"
                                                        className="w-full"
                                                    />
                                                </div>
                                            ) : (
                                                <div>
                                                    <div className="text-[9px] font-black uppercase text-content-subtle dark:text-content-dark-muted mb-1">Ancho</div>
                                                    <div className="relative">
                                                        <input
                                                            type="number" min="5" max="100" value={Math.round(el.w)}
                                                            onChange={e => onElement(def.id, { w: Math.min(100, Math.max(5, parseInt(e.target.value) || 5)) })}
                                                            className="w-full h-8 bg-white/5 border border-border/40 dark:border-white/10 rounded-lg px-2 pr-5 text-[10px] font-bold outline-none focus:border-brand-500/60"
                                                        />
                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-content-subtle">%</span>
                                                    </div>
                                                </div>
                                            )}
                                            <div>
                                                <div className="text-[9px] font-black uppercase text-content-subtle dark:text-content-dark-muted mb-1">Alineación</div>
                                                <CustomSelect
                                                    value={el.align}
                                                    onChange={v => onElement(def.id, { align: v })}
                                                    options={LABEL_ALIGNS}
                                                    height="h-8"
                                                    boxClassName="text-[10px]"
                                                    className="w-full"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[9px] font-black uppercase text-content-subtle dark:text-content-dark-muted">Tamaño</span>
                                                <span className="text-[9px] font-black text-brand-500">{Math.round(el.scale * 100)}%</span>
                                            </div>
                                            <input
                                                type="range" min="0.4" max="2.5" step="0.05" value={el.scale}
                                                onChange={e => onElement(def.id, { scale: parseFloat(e.target.value) })}
                                                className="w-full accent-brand-500 h-1"
                                            />
                                        </div>

                                        {layoutMode === "free" && (
                                            <div className="grid grid-cols-2 gap-2">
                                                {["x", "y"].map(axis => (
                                                    <div key={axis}>
                                                        <div className="text-[9px] font-black uppercase text-content-subtle dark:text-content-dark-muted mb-1">
                                                            {axis === "x" ? "Izquierda" : "Arriba"}
                                                        </div>
                                                        <div className="relative">
                                                            <input
                                                                type="number" min="0" max="100" value={Math.round(el[axis])}
                                                                onChange={e => onElement(def.id, { [axis]: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                                                                className="w-full h-8 bg-white/5 border border-border/40 dark:border-white/10 rounded-lg px-2 pr-5 text-[10px] font-bold outline-none focus:border-brand-500/60"
                                                            />
                                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-content-subtle">%</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {layoutMode === "zones" && (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => onMove(def.id, -1)}
                                                className="w-7 h-7 rounded-lg bg-white/5 border border-border/40 dark:border-white/10 flex items-center justify-center text-content-subtle hover:text-brand-500 transition-colors"
                                                title="Subir dentro de la zona"
                                            >
                                                <ArrowIcon up />
                                            </button>
                                            <button
                                                onClick={() => onMove(def.id, 1)}
                                                className="w-7 h-7 rounded-lg bg-white/5 border border-border/40 dark:border-white/10 flex items-center justify-center text-content-subtle hover:text-brand-500 transition-colors"
                                                title="Bajar dentro de la zona"
                                            >
                                                <ArrowIcon />
                                            </button>
                                            <button
                                                onClick={() => onElement(def.id, { inline: !el.inline })}
                                                className={`flex-1 h-7 rounded-lg text-[9px] font-black uppercase border transition-all ${el.inline
                                                    ? "bg-brand-500 text-black border-brand-500"
                                                    : "bg-white/5 text-content-subtle border-border/40 dark:border-white/10 hover:text-content dark:hover:text-content-dark"}`}
                                                title="Compartir línea con el elemento de arriba"
                                            >
                                                Misma línea
                                            </button>
                                        </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="flex gap-2 pt-1">
                    <button
                        onClick={onReset}
                        className="px-3 h-9 rounded-lg bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/10 text-[10px] font-black uppercase text-content-subtle hover:text-content dark:hover:text-content-dark transition-colors"
                    >
                        Restablecer
                    </button>
                    {canSave && (
                        <button
                            onClick={onSave}
                            disabled={saving}
                            className="flex-1 h-9 rounded-lg bg-brand-500 text-black text-[10px] font-black uppercase disabled:opacity-60 active:scale-95 transition-all"
                        >
                            {saving ? "Guardando..." : "Guardar plantilla"}
                        </button>
                    )}
                </div>
                {!canSave && (
                    <p className="text-[9px] font-bold text-content-subtle dark:text-content-dark-muted px-1 leading-tight">
                        Los cambios valen para esta impresión. Guardar la plantilla para todos requiere permiso de configuración.
                    </p>
                )}
            </div>
        </aside>
    );
}
