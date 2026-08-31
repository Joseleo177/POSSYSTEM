import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import CustomSelect from "./CustomSelect";

/**
 * Franja horaria del reporte, para acompañar al DateRangePicker.
 *
 * Existe por las jornadas nocturnas: un bar que abre el sábado a las 6 de la tarde y cierra
 * a las 4 de la madrugada no vende en "dos días", vende en una noche. Cuando la franja cruza
 * la medianoche el reporte imputa la madrugada al día en que la noche empezó, así que pedir
 * el sábado trae la jornada completa en una sola fila. Eso pasa en el servidor; acá solo se
 * elige la franja y se avisa de la regla, que si no se lee como un error de fechas.
 *
 * Vacío = todo el día, que es el comportamiento de siempre: el filtro no se aplica salvo
 * que estén las dos horas.
 */

// Cada media hora. El cuarto de hora no le sirve a nadie para cortar una jornada y triplica
// el largo de la lista.
const OPCIONES = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 ? "30" : "00";
  return { value: `${h}:${m}`, label: `${h}:${m}` };
});

const ATAJOS = [
  { label: "Noche", from: "18:00", to: "04:00" },
  { label: "Tarde", from: "12:00", to: "18:00" },
  { label: "Mañana", from: "06:00", to: "12:00" },
];

export default function HourRangePicker({ from, to, onChange, className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);

  const activo = Boolean(from && to && from !== to);
  const cruzaMedianoche = activo && to < from;

  const updateCoords = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const alto = 200;
    const ancho = 260;
    let top = rect.bottom + window.scrollY + 4;
    let left = rect.left + window.scrollX;
    if (rect.bottom + alto > window.innerHeight) top = rect.top + window.scrollY - alto - 4;
    if (left + ancho > window.innerWidth) left = window.innerWidth - ancho - 10;
    setCoords({ top, left });
  };

  useLayoutEffect(() => { if (isOpen) updateCoords(); }, [isOpen]);

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current?.contains(e.target)) return;
      if (dropdownRef.current?.contains(e.target)) return;
      // El menú de CustomSelect vive en su propio portal, fuera de este dropdown: sin esta
      // guarda, elegir una hora cerraría el panel en el mismo clic.
      if (e.target.closest?.("[data-custom-select-menu]")) return;
      setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClick);
      window.addEventListener("scroll", updateCoords, true);
      window.addEventListener("resize", updateCoords);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 h-10 rounded-md border bg-white dark:bg-[#12141a] text-content dark:text-content-dark transition-all cursor-pointer group select-none shadow-sm ${
          activo
            ? "border-brand-500/50 hover:border-brand-500"
            : "border-border/80 dark:border-white/5 hover:border-brand-500/40"
        }`}
      >
        <svg
          className={`w-3.5 h-3.5 shrink-0 transition-all ${activo ? "text-brand-500" : "text-content-subtle opacity-50 group-hover:text-brand-500 group-hover:opacity-100"}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="9" strokeWidth={2.5} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 7v5l3 2" />
        </svg>

        <div className="flex items-center justify-center flex-1 gap-2 whitespace-nowrap">
          {activo ? (
            <>
              <span className="text-[11px] font-medium uppercase tracking-tight">{from}</span>
              <span className="text-[10px] text-content-subtle opacity-20 font-bold group-hover:opacity-40 transition-opacity">→</span>
              <span className="text-[11px] font-medium uppercase tracking-tight">{to}</span>
            </>
          ) : (
            <span className="text-[11px] font-medium uppercase tracking-tight opacity-30">Todo el día</span>
          )}
        </div>

        {activo && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange("", ""); }}
            className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-danger/10 text-content-subtle hover:text-danger opacity-0 group-hover:opacity-100 transition-all shrink-0"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "absolute", top: coords.top, left: coords.left, zIndex: 9999 }}
          className="w-[260px] p-3 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="text-[8px] font-black text-content-subtle uppercase tracking-widest mb-2">Franja horaria</div>

          <div className="flex items-center gap-2">
            <CustomSelect
              value={from || ""}
              onChange={(v) => onChange(v, to || "")}
              options={OPCIONES}
              placeholder="Desde"
              height="h-8"
              className="flex-1"
              boxClassName="text-[11px]"
            />
            <span className="text-[10px] font-bold text-content-subtle opacity-40 shrink-0">→</span>
            <CustomSelect
              value={to || ""}
              onChange={(v) => onChange(from || "", v)}
              options={OPCIONES}
              placeholder="Hasta"
              height="h-8"
              className="flex-1"
              boxClassName="text-[11px]"
            />
          </div>

          <div className="flex gap-1 mt-2">
            {ATAJOS.map(a => (
              <button
                key={a.label}
                onClick={() => { onChange(a.from, a.to); setIsOpen(false); }}
                className="flex-1 py-1 text-[9px] font-bold text-center text-content-subtle hover:text-brand-500 hover:bg-brand-500/10 rounded-md transition-all uppercase"
              >
                {a.label}
              </button>
            ))}
            <button
              onClick={() => { onChange("", ""); setIsOpen(false); }}
              className="flex-1 py-1 text-[9px] font-bold text-center text-content-subtle hover:text-danger hover:bg-danger/10 rounded-md transition-all uppercase"
            >
              Todo
            </button>
          </div>

          {/* Sin esta línea, ver la madrugada del domingo dentro del sábado se lee como un
              error del reporte en vez de como la regla que se pidió. */}
          {cruzaMedianoche && (
            <div className="mt-2 pt-2 border-t border-border/20 dark:border-white/5 flex gap-1.5">
              <svg className="w-3 h-3 shrink-0 text-brand-500 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <p className="text-[9px] font-bold leading-tight text-content-subtle">
                Jornada nocturna: lo vendido después de medianoche se cuenta en el día en que
                empezó la noche.
              </p>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}