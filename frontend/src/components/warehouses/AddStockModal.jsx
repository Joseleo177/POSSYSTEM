import { useState, useEffect, useCallback } from "react";
import Modal from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { useDebounce } from "../../hooks/useDebounce";
import { api } from "../../services/api";
import { resolveImageUrl, imgRetryOnError, toNameCase } from "../../helpers";
import { isIntegerUnit, fmtQtyUnit } from "../../helpers/unitFormatter";

// Dar de alta un producto en un almacén: se elige el producto y, recién elegido, la existencia
// con la que entra. La lista solo trae lo que todavía NO está en este almacén.

const INPUT = "w-full h-11 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[14px] text-content dark:text-white placeholder:text-content-subtle/50 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";
const LUPA = "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z";

function Foto({ p, size = "w-10 h-10" }) {
    return (
        <span className={`${size} shrink-0 rounded-lg overflow-hidden bg-surface-2 dark:bg-white/[0.05] border border-border/60 dark:border-white/[0.06] flex items-center justify-center relative`}>
            {p.image_url
                ? <img src={resolveImageUrl(p.image_url)} alt="" loading="lazy" onError={imgRetryOnError} className="absolute inset-0 w-full h-full object-cover" />
                : <span className="text-[13px] font-semibold text-content-subtle/60">{p.name?.charAt(0)?.toUpperCase()}</span>}
        </span>
    );
}

export default function AddStockModal({
    open, onClose, selectedWarehouse,
    addStockProduct, clearAddStockProduct,
    selectAddStockProduct,
    addStockForm, setAddStockForm,
    doAddStock, savingStock,
}) {
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounce(search, 400);
    const [results, setResults] = useState([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadingList, setLoadingList] = useState(false);
    const LIMIT = 30;

    const loadProducts = useCallback(async (pageNum = 0, append = false) => {
        if (!open || addStockProduct) return;
        if (pageNum === 0) setLoadingList(true);
        else setLoadingMore(true);

        try {
            const params = {
                search: debouncedSearch,
                limit: LIMIT,
                offset: pageNum * LIMIT,
                is_service: false,
            };
            if (selectedWarehouse) params.not_in_warehouse_id = selectedWarehouse.id;

            const r = await api.products.getAll(params);
            const prods = r.data || [];
            setResults(prev => append ? [...prev, ...prods] : prods);
            setHasMore(prods.length === LIMIT);
            setPage(pageNum);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingList(false);
            setLoadingMore(false);
        }
    }, [open, addStockProduct, debouncedSearch, selectedWarehouse]);

    useEffect(() => {
        if (open && !addStockProduct) loadProducts(0, false);
    }, [open, addStockProduct, debouncedSearch, loadProducts]);

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        if (scrollHeight - scrollTop <= clientHeight + 50) {
            if (hasMore && !loadingMore && !loadingList) {
                loadProducts(page + 1, true);
            }
        }
    };

    // Limpiar buscador al abrir/cerrar
    useEffect(() => {
        if (!open) {
            setSearch("");
            setResults([]);
        }
    }, [open]);

    const p = addStockProduct;
    const intUnit = isIntegerUnit(p?.unit);
    const unidad = p ? fmtQtyUnit(2, p.unit).replace(/^[\d.,\s]+/, "").toLowerCase() : "";
    const almacen = toNameCase(selectedWarehouse?.name) || "el almacén";

    const pie = (
        <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-outline h-11 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
            {p && (
                <button type="button" onClick={doAddStock} disabled={savingStock}
                    className="btn-accent flex-1 h-11 rounded-lg text-[14px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99] transition">
                    {savingStock && <Spinner />}
                    {savingStock ? "Agregando…" : `Agregar a ${almacen}`}
                </button>
            )}
        </div>
    );

    return (
        <Modal open={open} onClose={onClose} title="Agregar producto al almacén" width={480} footer={pie}>
            <p className="-mt-1 mb-4 text-[13px] text-content-subtle">
                Se agrega a <span className="font-medium text-content dark:text-white">{almacen}</span>.
                {!p && " Solo aparecen los productos que todavía no tiene."}
            </p>

            {p ? (
                <div className="space-y-5">
                    {/* Producto elegido */}
                    <div className="flex items-center gap-3 rounded-xl border border-border/70 dark:border-white/[0.08] p-3">
                        <Foto p={p} size="w-12 h-12" />
                        <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(p.name)}</p>
                            <p className="text-[12px] text-content-subtle truncate">
                                {toNameCase(p.category_name) || "Sin categoría"} · en total hay {fmtQtyUnit(p.stock, p.unit).toLowerCase()}
                            </p>
                        </div>
                        <button type="button" onClick={clearAddStockProduct}
                            className="shrink-0 h-9 px-3 rounded-lg text-[13px] font-medium text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/[0.06] transition-colors">
                            Cambiar
                        </button>
                    </div>

                    {/* Existencia inicial */}
                    <div>
                        <label htmlFor="alta-cantidad" className="block text-[12px] font-medium text-content-subtle mb-1.5">
                            Existencia inicial en {almacen}
                        </label>
                        <div className="relative">
                            <input
                                id="alta-cantidad"
                                data-autofocus
                                type="text"
                                inputMode={intUnit ? "numeric" : "decimal"}
                                autoComplete="off"
                                value={addStockForm.qty}
                                onChange={e => {
                                    let v = String(e.target.value).replace(/[^0-9.,]/g, "").replace(",", ".");
                                    if (intUnit) v = v.replace(/\..*$/, "");
                                    setAddStockForm(prev => ({ ...prev, qty: v }));
                                }}
                                onKeyDown={e => { if (e.key === "Enter") doAddStock(); }}
                                placeholder="0"
                                className={`${INPUT} pl-3.5 pr-24 text-[16px] font-semibold tabular-nums`}
                            />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-content-subtle pointer-events-none">{unidad}</span>
                        </div>
                        <p className="mt-1.5 text-[12px] text-content-subtle">
                            Déjalo en 0 si todavía no llegó: la mercancía entra luego por Compras o Ajustes.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="relative">
                        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={LUPA} /></svg>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por nombre o código"
                            className={`${INPUT} pl-10 pr-3.5`}
                            autoComplete="off"
                            spellCheck={false}
                            data-autofocus
                        />
                    </div>

                    <div
                        className="max-h-72 overflow-y-auto rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]"
                        onScroll={handleScroll}
                    >
                        {loadingList ? (
                            <div className="py-10 flex items-center justify-center gap-2.5 text-[13px] text-content-subtle">
                                <Spinner /> Buscando…
                            </div>
                        ) : results.length === 0 ? (
                            <div className="py-10 px-6 text-center">
                                <p className="text-[14px] font-semibold text-content dark:text-white">
                                    {search ? "Sin resultados" : "No hay productos por agregar"}
                                </p>
                                <p className="mt-1 text-[13px] text-content-subtle">
                                    {search ? "Prueba con otro nombre o código." : "Todos los productos ya están en este almacén."}
                                </p>
                            </div>
                        ) : (
                            results.map(r => (
                                <button
                                    type="button"
                                    key={r.id}
                                    onClick={() => selectAddStockProduct(r)}
                                    className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-surface-2/70 dark:hover:bg-white/[0.03] transition-colors"
                                >
                                    <Foto p={r} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13px] font-medium text-content dark:text-white truncate">{toNameCase(r.name)}</span>
                                        <span className="block text-[12px] text-content-subtle truncate">{toNameCase(r.category_name) || "Sin categoría"}</span>
                                    </span>
                                    <svg className="w-4 h-4 shrink-0 text-content-subtle/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                </button>
                            ))
                        )}
                        {loadingMore && (
                            <div className="py-3 flex items-center justify-center gap-2 text-[12px] text-content-subtle">
                                <Spinner /> Cargando más…
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    );
}
