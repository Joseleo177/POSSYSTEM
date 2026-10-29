import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import Money from "../ui/Money";
import Segmented from "../ui/Segmented";
import { LedgerSkeleton, LedgerEmpty, ledgerRow } from "../ui/Ledger";
import { resolveImageUrl, imgRetryOnError } from "../../helpers/image";
import { toNameCase, fmtBase } from "../../helpers";
import Modal from "../ui/Modal";
import { INPUT } from "../fabrica/shared";
import RecipeSheetModal from "./RecipeSheetModal";
import { fmtPct, foodCostTone } from "./shared";

// Recetas → Platos: las fichas técnicas que se han armado. La lista responde lo que un dueño de
// restaurante pregunta primero: cuánto me cuesta cada plato y cuáles se comen el margen. El
// costo y el precio son los de la sucursal elegida; el food cost se compara con la meta de la
// empresa (Configuración → Punto de venta → Cocina).
//
// Solo salen los platos CON ficha: el usuario pidió (29-10-2026) ver lo que él mete, no el menú
// entero. Los que no tienen se eligen con "Nueva ficha".

const FILTROS = [
    { key: "todos", label: "Todas" },
    { key: "alto",  label: "Sobre la meta" },
];

// Elegir el plato de una ficha nueva: los que se venden y todavía no tienen receta.
function PlatoPicker({ open, platos, money, onPick, onClose }) {
    const [q, setQ] = useState("");
    useEffect(() => { if (open) setQ(""); }, [open]);
    const lista = useMemo(() => {
        const t = sinAcentos(q.trim());
        return platos.filter(p => !t || sinAcentos(p.name).includes(t) || sinAcentos(p.category_name).includes(t));
    }, [platos, q]);

    return (
        <Modal open={open} onClose={onClose} title="Nueva ficha técnica" width={520}>
            <div className="space-y-3">
                <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input value={q} onChange={e => setQ(e.target.value)} className={`${INPUT} pl-9`} autoComplete="off" spellCheck={false}
                        placeholder="¿De qué plato? Sancocho, pabellón…" data-autofocus />
                </div>
                {platos.length === 0 ? (
                    <div className="py-10 text-center px-4">
                        <div className="text-[14px] font-semibold text-content dark:text-white">Todos los platos tienen ficha</div>
                        <div className="text-[13px] text-content-subtle mt-1">Para uno nuevo, créalo en Catálogo como servicio y vuelve aquí.</div>
                    </div>
                ) : lista.length === 0 ? (
                    <p className="py-8 text-center text-[13px] text-content-subtle">Ningún plato sin ficha coincide con «{q.trim()}».</p>
                ) : (
                    <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-border/70 dark:border-white/10 divide-y divide-border/60 dark:divide-white/[0.06]">
                        {lista.map(p => (
                            <button key={p.product_id} type="button" onClick={() => onPick(p)}
                                className="w-full flex items-center gap-3 px-3 py-2 min-h-12 text-left hover:bg-surface-2 dark:hover:bg-white/[0.04]">
                                <Thumb r={p} />
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[13px] font-medium text-content dark:text-white truncate">{toNameCase(p.name)}</span>
                                    <span className="block text-[12px] text-content-subtle truncate">{p.category_name ? toNameCase(p.category_name) : "Sin categoría"}</span>
                                </span>
                                <Money value={money(p.price)} className="text-[13px] text-content dark:text-white shrink-0" />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}

const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Thumb({ r }) {
    return (
        <div className="w-9 h-9 rounded-lg bg-surface-2 dark:bg-white/5 overflow-hidden shrink-0 relative">
            {r.image_url ? (
                <img src={resolveImageUrl(r.image_url)} alt="" loading="lazy" onError={imgRetryOnError}
                    className="absolute inset-0 w-full h-full object-cover" />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-content-subtle/40">
                    {r.name?.charAt(0)}
                </div>
            )}
        </div>
    );
}

/**
 * `sucursal`: el selector de sucursal de la página, que va en la barra de esta vista.
 * `picking` / `onPickClose`: el botón "Nueva ficha" de la página abre el selector de plato.
 */
export default function PlatosView({ warehouseId, sucursal, picking = false, onPickClose, onNew }) {
    const { baseCurrency, notify } = useApp();
    const money = (n) => fmtBase(n, baseCurrency);

    const [rows, setRows] = useState([]);
    const [meta, setMeta] = useState(35);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filtro, setFiltro] = useState("todos");
    const [openId, setOpenId] = useState(null);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let vivo = true;
        setLoading(true);
        api.recipes.list(warehouseId ? { warehouse_id: warehouseId } : {})
            .then(r => { if (!vivo) return; setRows(r.data || []); setMeta(r.meta?.food_cost_target ?? 35); })
            .catch(e => { if (vivo) notify(e?.message || "No se pudieron cargar las recetas", "err"); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [warehouseId, version]);

    const fichas = useMemo(() => rows.filter(r => r.has_recipe), [rows]);
    const sinFicha = useMemo(() => rows.filter(r => !r.has_recipe), [rows]);

    const conteo = useMemo(() => ({
        todos: fichas.length,
        alto: fichas.filter(r => r.food_cost_pct != null && r.food_cost_pct > meta).length,
    }), [fichas, meta]);

    const visibles = useMemo(() => {
        const q = sinAcentos(search.trim());
        return fichas.filter(r => {
            if (filtro === "alto" && !(r.food_cost_pct != null && r.food_cost_pct > meta)) return false;
            return !q || sinAcentos(r.name).includes(q) || sinAcentos(r.category_name).includes(q);
        });
    }, [fichas, search, filtro, meta]);

    // El promedio pondera por precio: es el food cost del menú si se vendiera uno de cada plato.
    const promedio = useMemo(() => {
        const con = rows.filter(r => r.has_recipe && r.price > 0);
        const precio = con.reduce((a, r) => a + r.price, 0);
        return precio > 0 ? Math.round((con.reduce((a, r) => a + r.cost, 0) / precio) * 1000) / 10 : null;
    }, [rows]);

    const vacio = search || filtro !== "todos"
        ? { title: "Nada coincide", hint: "Prueba con otro nombre o quita el filtro." }
        : { title: "Sin fichas técnicas", hint: "Arma la de un plato con «Nueva ficha»: qué lleva, cuánto cuesta y cuánto deja." };

    const toolbar = (
        <div className="shrink-0 px-4 py-2 flex flex-wrap items-center gap-2 border-b border-border/20 dark:border-white/5">
            <div className="relative flex-1 min-w-[180px] max-w-md">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input value={search} onChange={e => setSearch(e.target.value)} className="input h-9 pl-9 text-[13px] w-full"
                    autoComplete="off" spellCheck={false} placeholder="Buscar plato o categoría…" />
            </div>
            {sucursal}
            <div className="w-full sm:w-auto overflow-x-auto scrollbar-hide">
                <Segmented value={filtro} onChange={setFiltro}
                    options={FILTROS.map(f => ({ ...f, count: conteo[f.key] }))} />
            </div>
            <div className="hidden lg:flex items-baseline gap-3 ml-auto text-[12px] text-content-subtle whitespace-nowrap">
                {promedio != null && (
                    <span>Food cost del menú <span className={`text-[14px] font-semibold tabular-nums ${foodCostTone(promedio, meta) || "text-content dark:text-white"}`}>{fmtPct(promedio)}</span></span>
                )}
                <span>Meta <span className="text-[14px] font-semibold tabular-nums text-content dark:text-white">{fmtPct(meta)}</span></span>
            </div>
        </div>
    );

    return (
        <>
            <div className="flex-1 flex flex-col overflow-y-auto lg:overflow-hidden -mx-3 sm:-mx-4 -my-2">
                {toolbar}
                {/* ── Libro (escritorio) ── */}
                <div className="hidden md:flex flex-1 min-h-0 flex-col py-3 px-4">
                    <div className="card-premium overflow-auto flex-1">
                        <table className="table-ledger min-w-[820px]">
                            <thead className="sticky top-0 z-10">
                                <tr>
                                    <th className="pl-4">Plato</th>
                                    <th className="w-[120px] text-right">Precio</th>
                                    <th className="w-[150px] text-right">Costo</th>
                                    <th className="w-[120px] text-right">Food cost</th>
                                    <th className="w-[130px] text-right pr-4">Margen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? <LedgerSkeleton cols={5} rows={8} />
                                    : visibles.length === 0 ? (
                                        <LedgerEmpty cols={5} title={vacio.title} hint={vacio.hint}
                                            onClear={search || filtro !== "todos" ? () => { setSearch(""); setFiltro("todos"); } : undefined} />
                                    ) : visibles.map(r => {
                                        const alto = r.food_cost_pct != null && r.food_cost_pct > meta;
                                        return (
                                            <tr key={r.product_id} {...ledgerRow(() => setOpenId(r.product_id), alto ? "#ef4444" : undefined)}>
                                                <td className="pl-4 max-w-0">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <Thumb r={r} />
                                                        <div className="min-w-0">
                                                            <div className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(r.name)}</div>
                                                            <div className="text-[12px] text-content-subtle truncate">
                                                                {r.category_name ? toNameCase(r.category_name) : "Sin categoría"}
                                                                {r.has_recipe && ` · ${r.lines === 1 ? "1 ingrediente" : `${r.lines} ingredientes`}`}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="text-right"><Money value={money(r.price)} className="text-[13px] text-content dark:text-white" /></td>
                                                <td className="text-right">
                                                    {r.has_recipe ? (
                                                        <>
                                                            <Money value={money(r.cost)} className="text-[13px] text-content dark:text-white" />
                                                            {r.missing_costs > 0 && (
                                                                <div className="text-[12px] text-amber-700 dark:text-amber-400 whitespace-nowrap">
                                                                    {r.missing_costs === 1 ? "1 insumo sin costo" : `${r.missing_costs} insumos sin costo`}
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : <span className="text-[12px] text-content-subtle">Sin receta</span>}
                                                </td>
                                                <td className="text-right">
                                                    {r.food_cost_pct != null
                                                        ? <span className={`text-[13px] font-semibold tabular-nums ${foodCostTone(r.food_cost_pct, meta) || "text-content dark:text-white"}`}>{fmtPct(r.food_cost_pct)}</span>
                                                        : <span className="text-[13px] text-content-subtle">—</span>}
                                                </td>
                                                <td className="text-right pr-4">
                                                    {r.margin != null
                                                        ? <Money value={money(r.margin)} className="text-[13px] text-content dark:text-white" />
                                                        : <span className="text-[13px] text-content-subtle">—</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── Tarjetas (teléfono) ── */}
                <div className="md:hidden px-3 py-3 space-y-2">
                    {promedio != null && (
                        <div className="flex items-baseline justify-between px-1 pb-1 text-[12px] text-content-subtle">
                            <span>Food cost del menú <span className={`text-[14px] font-semibold tabular-nums ${foodCostTone(promedio, meta) || "text-content dark:text-white"}`}>{fmtPct(promedio)}</span></span>
                            <span>Meta <span className="text-[14px] font-semibold tabular-nums text-content dark:text-white">{fmtPct(meta)}</span></span>
                        </div>
                    )}
                    {loading ? (
                        <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                    ) : visibles.length === 0 ? (
                        <div className="py-16 text-center px-6">
                            <div className="text-[14px] font-semibold text-content dark:text-white">{vacio.title}</div>
                            <div className="text-[13px] text-content-subtle mt-1">{vacio.hint}</div>
                            {onNew && !search && filtro === "todos" && (
                                <button onClick={onNew} className="btn-outline h-10 px-4 rounded-lg text-[13px] font-medium mt-4">Nueva ficha</button>
                            )}
                        </div>
                    ) : visibles.map(r => {
                        const alto = r.food_cost_pct != null && r.food_cost_pct > meta;
                        return (
                            <div key={r.product_id} role="button" tabIndex={0} onClick={() => setOpenId(r.product_id)}
                                onKeyDown={e => { if (e.key === "Enter") setOpenId(r.product_id); }}
                                style={alto ? { boxShadow: "inset 3px 0 0 #ef4444" } : undefined}
                                className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3 active:scale-[0.99] transition-transform">
                                <div className="flex items-center gap-3">
                                    <Thumb r={r} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(r.name)}</span>
                                            {r.food_cost_pct != null
                                                ? <span className={`text-[14px] font-semibold tabular-nums shrink-0 ${foodCostTone(r.food_cost_pct, meta) || "text-content dark:text-white"}`}>{fmtPct(r.food_cost_pct)}</span>
                                                : <span className="text-[12px] text-content-subtle shrink-0">Sin receta</span>}
                                        </div>
                                        <div className="mt-0.5 flex items-center justify-between gap-3 text-[12px] text-content-subtle">
                                            <span className="truncate">{r.category_name ? toNameCase(r.category_name) : "Sin categoría"}</span>
                                            <span className="shrink-0 whitespace-nowrap">
                                                {r.has_recipe ? <>Costo <Money value={money(r.cost)} /> de <Money value={money(r.price)} /></> : <Money value={money(r.price)} />}
                                            </span>
                                        </div>
                                        {r.missing_costs > 0 && (
                                            <div className="text-[12px] text-amber-700 dark:text-amber-400">
                                                {r.missing_costs === 1 ? "1 insumo sin costo" : `${r.missing_costs} insumos sin costo`}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <RecipeSheetModal productId={openId} warehouseId={warehouseId} meta={meta}
                onClose={() => setOpenId(null)}
                onSaved={() => { setOpenId(null); setVersion(v => v + 1); }} />

            <PlatoPicker open={picking} platos={sinFicha} money={money} onClose={onPickClose}
                onPick={p => { onPickClose?.(); setOpenId(p.product_id); }} />
        </>
    );
}
