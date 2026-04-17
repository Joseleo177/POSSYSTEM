import { useState, useRef, useEffect } from "react";

export default function CustomSelect({ value, onChange, options, placeholder = "Seleccionar...", className = "", disabled = false }) {
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
    <div ref={ref} className={`relative ${className} ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      {/* Gatillo del Select - Radio Estructurado */}
      <div 
        onClick={() => setOpen(!open)}
        className={`h-10 text-[11px] cursor-pointer flex items-center justify-between transition-all duration-300 border px-3 rounded-lg
          ${open 
            ? "border-brand-500 bg-brand-500/5 ring-1 ring-brand-500/20 shadow-lg shadow-brand-500/5" 
            : "bg-surface-1 dark:bg-white/[0.02] hover:bg-surface-2 dark:hover:bg-white/[0.05] border-border/10 dark:border-white/5"}
        `}
      >
        <span className={selectedOption 
          ? "text-content dark:text-white font-bold uppercase tracking-tight" 
          : "text-content-subtle opacity-40 font-bold uppercase tracking-widest text-[9px]"
        }>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        
        <div className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}>
           <svg className="w-3.5 h-3.5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
           </svg>
        </div>
      </div>

      {/* Menú Desplegable - Radio Estructurado Premium */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-[#1a1c23] border border-border/40 dark:border-white/10 rounded-lg shadow-2xl z-[100] max-h-64 overflow-y-auto scrollbar-none animate-in fade-in slide-in-from-top-2 duration-200 backdrop-blur-3xl">
          <div className="p-1.5 space-y-1">
            {options.map((opt) => {
              const isActive = String(value) === String(opt.value);
              return (
                <div 
                  key={opt.value}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`px-4 py-2 rounded-md cursor-pointer flex items-center justify-between text-[11px] font-bold uppercase tracking-wide transition-all duration-200
                    ${isActive 
                      ? "bg-brand-500 text-black shadow-md shadow-brand-500/20" 
                      : "hover:bg-brand-500/10 dark:hover:bg-white/5 text-content dark:text-white/70 hover:text-brand-500 dark:hover:text-brand-500"}
                  `}
                >
                  <span className="truncate">{opt.label}</span>
                  {isActive && (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              );
            })}
            
            {options.length === 0 && (
              <div className="px-5 py-6 text-center">
                <div className="text-[10px] font-bold text-content-subtle opacity-30 uppercase tracking-widest italic font-bold">No hay resultados</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
