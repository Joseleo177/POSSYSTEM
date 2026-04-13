import { useState, useRef, useEffect } from "react";

export default function CustomSelect({ value, onChange, options, placeholder = "Seleccionar...", className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedOption = options.find(o => String(o.value) === String(value));

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div 
        onClick={() => setOpen(!open)}
        className="input h-8 text-[11px] cursor-pointer flex items-center justify-between !bg-white dark:!bg-surface-dark-2"
      >
        <span className={selectedOption ? "text-content dark:text-content-dark font-black tracking-wide" : "text-content-subtle opacity-60"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg className={`w-4 h-4 text-content-subtle transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-lg shadow-2xl z-[100] max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
          {options.map((opt, i) => (
            <div 
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`px-4 py-2.5 cursor-pointer flex items-center gap-2 text-[11px] font-black uppercase tracking-wide transition-colors
                ${String(value) === String(opt.value) 
                  ? "bg-brand-500/10 text-brand-500" 
                  : "hover:bg-surface-2 dark:hover:bg-white/5 text-content dark:text-content-dark"}
                ${i !== options.length - 1 ? "border-b border-border/40 dark:border-white/5" : ""}
              `}
            >
              {opt.label}
            </div>
          ))}
          {options.length === 0 && (
            <div className="px-5 py-4 text-xs font-bold text-content-subtle text-center">No hay opciones disponibles</div>
          )}
        </div>
      )}
    </div>
  );
}
