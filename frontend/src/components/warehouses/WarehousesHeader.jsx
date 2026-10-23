export default function WarehousesHeader({ subTab, setSubTab }) {
    return (
        <div className="shrink-0 px-1 sm:px-4 flex items-center gap-1 border-b border-border/20 dark:border-white/5 bg-white/[0.02] overflow-x-auto scrollbar-hide">
            {[["almacenes", "Almacenes"], ["transferencias", "Transferencias"], ["movimientos", "Movimientos"]].map(([key, label]) => (
                <button
                    key={key}
                    onClick={() => setSubTab(key)}
                    className={["shrink-0 px-3 sm:px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-all",
                        (subTab === key || (key === "almacenes" && subTab === "stock"))
                            ? "border-brand-500 text-brand-700 dark:text-brand-300"
                            : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
                    ].join(" ")}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
