const Chevron = ({ d }) => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
);

const btn = "h-8 min-w-8 px-2 inline-flex items-center justify-center rounded-lg text-content-muted dark:text-white/60 hover:bg-surface-3 hover:text-content dark:hover:bg-white/[0.06] dark:hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none";

export default function Pagination({ page, totalPages, total, limit, onPageChange }) {
    if (!totalPages || totalPages <= 1) return null;

    const startItem = (page - 1) * limit + 1;
    const endItem = Math.min(page * limit, total);
    const n = (v) => Number(v).toLocaleString("es-VE");

    return (
        <div className="shrink-0 px-4 h-12 border-t border-border dark:border-border-dark flex items-center justify-between gap-3 bg-surface-2 dark:bg-surface-dark">
            <div className="text-[12px] text-content-subtle tabular-nums">
                <span className="font-semibold text-content dark:text-white">{n(startItem)}–{n(endItem)}</span> de {n(total)}
            </div>
            <div className="flex items-center gap-0.5">
                <button disabled={page === 1} onClick={() => onPageChange(1)} className={btn} title="Primera página" aria-label="Primera página">
                    <Chevron d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </button>
                <button disabled={page === 1} onClick={() => onPageChange(page - 1)} className={btn} title="Anterior" aria-label="Anterior">
                    <Chevron d="M15 19l-7-7 7-7" />
                </button>
                <span className="px-2 text-[12px] text-content-subtle tabular-nums whitespace-nowrap">
                    Página <span className="font-semibold text-content dark:text-white">{page}</span> de {totalPages}
                </span>
                <button disabled={page === totalPages} onClick={() => onPageChange(page + 1)} className={btn} title="Siguiente" aria-label="Siguiente">
                    <Chevron d="M9 5l7 7-7 7" />
                </button>
                <button disabled={page === totalPages} onClick={() => onPageChange(totalPages)} className={btn} title="Última página" aria-label="Última página">
                    <Chevron d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </button>
            </div>
        </div>
    );
}
