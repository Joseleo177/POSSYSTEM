// Opción de categoría del desplegable de filtros del catálogo.
export default function CatOption({ active, onClick, children }) {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all flex items-center justify-between gap-2 ${active
                    ? "bg-brand-500 text-black"
                    : "text-content-muted hover:bg-surface-2 dark:hover:bg-white/5 hover:text-content dark:hover:text-white"
                }`}
        >
            <span className="truncate">{children}</span>
            {active && (
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            )}
        </button>
    );
}
