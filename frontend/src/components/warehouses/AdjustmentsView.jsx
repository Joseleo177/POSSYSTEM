import { useState, useEffect, useCallback, useMemo } from "react";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import CustomSelect from "../ui/CustomSelect";
import { useDebounce } from "../../hooks/useDebounce";
import { isIntegerUnit } from "../../helpers/unitFormatter";
import { resolveImageUrl, imgRetryOnError } from "../../helpers/image";
import { useApp } from "../../context/AppContext";
import { printCountSheet } from "../../helpers/printCountSheet";
import { toNameCase } from "../../helpers";
import StockQty, { StockBand, splitQty } from "../ui/StockQty";
import { fmtDateShort } from "../../helpers/dates";
import ProductMovementsModal from "./ProductMovementsModal";
import SessionHistory from "./SessionHistory";
import { KindIcon, Qty } from "./ProductKardex";
import { describe, reasonLabel, fmtCant, unidadCorta, fmtHora } from "./movementMeta";

// El conteo físico ya no es un motivo de salida o de entrada: es su propio modo, en el que se
// escribe lo contado y el sistema calcula la diferencia (y su signo).
const REASONS_OUT = [
    { value: "merma",       label: "Merma o rotura" },
    { value: "vencimiento", label: "Producto vencido" },
    { value: "consumo",     label: "Consumo interno" },
    { value: "robo",        label: "Robo o pérdida" },
];
const REASONS_IN = [
    { value: "compra",        label: "Compra o recepción" },
    { value: "devolucion",    label: "Devolución de cliente" },
    { value: "produccion",    label: "Producción interna" },
    { value: "transferencia", label: "Transferencia recibida" },
];

const MODES = [
    { key: "out",   label: "Salida",  reason: "merma",  icon: "M20 12H4", tone: "text-red-600 dark:text-red-400" },
    { key: "in",    label: "Entrada", reason: "compra", icon: "M12 4v16m8-8H4", tone: "text-emerald-600 dark:text-emerald-400" },
    { key: "count", label: "Conteo",  reason: "conteo", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4", tone: "text-brand-600 dark:text-brand-400" },
];

// Lo que se teclea en la cantidad: entero en unidades contables; en peso y volumen un solo
// separador decimal (coma o punto) y hasta 3 decimales.
const limpiarCantidad = (v, unit) => {
    let t = String(v).replace(/[^\d.,]/g, "");
    if (isIntegerUnit(unit)) return t.replace(/[.,].*$/, "");
    const i = t.search(/[.,]/);
    if (i >= 0) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/[.,]/g, "").slice(0, 3);
    return t;
};
const leerCantidad = (v) => parseFloat(String(v).replace(",", "."));

const fmt = n => Number(n || 0).toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

export default function AdjustmentsView({ selectedWarehouse, notify, onChangeWarehouse, onSessionChange }) {
    // Las categorías ya viven en el contexto y se cargan una vez al entrar: no hace falta
    // pedirlas otra vez desde esta pantalla.
    const { categories, companyInfo } = useApp();
    const [allProducts, setAllProducts]         = useState([]);
    const [loadingList, setLoadingList]         = useState(false);
    const [search, setSearch]                   = useState("");
    // El filtro lo resuelve el backend (getProducts ya acepta category_id): filtrar en el
    // cliente solo escondería productos de la página cargada y dejaría fuera el resto.
    const [categoryId, setCategoryId]           = useState("");
    // Lista o cuadrícula con foto. Se recuerda entre sesiones, igual que en el Catálogo:
    // quien ajusta inventario con el producto en la mano se guía por la imagen, y quien
    // trabaja con nombres prefiere la lista compacta. Clave propia para no pisar la del
    // Catálogo, que es otra pantalla y otra preferencia.
    const [viewMode, setViewMode]               = useState(() => localStorage.getItem("adjustments_view") || "list");
    useEffect(() => { localStorage.setItem("adjustments_view", viewMode); }, [viewMode]);
    const debouncedSearch = useDebounce(search, 400);
    const [page, setPage]                       = useState(0);
    const [hasMore, setHasMore]                 = useState(true);
    const [loadingMore, setLoadingMore]         = useState(false);
    
    const [selectedProduct, setSelectedProduct] = useState(null);
    // En un teléfono el formulario no cabe debajo de la lista: a la lista le quedaban unos
    // pocos píxeles y recorrer el inventario era imposible. Ahí el panel sube como hoja
    // inferior —al tocar un producto, o con el chip de la sesión— y la lista se queda con
    // toda la pantalla. En escritorio no cambia nada: sigue siendo la columna de la derecha.
    const [showLinesMobile, setShowLinesMobile]  = useState(false);
    const [form, setForm]                       = useState({ quantity: "", type: "out", reason: "merma", notes: "" });
    const [saving, setSaving]                   = useState(false);
    // Historial del producto: la ventana completa y las últimas líneas bajo el formulario.
    const [historyOf, setHistoryOf]             = useState(null);
    const [recentMoves, setRecentMoves]         = useState({ loading: false, rows: [] });
    const LIMIT = 50;

    // Sesión activa
    const [session, setSession]         = useState(null);   // null = sin sesión
    const [loadingSession, setLoadingSession] = useState(true);
    const [openingSession, setOpeningSession] = useState(false);
    const [closingSession, setClosingSession] = useState(false);

    // Historial (tab)
    const [tab, setTab]           = useState("ajuste");   // "ajuste" | "historial"
    const [history, setHistory]   = useState([]);
    const [loadingHist, setLoadingHist] = useState(false);

    const reasons = form.type === "out" ? REASONS_OUT : REASONS_IN;

    // Otro producto: la cantidad y la nota eran del anterior. El modo y el motivo se quedan,
    // porque en un conteo o una merma larga se repiten producto tras producto.
    useEffect(() => {
        setForm(f => ({ ...f, quantity: "", notes: "" }));
    }, [selectedProduct?.id]);

    // Últimos movimientos del producto en este almacén: sirven para ver si lo que se va a
    // registrar ya se registró (o si una venta reciente explica la diferencia del conteo).
    useEffect(() => {
        if (!selectedProduct || !selectedWarehouse) { setRecentMoves({ loading: false, rows: [] }); return; }
        let vivo = true;
        setRecentMoves({ loading: true, rows: [] });
        api.warehouses.movements({ product_id: selectedProduct.id, warehouse_id: selectedWarehouse.id, limit: 4 })
            .then(r => { if (vivo) setRecentMoves({ loading: false, rows: r.data?.rows || [] }); })
            .catch(() => { if (vivo) setRecentMoves({ loading: false, rows: [] }); });
        return () => { vivo = false; };
    }, [selectedProduct?.id, selectedWarehouse?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Lo que hay, lo que va a quedar y si se puede registrar. En Conteo la cantidad escrita es
    // la existencia final y el movimiento es la diferencia.
    const calc = useMemo(() => {
        const p = selectedProduct;
        if (!p) return { stock: 0, hasQty: false, q: 0, delta: 0, after: 0, error: "", valid: false, cta: "" };
        const stock = parseFloat(p.stock) || 0;
        const q = leerCantidad(form.quantity);
        const hasQty = form.quantity !== "" && !isNaN(q);
        const delta = !hasQty ? 0
            : form.type === "count" ? parseFloat((q - stock).toFixed(4))
            : form.type === "in" ? q : -q;
        const after = parseFloat((stock + delta).toFixed(4));
        const error = hasQty && form.type === "out" && q > stock
            ? `Solo hay ${fmtCant(stock, p.unit)} ${unidadCorta(p.unit, stock)} en este almacén.`
            : "";
        const valid = hasQty && !error && (form.type === "count" ? delta !== 0 : q > 0);
        const n = fmtCant(q, p.unit);
        const cta = !hasQty ? (form.type === "count" ? "Escribe la cantidad contada" : "Escribe la cantidad")
            : form.type === "count" ? (delta === 0 ? "Sin diferencia que ajustar" : `Ajustar a ${n} (${delta > 0 ? "+" : "−"}${fmtCant(delta, p.unit)})`)
            : q <= 0 ? "Escribe la cantidad"
            : `Registrar ${form.type === "in" ? "entrada" : "salida"} de ${n} ${unidadCorta(p.unit, q)}`;
        return { stock, hasQty, q: hasQty ? q : 0, delta, after, error, valid, cta };
    }, [selectedProduct, form.quantity, form.type]);

    // Botones − y +: de a una unidad, para tablets y para correcciones rápidas.
    const paso = (dir) => setForm(f => {
        const actual = leerCantidad(f.quantity) || 0;
        const n = Math.max(0, actual + dir);
        const txt = isIntegerUnit(selectedProduct?.unit) ? String(Math.round(n)) : String(parseFloat(n.toFixed(3))).replace(".", ",");
        return { ...f, quantity: txt };
    });

    // Productos ya tocados en la sesión abierta, con cuántos movimientos lleva cada uno.
    // En un conteo físico largo la lista se recorre varias veces y es fácil ajustar dos veces
    // el mismo producto o saltarse uno; marcarlos evita tener que recordarlo.
    //
    // Se calcula desde session.lines, que ya viene con la sesión activa: no hace falta pedir
    // nada extra ni guardar estado aparte, y al cerrar la sesión la marca desaparece sola.
    const adjustedCount = useMemo(() => {
        const m = new Map();
        for (const l of session?.lines || []) {
            m.set(l.product_id, (m.get(l.product_id) || 0) + 1);
        }
        return m;
    }, [session]);

    const loadProducts = useCallback(async (pageNum = 0, append = false) => {
        if (!selectedWarehouse) return;
        if (pageNum === 0) setLoadingList(true);
        else setLoadingMore(true);
        
        try {
            const r = await api.warehouses.getProducts(selectedWarehouse.id, {
                search: debouncedSearch,
                ...(categoryId ? { category_id: categoryId } : {}),
                limit: LIMIT,
                offset: pageNum * LIMIT,
                simple_only: true // excluye combos y servicios desde backend
            });
            const prods = r.data || [];
            setAllProducts(prev => append ? [...prev, ...prods] : prods);
            setHasMore(prods.length === LIMIT);
            setPage(pageNum);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingList(false);
            setLoadingMore(false);
        }
    }, [selectedWarehouse?.id, debouncedSearch, categoryId]);

    // Efecto para buscar y cargar inicial
    useEffect(() => {
        if (!selectedWarehouse) return;
        loadProducts(0, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedWarehouse?.id, debouncedSearch, categoryId]);

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        if (scrollHeight - scrollTop <= clientHeight + 50) {
            if (hasMore && !loadingMore && !loadingList) {
                loadProducts(page + 1, true);
            }
        }
    };

    // ── Verificar sesión activa ───────────────────────────────────
    const loadActiveSession = useCallback(async () => {
        if (!selectedWarehouse) return;
        setLoadingSession(true);
        try {
            const r = await api.warehouses.sessions.getActive(selectedWarehouse.id);
            setSession(r.data);
            onSessionChange?.(r.data);
        } catch {}
        finally { setLoadingSession(false); }
    }, [selectedWarehouse?.id]);

    useEffect(() => {
        if (!selectedWarehouse) return;
        setSelectedProduct(null);
        setSearch("");
        setAllProducts([]);
        setSession(null);
        setTab("ajuste");
        loadActiveSession();
    }, [selectedWarehouse?.id]);

    // ── Abrir sesión ──────────────────────────────────────────────
    const handleOpenSession = async () => {
        setOpeningSession(true);
        try {
            const r = await api.warehouses.sessions.open(selectedWarehouse.id);
            setSession(r.data);
            onSessionChange?.(r.data);
        } catch (e) { notify(e.message, "err"); }
        finally { setOpeningSession(false); }
    };

    // ── Planilla de conteo ────────────────────────────────────────
    // La lista de la pantalla está paginada, así que se vuelve a pedir con los mismos filtros
    // y sin tope práctico: la hoja tiene que traer TODO lo que hay que contar, no la primera
    // página que alcanzó a cargar el scroll.
    const [printing, setPrinting] = useState(false);
    const imprimirPlanilla = useCallback(async () => {
        if (!selectedWarehouse) return;
        setPrinting(true);
        try {
            const r = await api.warehouses.getProducts(selectedWarehouse.id, {
                search: debouncedSearch,
                ...(categoryId ? { category_id: categoryId } : {}),
                limit: 1000,
                simple_only: true,
            });
            printCountSheet(r.data || [], {
                warehouseName: selectedWarehouse.name,
                categoryName: (categories || []).find(c => String(c.id) === String(categoryId))?.name,
                search: debouncedSearch,
            }, companyInfo);
        } catch (e) {
            notify?.(e.message || "No se pudo generar la planilla", "err");
        } finally {
            setPrinting(false);
        }
    }, [selectedWarehouse, debouncedSearch, categoryId, categories, companyInfo, notify]);

    // ── Registrar ajuste ──────────────────────────────────────────
    const handleSave = async () => {
        if (saving) return;
        if (!selectedProduct) return notify("Selecciona un producto", "err");
        if (!calc.valid) { if (calc.error) notify(calc.error, "err"); return; }
        const esConteo = form.type === "count";
        const type = esConteo ? (calc.delta > 0 ? "in" : "out") : form.type;
        const qtyToSend = Math.abs(calc.delta);
        const reason = esConteo ? "conteo" : form.reason;

        let activeSession = session;

        // Si no hay sesión, abrirla automáticamente
        if (!activeSession) {
            try {
                const r = await api.warehouses.sessions.open(selectedWarehouse.id);
                activeSession = r.data;
                setSession(r.data);
                onSessionChange?.(r.data);
            } catch (e) { return notify(e.message, "err"); }
        }

        setSaving(true);
        try {
            const r = await api.warehouses.sessions.addLine(
                selectedWarehouse.id, activeSession.id,
                { product_id: selectedProduct.id, qty: qtyToSend, type, reason, notes: form.notes }
            );
            const line = r.data;

            // Actualizar sesión local con la nueva línea
            setSession(prev => ({
                ...prev,
                lines: [...(prev?.lines || []), line],
                line_count: (prev?.line_count || 0) + 1,
            }));
            onSessionChange?.(s => s ? { ...s, line_count: (s.line_count || 0) + 1 } : s);

            // Actualizar stock en lista de productos
            setAllProducts(prev => prev.map(p =>
                p.id === selectedProduct.id
                    ? { ...p, stock: parseFloat(line.qty_after) }
                    : p
            ));

            notify(`${selectedProduct.name}: ${calc.delta > 0 ? "+" : "−"}${fmtCant(calc.delta, selectedProduct.unit)} · quedan ${fmtCant(line.qty_after, selectedProduct.unit)}`);
            setSelectedProduct(null);
            setForm(f => ({ ...f, quantity: "", notes: "" }));
        } catch (e) { notify(e.message, "err"); }
        finally { setSaving(false); }
    };

    // ── Cerrar sesión ─────────────────────────────────────────────
    const handleCloseSession = async () => {
        if (!session) return;
        setClosingSession(true);
        try {
            await api.warehouses.sessions.close(selectedWarehouse.id, session.id);
            notify("Sesión cerrada correctamente");
            setSession(null);
            onSessionChange?.(null);
            setSelectedProduct(null);
        } catch (e) { notify(e.message, "err"); }
        finally { setClosingSession(false); }
    };

    // ── Cargar historial ──────────────────────────────────────────
    const loadHistory = useCallback(async () => {
        if (!selectedWarehouse) return;
        setLoadingHist(true);
        try {
            const r = await api.warehouses.sessions.getAll(selectedWarehouse.id);
            setHistory(r.data || []);
        } catch {}
        finally { setLoadingHist(false); }
    }, [selectedWarehouse?.id]);

    useEffect(() => {
        if (tab === "historial") loadHistory();
    }, [tab, loadHistory]);

    if (!selectedWarehouse) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <svg className="w-10 h-10 text-content-subtle opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                <p className="text-[12px] font-bold text-content-subtle">Selecciona un almacén</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-white/[0.01]">

            {/* ── Cabecera: pestañas a la izquierda, sesión y almacén a la derecha ──
                Antes eran tres franjas apiladas (almacén, pestañas y un aviso de sesión). El
                nombre del almacén ya va en el título de la página, y la sesión es un estado de
                la pantalla, no un paso previo: el primer movimiento la abre solo. */}
            <div className="shrink-0 px-4 border-b border-border/60 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-x-4">
                <div className="flex -mb-px">
                    {[{ key: "ajuste", label: "Movimiento" }, { key: "historial", label: "Historial de sesiones" }].map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className={`px-3 lg:px-4 h-11 text-[13px] font-medium transition-colors border-b-2 whitespace-nowrap ${
                                tab === t.key
                                    ? "border-brand-500 text-brand-700 dark:text-brand-300"
                                    : "border-transparent text-content-subtle hover:text-content dark:hover:text-white"
                            }`}>
                            <span className="sm:hidden">{t.key === "historial" ? "Historial" : t.label}</span>
                            <span className="hidden sm:inline">{t.label}</span>
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 py-1.5 ml-auto">
                    {!loadingSession && (session ? (
                        <div className="h-8 pl-2.5 pr-1 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            {/* En el teléfono no está la columna con las líneas de la sesión:
                                tocar el estado las abre en la hoja inferior. */}
                            <button type="button" onClick={() => setShowLinesMobile(true)} disabled={!session.lines?.length}
                                className="text-[12px] text-content dark:text-white whitespace-nowrap lg:pointer-events-none disabled:pointer-events-none">
                                <span className="hidden sm:inline font-semibold">Sesión abierta · </span>
                                <span className="text-content-subtle">{session.line_count || session.lines?.length || 0} mov.</span>
                                {session.opened_at && <span className="hidden sm:inline text-content-subtle"> · desde {fmtHora(session.opened_at)}</span>}
                            </button>
                            <button
                                onClick={handleCloseSession}
                                disabled={closingSession}
                                className="h-6 px-2 rounded-md bg-white dark:bg-white/10 border border-border dark:border-white/10 text-[12px] font-medium text-content dark:text-white hover:bg-surface-2 dark:hover:bg-white/15 whitespace-nowrap inline-flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition-colors"
                            >
                                {closingSession && <Spinner />}
                                {closingSession ? "Cerrando…" : <>Cerrar<span className="hidden sm:inline"> sesión</span></>}
                            </button>
                        </div>
                    ) : (
                        <div className="h-8 pl-2.5 pr-1 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.03] flex items-center gap-2"
                            title="Se abre sola con el primer movimiento que registres. Ábrela antes si vas a ajustar desde Stock.">
                            <span className="w-1.5 h-1.5 rounded-full bg-content-subtle/50 shrink-0" />
                            <span className="hidden sm:inline text-[12px] text-content-subtle whitespace-nowrap">Sin sesión abierta</span>
                            <button
                                onClick={handleOpenSession}
                                disabled={openingSession}
                                className="h-6 px-2 rounded-md bg-surface-2 dark:bg-white/10 text-[12px] font-medium text-content dark:text-white hover:bg-surface-3 dark:hover:bg-white/15 whitespace-nowrap inline-flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition-colors"
                            >
                                {openingSession && <Spinner />}
                                {openingSession ? "Abriendo…" : "Abrir"}
                            </button>
                        </div>
                    ))}
                    {onChangeWarehouse && (
                        <button onClick={onChangeWarehouse} title="Cambiar de almacén"
                            className="h-8 px-2.5 rounded-lg text-content-muted dark:text-white/60 hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/[0.06] text-[12px] font-medium whitespace-nowrap transition-colors flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M8 7h12m0 0l-4-4m4 4l-4 4m-4 6H4m0 0l4 4m-4-4l4-4" /></svg>
                            <span className="hidden sm:inline">Cambiar almacén</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ═══════════════ TAB: AJUSTE ═══════════════ */}
            {tab === "ajuste" && (
                <div className="flex-1 flex flex-col min-h-0">

                    {/* El panel de ajuste es un formulario corto y fijo; la lista de productos
                        es la que se recorre. Repartir mitad y mitad desperdiciaba espacio a la
                        derecha y apretaba la cuadrícula de fotos a la izquierda. */}
                    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] overflow-hidden">

                        {/* Columna izquierda: productos */}
                        <div className="flex flex-col min-h-0 border-r border-border/10 dark:border-white/[0.06]">
                            {/* Barra de la lista: todo en una fila de la misma altura (buscar,
                                categoría, planilla y vista); debajo, solo el conteo. */}
                            <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border/60 dark:border-white/[0.06]">
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1 min-w-0">
                                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input type="text" placeholder="Buscar producto…"
                                            value={search} onChange={e => setSearch(e.target.value)}
                                            autoComplete="off" spellCheck={false}
                                            className="input h-9 pl-9 pr-8 text-[13px]" />
                                        {search && (
                                            <button onClick={() => setSearch("")} aria-label="Borrar búsqueda"
                                                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-white">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg>
                                            </button>
                                        )}
                                    </div>
                                    {/* Ancho fijo: si compartiera el espacio con el buscador, un
                                        nombre de categoría largo dejaría el campo de texto inservible. */}
                                    <div className="hidden sm:block w-44 shrink-0">
                                        <CustomSelect
                                            value={categoryId}
                                            onChange={setCategoryId}
                                            height="h-9"
                                            placeholder="Categoría"
                                            options={[
                                                { value: "", label: "Todas las categorías" },
                                                ...(categories || []).map(c => ({ value: String(c.id), label: toNameCase(c.name) })),
                                            ]}
                                        />
                                    </div>

                                    {/* La planilla para contar en el depósito. Va acá porque es
                                        el paso previo a este mismo formulario: se imprime, se
                                        cuenta a mano y se vuelve a cargar lo contado en Conteo. */}
                                    <button
                                        onClick={imprimirPlanilla}
                                        disabled={printing || !selectedWarehouse}
                                        title="Planilla en blanco para el conteo físico, con los filtros de esta pantalla"
                                        className="btn-outline h-9 px-3 shrink-0 rounded-lg text-[12px] font-medium hidden sm:flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                                    >
                                        {printing ? <Spinner /> : (
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                            </svg>
                                        )}
                                        Planilla
                                    </button>

                                    {/* Mismo selector de vista que el Catálogo, para que la
                                        interfaz se comporte igual en las dos pantallas. */}
                                    <div className="hidden sm:flex items-center p-[3px] gap-[2px] rounded-lg bg-surface-3 dark:bg-white/[0.06] h-9 shrink-0">
                                        {[
                                            ["list", "Vista de lista", "M4 6h16M4 12h16M4 18h16"],
                                            ["grid", "Vista con imagen", "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"],
                                        ].map(([key, title, d]) => (
                                            <button key={key} onClick={() => setViewMode(key)} title={title} aria-label={title} aria-pressed={viewMode === key}
                                                className={`h-full w-8 rounded-md flex items-center justify-center transition-all ${viewMode === key
                                                    ? "bg-white dark:bg-white/15 text-content dark:text-white shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.04)]"
                                                    : "text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={d} /></svg>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between gap-2 mt-2 min-h-[28px]">
                                    <p className="text-[12px] text-content-subtle truncate">
                                        {loadingList ? "Cargando…" : `${allProducts.length} producto${allProducts.length !== 1 ? "s" : ""}`}
                                        {/* Avance de la sesión: cuenta productos distintos, no movimientos,
                                            que es lo que interesa al recorrer el inventario. */}
                                        {adjustedCount.size > 0 && (
                                            <span className="text-emerald-700 dark:text-emerald-400"> · {adjustedCount.size} ajustado{adjustedCount.size !== 1 ? "s" : ""} en esta sesión</span>
                                        )}
                                    </p>
                                    {/* Teléfono: categoría y vista bajan a esta fila para que el buscador
                                        tenga todo el ancho. Las líneas de la sesión se abren tocando
                                        el estado de la sesión en la cabecera. */}
                                    <div className="sm:hidden flex items-center gap-1.5 shrink-0">
                                        <div className="w-36">
                                            <CustomSelect
                                                value={categoryId}
                                                onChange={setCategoryId}
                                                height="h-8"
                                                placeholder="Categoría"
                                                options={[
                                                    { value: "", label: "Todas las categorías" },
                                                    ...(categories || []).map(c => ({ value: String(c.id), label: toNameCase(c.name) })),
                                                ]}
                                            />
                                        </div>
                                        <div className="flex items-center p-[3px] gap-[2px] rounded-lg bg-surface-3 dark:bg-white/[0.06] h-8">
                                            {[["list", "M4 6h16M4 12h16M4 18h16"], ["grid", "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"]].map(([key, d]) => (
                                                <button key={key} onClick={() => setViewMode(key)} aria-label={key === "list" ? "Vista de lista" : "Vista con imagen"} aria-pressed={viewMode === key}
                                                    className={`h-full w-7 rounded-md flex items-center justify-center ${viewMode === key ? "bg-white dark:bg-white/15 text-content dark:text-white shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-content-subtle"}`}>
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={d} /></svg>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div
                                className={`flex-1 overflow-y-auto ${viewMode === "grid" ? "p-3" : "divide-y divide-border/10 dark:divide-white/[0.04]"}`}
                                onScroll={handleScroll}
                            >
                                {loadingList ? (
                                    <div className="flex items-center justify-center py-16">
                                        <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : allProducts.length === 0 ? (
                                    <div className="flex items-center justify-center py-16">
                                        <p className="text-[12px] font-semibold text-content-subtle/40">Sin productos</p>
                                    </div>
                                ) : viewMode === "grid" ? (
                                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-1.5">
                                        {allProducts.map(p => {
                                            const isSelected = selectedProduct?.id === p.id;
                                            const moves = adjustedCount.get(p.id) || 0;
                                            return (
                                                <button key={p.id} onClick={() => setSelectedProduct(p)}
                                                    className={["bg-surface dark:bg-surface-dark-2 rounded-xl border overflow-hidden text-left transition-all relative w-full flex flex-col justify-start",
                                                        isSelected
                                                            ? "border-brand-500 ring-2 ring-brand-500/30"
                                                            : moves > 0
                                                            ? "border-emerald-500/50"
                                                            : "border-border/40 dark:border-white/10 hover:border-brand-500/40"
                                                    ].join(" ")}>
                                                    {/* 4/3 en vez de cuadrado: baja el alto de la foto sin recortar
                                                        de más, que es lo que hacía la tarjeta tan alta. La imagen va
                                                        en absolute porque en flujo normal una foto vertical estira
                                                        la tarjeta y descuadra toda la fila. */}
                                                    <div className="w-full shrink-0 aspect-[4/3] bg-surface-2 dark:bg-white/5 relative overflow-hidden">
                                                        {p.image_url ? (
                                                            <img
                                                                src={resolveImageUrl(p.image_url)}
                                                                alt={p.name}
                                                                loading="lazy"
                                                                onError={imgRetryOnError}
                                                                className="absolute inset-0 w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="absolute inset-0 flex items-center justify-center text-xl font-bold text-content-subtle opacity-30">
                                                                {p.name.charAt(0)}
                                                            </div>
                                                        )}
                                                        {/* Ya ajustado en esta sesión. El contador solo aparece si se
                                                            tocó más de una vez, que es la señal de un posible duplicado. */}
                                                        {moves > 0 && (
                                                            <span
                                                                className="absolute top-1 left-1 h-4 min-w-[16px] px-1 rounded-full bg-success text-white flex items-center justify-center gap-0.5 shadow"
                                                                title={`Ajustado en esta sesión (${moves} ${moves === 1 ? "movimiento" : "movimientos"})`}
                                                            >
                                                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                                                                {moves > 1 && <span className="text-[9px] font-bold leading-none">{moves}</span>}
                                                            </span>
                                                        )}
                                                        {/* Franja de cantidad sobre la foto, igual que en Stock, Catálogo y
                                                            POS: es el dato que se busca al ajustar inventario. */}
                                                        {(() => {
                                                            const [n, u] = splitQty(p.stock, p.unit);
                                                            return (
                                                                <StockBand qty={p.stock} value={n} unit={u} min={p.min_stock}
                                                                    className="absolute bottom-0 inset-x-0 px-2 py-1 backdrop-blur-sm text-[14px]" />
                                                            );
                                                        })()}
                                                    </div>
                                                    <div className="px-2 py-1.5 flex flex-col gap-0.5">
                                                        <p className="text-[11px] text-content-subtle truncate leading-none">{toNameCase(p.category_name || "General")}</p>
                                                        <p className={`text-[12px] font-semibold leading-tight line-clamp-2 ${isSelected ? "text-brand-700 dark:text-brand-300" : "text-content dark:text-white"}`}>{p.name}</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : allProducts.map(p => {
                                    const isSelected = selectedProduct?.id === p.id;
                                    const moves = adjustedCount.get(p.id) || 0;
                                    return (
                                        <button key={p.id} onClick={() => setSelectedProduct(p)}
                                            className={["w-full px-4 py-3 flex items-center gap-3 text-left transition-all border-l-2",
                                                isSelected ? "bg-brand-500/10 border-brand-500"
                                                    : moves > 0 ? "bg-success/[0.04] border-success/60 hover:bg-success/[0.07]"
                                                    : "hover:bg-white/[0.03] border-transparent"
                                            ].join(" ")}>
                                            {/* Miniatura también en la lista: reconocer el envase es más rápido
                                                que leer el nombre cuando se tiene el producto en la mano. */}
                                            <div className="w-9 h-9 rounded-lg bg-surface-2 dark:bg-white/5 overflow-hidden shrink-0 relative">
                                                {p.image_url ? (
                                                    <img
                                                        src={resolveImageUrl(p.image_url)}
                                                        alt=""
                                                        loading="lazy"
                                                        onError={imgRetryOnError}
                                                        className="absolute inset-0 w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-content-subtle opacity-30">
                                                        {p.name.charAt(0)}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    {moves > 0 && (
                                                        <span
                                                            className="shrink-0 h-3.5 min-w-[14px] px-0.5 rounded-full bg-success text-white flex items-center justify-center gap-0.5"
                                                            title={`Ajustado en esta sesión (${moves} ${moves === 1 ? "movimiento" : "movimientos"})`}
                                                        >
                                                            <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                                                            {moves > 1 && <span className="text-[8px] font-bold leading-none">{moves}</span>}
                                                        </span>
                                                    )}
                                                    <p className={`text-[13px] font-semibold truncate ${isSelected ? "text-brand-700 dark:text-brand-300" : "text-content dark:text-white"}`}>{p.name}</p>
                                                </div>
                                                {p.category_name && <p className="text-[12px] text-content-subtle truncate">{toNameCase(p.category_name)}</p>}
                                            </div>
                                            <span className="shrink-0 ml-3">
                                                <StockQty qty={p.stock} value={splitQty(p.stock, p.unit)[0]} unit={splitQty(p.stock, p.unit)[1]} min={p.min_stock} size="text-[12px]" />
                                            </span>
                                        </button>
                                    );
                                })}
                                {loadingMore && (
                                    <div className="py-4 text-center">
                                        <p className="text-[12px] font-medium text-content-subtle">Cargando más...</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Velo de la hoja móvil. Tocar fuera cierra, como en cualquier hoja del
                            teléfono; en escritorio no existe. */}
                        {(selectedProduct || showLinesMobile) && (
                            <div
                                onClick={() => { setSelectedProduct(null); setShowLinesMobile(false); }}
                                className="lg:hidden fixed inset-0 z-[790] bg-black/50 catalog-overlay-in"
                            />
                        )}

                        {/* Columna derecha en escritorio; hoja inferior en móvil. Es el mismo
                            formulario: lo que cambia es dónde se apoya. Al quedar fijo, sale del
                            flujo del grid y la lista de productos se queda con todo el alto. */}
                        <div className={`flex-col min-h-0 overflow-y-auto custom-scrollbar lg:flex lg:static lg:z-auto lg:max-h-none lg:rounded-none lg:border-0 lg:shadow-none lg:bg-surface-2/40 lg:dark:bg-white/[0.01] ${
                            (selectedProduct || showLinesMobile)
                                ? "flex fixed inset-x-0 bottom-0 z-[800] max-h-[88vh] rounded-t-3xl border-t border-border/20 dark:border-white/10 bg-white dark:bg-surface-dark-2 shadow-[0_-8px_30px_rgba(0,0,0,0.3)] sheet-up safe-area-bottom"
                                : "hidden"
                        }`}>

                            {/* Asa y cierre de la hoja. Solo en móvil: en escritorio esta columna
                                está siempre a la vista y no hay nada que cerrar. */}
                            <div className="lg:hidden sticky top-0 z-10 bg-white dark:bg-surface-dark-2 pt-2.5 pb-1 px-5 flex items-center justify-between border-b border-border/10 dark:border-white/[0.06]">
                                <div className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 rounded-full bg-border dark:bg-white/20" />
                                <p className="text-[12px] font-medium text-content-subtle mt-2">
                                    {selectedProduct ? "Registrar movimiento" : "Movimientos de la sesión"}
                                </p>
                                <button
                                    onClick={() => { setSelectedProduct(null); setShowLinesMobile(false); }}
                                    className="mt-2 w-7 h-7 rounded-lg flex items-center justify-center text-content-subtle active:scale-95 transition-all"
                                    aria-label="Cerrar">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>

                            {selectedProduct ? (
                                <div className="shrink-0 p-4 lg:p-5 space-y-4">
                                    {/* ── Producto ── */}
                                    <div className="flex items-start gap-3">
                                        <div className="w-14 h-14 rounded-xl bg-surface-2 dark:bg-white/5 overflow-hidden shrink-0 relative border border-border/60 dark:border-white/[0.06]">
                                            {selectedProduct.image_url ? (
                                                <img src={resolveImageUrl(selectedProduct.image_url)} alt="" onError={imgRetryOnError}
                                                    className="absolute inset-0 w-full h-full object-cover" />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-content-subtle/40">
                                                    {selectedProduct.name.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[12px] text-content-subtle truncate">{toNameCase(selectedProduct.category_name || "General")}</p>
                                            <p className="text-[15px] font-semibold leading-snug text-content dark:text-white line-clamp-2">{selectedProduct.name}</p>
                                            <button onClick={() => setHistoryOf(selectedProduct.id)}
                                                className="mt-1 -ml-1 px-1 h-6 rounded-md text-[12px] font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-500/10 inline-flex items-center gap-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                Ver movimientos
                                            </button>
                                        </div>
                                        <button onClick={() => setSelectedProduct(null)} className="row-icon hidden lg:inline-flex -mr-1.5 -mt-1" title="Quitar selección" aria-label="Quitar selección">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>

                                    {/* ── Existencia: lo que hay y lo que va a quedar ── */}
                                    <div className="grid grid-cols-[1fr_auto_1fr] items-center rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3">
                                        <div className="min-w-0">
                                            <div className="text-[12px] text-content-subtle">En sistema</div>
                                            <div className={`mt-0.5 text-[22px] leading-tight font-bold tabular-nums ${calc.stock <= 0 ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`}>
                                                {fmtCant(calc.stock, selectedProduct.unit)}
                                            </div>
                                            <div className="text-[11px] text-content-subtle">{unidadCorta(selectedProduct.unit, calc.stock)}</div>
                                        </div>
                                        <div className="px-3 flex flex-col items-center gap-1">
                                            <svg className="w-4 h-4 text-content-subtle/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                            {calc.hasQty && calc.delta !== 0 && (
                                                <span className={`text-[11px] font-semibold tabular-nums px-1.5 rounded-md ${calc.delta > 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-surface-3 dark:bg-white/[0.06] text-content dark:text-white"}`}>
                                                    {calc.delta > 0 ? "+" : "−"}{fmtCant(calc.delta, selectedProduct.unit)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="min-w-0 text-right">
                                            <div className="text-[12px] text-content-subtle">Quedará</div>
                                            <div className={`mt-0.5 text-[22px] leading-tight font-bold tabular-nums ${!calc.hasQty ? "text-content-subtle/50"
                                                : calc.after < 0 ? "text-red-600 dark:text-red-400"
                                                : "text-content dark:text-white"}`}>
                                                {calc.hasQty ? `${calc.after < 0 ? "−" : ""}${fmtCant(calc.after, selectedProduct.unit)}` : "—"}
                                            </div>
                                            <div className="text-[11px] text-content-subtle">{unidadCorta(selectedProduct.unit, calc.after)}</div>
                                        </div>
                                    </div>

                                    {/* ── Tipo de movimiento ── */}
                                    <div role="tablist" className="grid grid-cols-3 p-[3px] gap-[2px] rounded-lg bg-surface-3 dark:bg-white/[0.06]">
                                        {MODES.map(m => {
                                            const on = form.type === m.key;
                                            return (
                                                <button key={m.key} role="tab" aria-selected={on}
                                                    onClick={() => setForm(p => ({ ...p, type: m.key, reason: m.reason }))}
                                                    className={`h-9 rounded-md text-[13px] inline-flex items-center justify-center gap-1.5 transition-all ${on
                                                        ? "bg-white dark:bg-white/15 font-semibold text-content dark:text-white shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.04)]"
                                                        : "font-medium text-content-subtle hover:text-content dark:text-white/55 dark:hover:text-white"}`}>
                                                    <svg className={`w-3.5 h-3.5 ${on ? m.tone : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d={m.icon} /></svg>
                                                    {m.label}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* ── Cantidad ── */}
                                    <div>
                                        <label className="label" htmlFor="adj-qty">
                                            {form.type === "count" ? "Cantidad contada" : form.type === "in" ? "Cantidad que entra" : "Cantidad que sale"}
                                        </label>
                                        <div className="flex items-stretch gap-2">
                                            <button type="button" onClick={() => paso(-1)} disabled={!calc.hasQty || calc.q <= 0}
                                                className="btn-outline w-12 h-12 rounded-xl flex items-center justify-center shrink-0 active:scale-95 disabled:opacity-40" aria-label="Menos">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2.4} d="M5 12h14" /></svg>
                                            </button>
                                            <input id="adj-qty" type="text"
                                                inputMode={isIntegerUnit(selectedProduct.unit) ? "numeric" : "decimal"}
                                                autoComplete="off"
                                                placeholder="0"
                                                value={form.quantity}
                                                onChange={e => setForm(p => ({ ...p, quantity: limpiarCantidad(e.target.value, selectedProduct.unit) }))}
                                                onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
                                                className="input h-12 flex-1 min-w-0 text-center text-[20px] font-semibold tabular-nums" />
                                            <button type="button" onClick={() => paso(1)}
                                                className="btn-outline w-12 h-12 rounded-xl flex items-center justify-center shrink-0 active:scale-95" aria-label="Más">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2.4} d="M12 5v14M5 12h14" /></svg>
                                            </button>
                                        </div>
                                        <p className={`mt-1.5 text-[12px] ${calc.error ? "text-red-600 dark:text-red-400 font-medium" : "text-content-subtle"}`}>
                                            {calc.error
                                                || (form.type === "count"
                                                    ? (calc.hasQty
                                                        ? (calc.delta === 0 ? "Coincide con el sistema: no hay nada que ajustar."
                                                            : `Diferencia de ${calc.delta > 0 ? "+" : "−"}${fmtCant(calc.delta, selectedProduct.unit)} ${unidadCorta(selectedProduct.unit, calc.delta)}; se registra como conteo físico.`)
                                                        : "Escribe lo que hay en el estante; el sistema calcula la diferencia.")
                                                    : isIntegerUnit(selectedProduct.unit) ? "En unidades enteras." : `En ${unidadCorta(selectedProduct.unit)}, hasta 3 decimales.`)}
                                        </p>
                                    </div>

                                    {/* ── Motivo ── */}
                                    {form.type !== "count" && (
                                        <div>
                                            <span className="label">Motivo</span>
                                            <div className="grid grid-cols-2 gap-1.5">
                                                {reasons.map(r => {
                                                    const on = form.reason === r.value;
                                                    return (
                                                        <button key={r.value} type="button" onClick={() => setForm(p => ({ ...p, reason: r.value }))}
                                                            className={`h-9 px-2.5 rounded-lg border text-[13px] text-left truncate transition-colors active:scale-[0.98] ${on
                                                                ? "bg-brand-500/10 border-brand-500/50 text-brand-700 dark:text-brand-300 font-semibold"
                                                                : "bg-white dark:bg-white/[0.03] border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:border-brand-500/30"}`}>
                                                            {r.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* ── Nota ── */}
                                    <div>
                                        <label className="label" htmlFor="adj-notes">Nota <span className="font-normal text-content-subtle">· opcional</span></label>
                                        <input id="adj-notes" type="text" value={form.notes}
                                            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                                            placeholder={form.type === "out" ? "Ej: botellas rotas en el traslado" : form.type === "in" ? "Ej: factura del proveedor" : "Ej: conteo de fin de mes"}
                                            autoComplete="off"
                                            className="input h-10 text-[13px]" />
                                    </div>

                                    <button onClick={handleSave} disabled={saving || !calc.valid}
                                        className="btn-accent w-full h-11 rounded-xl font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none">
                                        {saving && <Spinner />}
                                        {saving ? "Registrando…" : calc.cta}
                                    </button>
                                    {!session && (
                                        <p className="-mt-2 text-center text-[12px] text-content-subtle">Se abrirá una sesión de ajustes con este movimiento.</p>
                                    )}
                                </div>
                            ) : (
                                <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-center px-8 py-10">
                                    <div className="w-12 h-12 rounded-2xl bg-white dark:bg-white/[0.04] border border-border/70 dark:border-white/[0.08] flex items-center justify-center text-content-subtle">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                                    </div>
                                    <h3 className="mt-4 text-[15px] font-semibold text-content dark:text-white">Elige un producto</h3>
                                    <p className="mt-1 text-[13px] text-content-subtle leading-relaxed max-w-[280px]">
                                        Toca un producto de la lista para registrar una salida, una entrada o un conteo.
                                    </p>
                                    <div className="mt-6 w-full max-w-[300px] space-y-2 text-left">
                                        {[
                                            ["Salida", "Merma, vencidos, consumo interno o pérdidas."],
                                            ["Entrada", "Mercancía que llega sin pasar por Compras."],
                                            ["Conteo", "Escribe lo que contaste; la diferencia se calcula sola."],
                                        ].map(([t, d]) => (
                                            <div key={t} className="flex gap-2.5 text-[12px]">
                                                <span className="w-1.5 h-1.5 rounded-full bg-content-subtle/40 mt-[7px] shrink-0" />
                                                <span className="text-content-subtle"><span className="font-semibold text-content dark:text-white">{t}.</span> {d}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── Últimos movimientos del producto ── */}
                            {selectedProduct && (recentMoves.loading || recentMoves.rows.length > 0) && (
                                <div className="shrink-0 border-t border-border/60 dark:border-white/[0.06]">
                                    <div className="px-4 lg:px-5 pt-3 pb-1.5 flex items-center justify-between">
                                        <p className="text-[12px] font-medium text-content-subtle">Últimos movimientos</p>
                                        <button onClick={() => setHistoryOf(selectedProduct.id)} className="text-[12px] font-medium text-brand-700 dark:text-brand-300 hover:underline">Ver todos</button>
                                    </div>
                                    {recentMoves.loading ? (
                                        <div className="px-4 lg:px-5 pb-3 space-y-2">
                                            {[0, 1, 2].map(i => <div key={i} className="h-8 rounded-lg bg-surface-3/70 dark:bg-white/[0.04] animate-pulse" />)}
                                        </div>
                                    ) : (
                                        <div className="pb-2">
                                            {recentMoves.rows.map((m, i) => {
                                                const d = describe(m);
                                                return (
                                                    <div key={i} className={`px-4 lg:px-5 py-2 flex items-center gap-3 ${m.void ? "opacity-60" : ""}`}>
                                                        <KindIcon m={m} size="w-7 h-7" />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-[13px] font-medium text-content dark:text-white truncate">{d.title}{d.doc && m.kind !== "ajuste" ? <span className="text-content-subtle font-normal"> · {d.doc}</span> : null}</div>
                                                            <div className="text-[11px] text-content-subtle tabular-nums">{fmtDateShort(m.at)} · {fmtHora(m.at)}</div>
                                                        </div>
                                                        <Qty m={m} unit={selectedProduct.unit} className="text-[13px]" />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Líneas de la sesión actual ── */}
                            {session?.lines?.length > 0 && (
                                <div className={`shrink-0 border-t border-border/60 dark:border-white/[0.06] ${selectedProduct ? "hidden lg:block" : ""}`}>
                                    <div className="px-4 lg:px-5 pt-3 pb-1.5 flex items-center justify-between">
                                        <p className="text-[12px] font-medium text-content-subtle">
                                            En esta sesión · <span className="text-content dark:text-white font-semibold">{session.lines.length}</span> {session.lines.length === 1 ? "movimiento" : "movimientos"}
                                        </p>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto custom-scrollbar pb-2">
                                        {[...session.lines].reverse().map(line => {
                                            const entra = parseFloat(line.qty_adjusted) > 0;
                                            return (
                                                <div key={line.id} className="px-4 lg:px-5 py-2 flex items-center justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-[13px] font-medium text-content dark:text-white truncate">{line.product_name}</p>
                                                        <p className="text-[11px] text-content-subtle truncate">{reasonLabel(line.reason)}{line.notes ? ` · ${line.notes}` : ""}</p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className={`text-[13px] font-semibold tabular-nums ${entra ? "text-emerald-700 dark:text-emerald-400" : "text-content dark:text-white"}`}>
                                                            {entra ? "+" : "−"}{fmt(Math.abs(line.qty_adjusted))}
                                                        </p>
                                                        <p className="text-[11px] text-content-subtle tabular-nums">{fmt(line.qty_before)} → {fmt(line.qty_after)}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════ TAB: HISTORIAL ═══════════════ */}
            {tab === "historial" && (
                <SessionHistory history={history} loading={loadingHist} onOpenProduct={setHistoryOf} />
            )}
            <ProductMovementsModal productId={historyOf} warehouseId={selectedWarehouse ? String(selectedWarehouse.id) : ""} onClose={() => setHistoryOf(null)} />
        </div>
    );
}
