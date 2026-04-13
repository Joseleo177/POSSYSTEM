const SHORTCUTS = [
    { k: "F1",  l: "Buscar"  },
    { k: "F2",  l: "Cliente" },
    { k: "F4",  l: "Pausar"  },
    { k: "F10", l: "Cobrar"  },
    { k: "Esc", l: "Limpiar" },
];

export default function KeyboardLegend() {
    return (
        <div className="px-6 py-3 border-t border-border/40 dark:border-white/5 bg-surface-1 dark:bg-white/[0.02] flex gap-5 overflow-x-auto scrollbar-hide shrink-0 rounded-b-[40px] mt-auto">
            {SHORTCUTS.map(s => (
                <div key={s.k} className="flex items-center gap-2 shrink-0">
                    <kbd className="px-2 py-0.5 rounded-lg bg-white dark:bg-white/10 border-b-2 border-black/10 dark:border-white/10 text-[10px] font-black text-brand-500 shadow-sm">{s.k}</kbd>
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-40 dark:text-white">{s.l}</span>
                </div>
            ))}
        </div>
    );
}
