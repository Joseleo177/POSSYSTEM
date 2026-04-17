export default function WarehousesHeader({ subTab, setSubTab }) {
    return (
        <div className="shrink-0 px-4 flex items-center gap-1 border-b border-border/20 dark:border-white/5 bg-white/[0.02]">
            {[["almacenes", "Almacenes"], ["transferencias", "Transferencias"]].map(([key, label]) => (
                <button
                    key={key}
                    onClick={() => setSubTab(key)}
                    className={["px-4 py-2 text-[11px] font-black uppercase tracking-wide border-b-2 transition-all",
                        (subTab === key || (key === "almacenes" && subTab === "stock"))
                            ? "border-brand-500 text-brand-500"
                            : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
                    ].join(" ")}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
