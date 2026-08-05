import { useState, useEffect, useCallback, useRef } from "react";
import { publicApi } from "../services/api";
import { resolveImageUrl, imgRetryOnError } from "../helpers";

const PAGE_SIZE = 24;

// Página que ve el cliente final. Vive fuera de AppProvider/CartProvider: no hay sesión,
// ni carrito, ni permisos. Todo lo que muestra viene de /api/public/catalog/:token.
export default function PublicCatalogPage({ token }) {
    const [store, setStore]           = useState(null);
    const [currencies, setCurrencies] = useState([]);
    const [categories, setCategories] = useState([]);
    const [products, setProducts]     = useState([]);
    const [total, setTotal]           = useState(0);
    const [search, setSearch]         = useState("");
    const [category, setCategory]     = useState("");
    const [loading, setLoading]       = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError]           = useState(null);
    const reqRef = useRef(0);

    const baseCur = currencies.find(c => c.is_base) || null;
    const altCur  = currencies.find(c => !c.is_base) || null;

    // Cabecera de la tienda: una sola vez.
    useEffect(() => {
        let alive = true;
        publicApi.getStore(token)
            .then(r => {
                if (!alive) return;
                setStore(r.data.store);
                setCurrencies(r.data.currencies || []);
                setCategories(r.data.categories || []);
            })
            .catch(() => alive && setError("Este catálogo no está disponible."));
        return () => { alive = false; };
    }, [token]);

    // Productos: se recargan al buscar o cambiar de categoría (con debounce en la búsqueda).
    useEffect(() => {
        const id = ++reqRef.current;
        setLoading(true);
        const t = setTimeout(() => {
            publicApi.getProducts(token, { search, category_id: category, limit: PAGE_SIZE, offset: 0 })
                .then(r => {
                    if (id !== reqRef.current) return; // llegó tarde, ya hay otra búsqueda
                    setProducts(r.data.products || []);
                    setTotal(r.data.total || 0);
                })
                .catch(() => id === reqRef.current && setError("No se pudieron cargar los productos."))
                .finally(() => id === reqRef.current && setLoading(false));
        }, search ? 300 : 0);
        return () => clearTimeout(t);
    }, [token, search, category]);

    const loadMore = useCallback(() => {
        if (loadingMore || products.length >= total) return;
        setLoadingMore(true);
        publicApi.getProducts(token, { search, category_id: category, limit: PAGE_SIZE, offset: products.length })
            .then(r => setProducts(p => [...p, ...(r.data.products || [])]))
            .catch(() => {})
            .finally(() => setLoadingMore(false));
    }, [token, search, category, products.length, total, loadingMore]);

    const fmt = (amount, cur) => {
        if (!cur) return "";
        const value = parseFloat(amount) * (cur.is_base ? 1 : cur.exchange_rate);
        return `${cur.symbol}${value.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center bg-surface-2 dark:bg-surface-dark">
                <div className="w-14 h-14 rounded-2xl bg-danger/10 flex items-center justify-center text-danger">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <p className="text-sm font-black text-content dark:text-white">{error}</p>
                <p className="text-[11px] font-bold text-content-subtle">Verifica el enlace con la tienda.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-surface-2 dark:bg-surface-dark">
            {/* Cabecera de la tienda */}
            <header className="bg-surface dark:bg-surface-dark-2 border-b border-border dark:border-white/5 sticky top-0 z-20">
                <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
                    {store?.logo_url && (
                        <img
                            src={resolveImageUrl(store.logo_url)}
                            alt={store.name}
                            onError={imgRetryOnError}
                            className="w-12 h-12 rounded-xl object-cover shrink-0 border border-border dark:border-white/10"
                        />
                    )}
                    <div className="min-w-0">
                        <h1 className="text-base font-black text-content dark:text-white uppercase tracking-tight truncate">
                            {store?.name || "Catálogo"}
                        </h1>
                        {store?.slogan && (
                            <p className="text-[11px] font-bold text-content-muted italic truncate">{store.slogan}</p>
                        )}
                    </div>
                    {altCur && baseCur && (
                        <div className="ml-auto text-right shrink-0 hidden sm:block">
                            <div className="text-[9px] font-black uppercase tracking-widest text-content-subtle">Tasa</div>
                            <div className="text-[11px] font-black text-brand-500 tabular-nums">
                                {altCur.symbol}{altCur.exchange_rate.toLocaleString("es-VE", { maximumFractionDigits: 2 })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Buscador + categorías */}
                <div className="max-w-5xl mx-auto px-4 pb-3 space-y-2">
                    <div className="relative">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar producto..."
                            className="w-full h-10 pl-10 pr-3 rounded-xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all placeholder:text-content-subtle"
                        />
                    </div>
                    {categories.length > 0 && (
                        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                            <CatChip active={!category} onClick={() => setCategory("")}>Todo</CatChip>
                            {categories.map(c => (
                                <CatChip key={c.id} active={String(category) === String(c.id)} onClick={() => setCategory(String(c.id))}>
                                    {c.name}
                                </CatChip>
                            ))}
                        </div>
                    )}
                </div>
            </header>

            {/* Grilla */}
            <main className="max-w-5xl mx-auto px-4 py-5">
                {loading ? (
                    <div className="py-24 text-center text-[11px] font-black uppercase tracking-widest text-content-subtle">
                        Cargando...
                    </div>
                ) : products.length === 0 ? (
                    <div className="py-24 text-center text-[11px] font-black uppercase tracking-widest text-content-subtle">
                        No se encontraron productos
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                            {products.map(p => (
                                <article
                                    key={p.id}
                                    className={`bg-surface dark:bg-surface-dark-2 rounded-2xl border border-border dark:border-white/5 overflow-hidden shadow-card dark:shadow-none flex flex-col ${!p.available ? "opacity-60" : ""}`}
                                >
                                    {/* Imagen en absoluto: aspect-square es un alto preferido,
                                        no un tope, y una foto vertical estiraría la tarjeta. */}
                                    <div className="aspect-square bg-surface-2 dark:bg-white/5 relative overflow-hidden">
                                        {p.image_url ? (
                                            <img
                                                src={resolveImageUrl(p.image_url)}
                                                alt={p.name}
                                                loading="lazy"
                                                onError={imgRetryOnError}
                                                className="absolute inset-0 w-full h-full object-cover"
                                            />
                                        ) : (
                                            // Sin foto se muestra la inicial sobre un degradado suave: repetir
                                            // el mismo icono gris en decenas de tarjetas hace ver el catálogo
                                            // roto, mientras que la inicial distingue una tarjeta de otra.
                                            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-500/5 to-brand-500/[0.12]">
                                                <span className="text-3xl font-black text-brand-500/30 select-none">
                                                    {p.name.charAt(0)}
                                                </span>
                                            </div>
                                        )}
                                        {!p.available && (
                                            <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-danger text-white text-[9px] font-black uppercase tracking-wide">
                                                Agotado
                                            </span>
                                        )}
                                    </div>
                                    <div className="p-3 flex flex-col gap-1 flex-1">
                                        {p.category_name && (
                                            <span className="text-[9px] font-black uppercase tracking-widest text-brand-500 truncate">
                                                {p.category_name}
                                            </span>
                                        )}
                                        <h2 className="text-[12px] font-black uppercase tracking-tight text-content dark:text-white leading-tight line-clamp-2">
                                            {p.name}
                                        </h2>
                                        <div className="mt-auto pt-1.5">
                                            {/* Un producto sin precio cargado mostraba "Ref.0,00", que en una
                                                vitrina se lee como que es gratis. Mejor invitar a preguntar. */}
                                            {parseFloat(p.price) > 0 ? (
                                                <>
                                                    <div className="text-sm font-black text-content dark:text-white font-display tabular-nums">
                                                        {fmt(p.price, baseCur)}
                                                    </div>
                                                    {altCur && (
                                                        <div className="text-[11px] font-black text-content-muted tabular-nums">
                                                            {fmt(p.price, altCur)}
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="text-[11px] font-black uppercase tracking-wide text-content-muted">
                                                    Consultar precio
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>

                        {products.length < total && (
                            <div className="pt-6 text-center">
                                <button
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    className="h-10 px-6 rounded-xl bg-brand-500 text-black text-[11px] font-black uppercase tracking-widest hover:brightness-105 transition-all disabled:opacity-50"
                                >
                                    {loadingMore ? "Cargando..." : `Ver más (${total - products.length})`}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </main>

            <footer className="max-w-5xl mx-auto px-4 py-8 text-center space-y-1 border-t border-border dark:border-white/5 mt-4">
                {store?.phone && (
                    <p className="text-[12px] font-black text-content dark:text-white">{store.phone}</p>
                )}
                {store?.address && (
                    <p className="text-[11px] font-bold text-content-muted">{store.address}</p>
                )}
                <p className="text-[10px] font-bold text-content-subtle pt-2">
                    Precios sujetos a cambio sin previo aviso.
                </p>
            </footer>
        </div>
    );
}

function CatChip({ active, onClick, children }) {
    return (
        <button
            onClick={onClick}
            className={`h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wide whitespace-nowrap transition-all shrink-0 ${
                active
                    ? "bg-brand-500 text-black"
                    : "bg-surface-2 dark:bg-white/5 text-content-muted hover:text-content dark:hover:text-white"
            }`}
        >
            {children}
        </button>
    );
}