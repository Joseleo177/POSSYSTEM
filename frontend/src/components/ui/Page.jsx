export default function Page({ module = "Módulo", title, subheader, actions, children }) {
    return (
        <div className="h-full overflow-hidden flex flex-col">

            {/* Header */}
            <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between gap-3 border-b border-border/30 dark:border-white/5">
                <div>
                    <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest leading-none mb-1">
                        {module}
                    </div>
                    <h1 className="text-sm font-black uppercase tracking-tight">
                        {title}
                    </h1>
                </div>

                {actions && (
                    <div className="flex gap-2">
                        {actions}
                    </div>
                )}
            </div>

            {/* Sub-header slot (ej. sub-tabs) */}
            {subheader}

            {/* Contenido */}
            <div className="flex-1 overflow-auto flex flex-col px-4 py-2 bg-white/[0.02]">
                {children}
            </div>

        </div>
    );
}
