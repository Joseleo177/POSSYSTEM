export default function Page({ module = "Módulo", title, subheader, actions, children }) {
    return (
        <div className="h-full overflow-hidden flex flex-col">

            {/* Header */}
            <div className="shrink-0 px-3 sm:px-4 pt-3 pb-2 flex items-center justify-between gap-2 sm:gap-3 border-b border-border/30 dark:border-white/5 min-w-0">
                <div className="min-w-0 shrink-0 max-w-[40%] xs:max-w-none">
                    <div className="text-[9px] sm:text-[10px] font-black text-brand-500 uppercase tracking-widest leading-none mb-0.5 sm:mb-1 truncate">
                        {module}
                    </div>
                    <h1 className="text-xs sm:text-sm font-black uppercase tracking-tight truncate">
                        {title}
                    </h1>
                </div>

                {actions && (
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 max-w-full overflow-x-auto no-scrollbar py-0.5 ml-auto">
                        {actions}
                    </div>
                )}
            </div>

            {/* Sub-header slot (ej. sub-tabs) */}
            {subheader}

            {/* Contenido */}
            <div className="flex-1 min-h-0 overflow-auto flex flex-col px-3 sm:px-4 py-2 bg-white/[0.02]">
                {children}
            </div>

        </div>
    );
}

