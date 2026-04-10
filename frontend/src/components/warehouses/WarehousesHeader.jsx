export default function WarehousesHeader({ subTab, setSubTab }) {
    return (
        <div className="shrink-0 px-4 py-1.5 flex items-center gap-1 border-b border-border/20 dark:border-white/5 bg-surface-2/50 dark:bg-white/[0.02]">
            {[["almacenes", "Almacenes"], ["transferencias", "Transferencias"]].map(([key, label]) => (
                <button
                    key={key}
                    onClick={() => setSubTab(key)}
                    className={`px-4 py-1 rounded-full text-[11px] font-black uppercase tracking-wide whitespace-nowrap transition-all ${
                        subTab === key || (key === "almacenes" && subTab === "stock")
                            ? "bg-brand-500 text-black shadow-sm"
                            : "text-content-muted dark:text-white/30 hover:text-content dark:hover:text-white hover:bg-surface-3 dark:hover:bg-white/5"
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
