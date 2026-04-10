import PurchaseOriginInfo from "./PurchaseOriginInfo";
import PurchaseItemsTable from "./PurchaseItemsTable";

export default function PurchaseDetails({ state }) {
    const { detail, setView } = state;

    if (!detail) return null;

    return (
        <div className="h-full flex flex-col">

            {/* Header */}
            <div className="shrink-0 px-4 pt-3 pb-2 flex items-center gap-3 border-b border-border/30 dark:border-white/5">
                <button
                    onClick={() => setView("list")}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-2 dark:bg-white/5 text-content-subtle hover:bg-brand-500 hover:text-black transition-all border border-border/40"
                    title="Volver"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </button>

                <div>
                    <div className="text-[11px] font-black text-brand-500 uppercase tracking-wide leading-none mb-0.5">
                        MÓDULO DE COMPRAS
                    </div>
                    <h2 className="text-sm font-black text-content dark:text-white uppercase tracking-tight leading-none">
                        Recibo de Compra <span className="text-warning">#{detail.id}</span>
                    </h2>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
                <PurchaseOriginInfo detail={detail} />
                <PurchaseItemsTable detail={detail} />
            </div>

        </div>
    );
}
