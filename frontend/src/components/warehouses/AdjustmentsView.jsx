import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../../services/api";
import CustomSelect from "../ui/CustomSelect";
import { useDebounce } from "../../hooks/useDebounce";
import { isIntegerUnit } from "../../helpers/unitFormatter";
import { resolveImageUrl, imgRetryOnError } from "../../helpers/image";
import { useApp } from "../../context/AppContext";

const REASONS_OUT = [
    { value: "merma",       label: "Merma (Deterioro/Rotura)" },
    { value: "vencimiento", label: "Producto Vencido" },
    { value: "consumo",     label: "Consumo Interno" },
    { value: "robo",        label: "Robo / Pérdida" },
    { value: "conteo",      label: "Ajuste de Conteo Físico" },
];
const REASONS_IN = [
    { value: "compra",        label: "Compra / Recepción" },
    { value: "devolucion",    label: "Devolución de Cliente" },
    { value: "transferencia", label: "Transferencia Recibida" },
    { value: "produccion",    label: "Producción Interna" },
    { value: "conteo",        label: "Ajuste de Conteo Físico" },
];

function stockColor(qty) {
    const n = parseFloat(qty) || 0;
    if (n <= 0)  return "text-danger";
    if (n <= 10) return "text-warning";
    return "text-success";
}

// Versión en franja para las tarjetas: mismo semáforo pero en fondo sólido, que a tamaño
// pequeño se lee de un golpe mientras que un número de color sobre la foto se pierde.
function stockBand(qty) {
    const n = parseFloat(qty) || 0;
    if (n <= 0)  return "bg-danger text-white";
    if (n <= 10) return "bg-warning text-black";
    return "bg-success text-white";
}

const fmt = n => Number(n || 0).toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const fmtDate = d => d ? new Date(d).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export default function AdjustmentsView({ selectedWarehouse, notify, onChangeWarehouse, onSessionChange }) {
    // Las categorías ya viven en el contexto y se cargan una vez al entrar: no hace falta
    // pedirlas otra vez desde esta pantalla.
    const { categories } = useApp();
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
    const [form, setForm]                       = useState({ quantity: "", type: "out", reason: "merma", notes: "" });
    const [saving, setSaving]                   = useState(false);
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
    const [expandedSession, setExpandedSession] = useState(null);

    const reasons = form.type === "out" ? REASONS_OUT : REASONS_IN;

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

    // ── Registrar ajuste ──────────────────────────────────────────
    const handleSave = async () => {
        if (!selectedProduct) return notify("Selecciona un producto", "err");
        if (!form.quantity || parseFloat(form.quantity) <= 0) return notify("Ingresa una cantidad válida", "err");
        // Unidades contables (UNIDAD) → sin decimales
        const qtyToSend = isIntegerUnit(selectedProduct.unit) ? Math.floor(parseFloat(form.quantity)) : form.quantity;
        if (isIntegerUnit(selectedProduct.unit) && qtyToSend <= 0) return notify("Ingresa una cantidad válida", "err");

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
                { product_id: selectedProduct.id, qty: qtyToSend, type: form.type, reason: form.reason, notes: form.notes }
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

            notify(`${selectedProduct.name}: ${form.type === "out" ? "-" : "+"}${form.quantity} registrado`);
            setSelectedProduct(null);
            setForm(f => ({ quantity: "", type: f.type, reason: f.type === "out" ? "merma" : "compra", notes: "" }));
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
                <p className="text-[11px] font-black uppercase tracking-wide text-content-subtle">Selecciona un almacén</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-white/[0.01]">

            {/* ── Barra superior ── */}
            <div className="shrink-0 px-4 h-10 border-b border-warning/15 bg-warning/[0.03] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                        <svg className="w-3.5 h-3.5 text-warning shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                        <span className="text-warning/70">Almacén:</span>
                        <span className="text-content dark:text-white truncate">{selectedWarehouse.name}</span>
                    </div>
                    {session && (
                        <span className="flex items-center gap-1.5 text-[10px] font-black text-success uppercase tracking-widest">
                            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                            Sesión abierta · {session.line_count || (session.lines?.length || 0)} mov.
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {session && (
                        <button
                            onClick={handleCloseSession}
                            disabled={closingSession}
                            className="h-6 px-3 rounded-md bg-success/10 text-success border border-success/20 text-[10px] font-black uppercase tracking-widest hover:bg-success hover:text-black transition-all flex items-center gap-1.5 disabled:opacity-50"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                            {closingSession ? "Cerrando..." : "Cerrar Sesión"}
                        </button>
                    )}
                    {onChangeWarehouse && (
                        <button onClick={onChangeWarehouse}
                            className="h-6 px-2.5 rounded-md text-warning hover:bg-warning hover:text-black text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m-4 6H4m0 0l4 4m-4-4l4-4" /></svg>
                            Cambiar
                        </button>
                    )}
                </div>
            </div>

            {/* ── Tabs ── */}
            <div className="shrink-0 flex border-b border-border/10 dark:border-white/[0.06]">
                {[{ key: "ajuste", label: "Movimiento" }, { key: "historial", label: "Historial de sesiones" }].map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`px-5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
                            tab === t.key
                                ? "border-brand-500 text-brand-500"
                                : "border-transparent text-content-subtle hover:text-content dark:hover:text-white"
                        }`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ═══════════════ TAB: AJUSTE ═══════════════ */}
            {tab === "ajuste" && (
                <div className="flex-1 flex flex-col min-h-0">

                    {/* Banner para abrir sesión */}
                    {!loadingSession && !session && (
                        <div className="shrink-0 mx-4 mt-4 rounded-xl border border-warning/20 bg-warning/5 px-4 py-3 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-warning/10 text-warning flex items-center justify-center shrink-0">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                                </div>
                                <div>
                                    <p className="text-[11px] font-black text-content dark:text-white">Iniciar sesión de ajustes</p>
                                    <p className="text-[10px] text-content-subtle/60">Todos los movimientos quedarán registrados bajo esta sesión</p>
                                </div>
                            </div>
                            <button
                                onClick={handleOpenSession}
                                disabled={openingSession}
                                className="h-8 px-4 rounded-xl bg-warning text-black text-[10px] font-black uppercase tracking-widest hover:brightness-105 transition-all active:scale-95 disabled:opacity-50 shrink-0"
                            >
                                {openingSession ? "Abriendo..." : "Abrir Sesión"}
                            </button>
                        </div>
                    )}

                    {/* El panel de ajuste es un formulario corto y fijo; la lista de productos
                        es la que se recorre. Repartir mitad y mitad desperdiciaba espacio a la
                        derecha y apretaba la cuadrícula de fotos a la izquierda. */}
                    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] overflow-hidden">

                        {/* Columna izquierda: productos */}
                        <div className="flex flex-col min-h-0 border-r border-border/10 dark:border-white/[0.06]">
                            <div className="shrink-0 px-4 py-3 border-b border-border/10 dark:border-white/[0.06]">
                                <div className="flex gap-2">
                                    <div className="relative flex-1 min-w-0">
                                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input type="text" placeholder="Buscar producto..."
                                            value={search} onChange={e => setSearch(e.target.value)}
                                            className="input h-9 pl-9 text-sm" />
                                        {search && (
                                            <button onClick={() => setSearch("")}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-subtle hover:text-content">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg>
                                            </button>
                                        )}
                                    </div>
                                    {/* Ancho fijo: si compartiera el espacio con el buscador, un
                                        nombre de categoría largo dejaría el campo de texto inservible. */}
                                    <div className="w-40 shrink-0">
                                        <CustomSelect
                                            value={categoryId}
                                            onChange={setCategoryId}
                                            height="h-9"
                                            placeholder="Categoría"
                                            options={[
                                                { value: "", label: "Todas las categorías" },
                                                ...(categories || []).map(c => ({ value: String(c.id), label: c.name })),
                                            ]}
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-2 mt-1.5">
                                    <p className="text-[9px] font-bold text-content-subtle/40 uppercase tracking-widest truncate">
                                        {loadingList ? "Cargando..." : `${allProducts.length} producto${allProducts.length !== 1 ? "s" : ""}`}
                                        {/* Avance de la sesión: cuenta productos distintos, no movimientos,
                                            que es lo que interesa al recorrer el inventario. */}
                                        {adjustedCount.size > 0 && (
                                            <span className="text-success ml-1.5">· {adjustedCount.size} ajustado{adjustedCount.size !== 1 ? "s" : ""}</span>
                                        )}
                                    </p>
                                    {/* Mismo selector de vista que el Catálogo, para que la
                                        interfaz se comporte igual en las dos pantallas. */}
                                    <div className="flex items-center rounded-lg border border-border/40 dark:border-white/10 overflow-hidden h-7 shrink-0">
                                        <button
                                            onClick={() => setViewMode("list")}
                                            title="Vista de lista"
                                            className={`h-full px-2 flex items-center justify-center transition-all ${
                                                viewMode === "list"
                                                    ? "bg-brand-500 text-black"
                                                    : "bg-surface-2 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"
                                            }`}>
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" /></svg>
                                        </button>
                                        <button
                                            onClick={() => setViewMode("grid")}
                                            title="Vista con imagen"
                                            className={`h-full px-2 flex items-center justify-center border-l border-border/40 dark:border-white/10 transition-all ${
                                                viewMode === "grid"
                                                    ? "bg-brand-500 text-black"
                                                    : "bg-surface-2 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"
                                            }`}>
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                                        </button>
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
                                        <p className="text-[11px] font-bold text-content-subtle/40 uppercase tracking-wide">Sin productos</p>
                                    </div>
                                ) : viewMode === "grid" ? (
                                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-1.5">
                                        {allProducts.map(p => {
                                            const isSelected = selectedProduct?.id === p.id;
                                            const moves = adjustedCount.get(p.id) || 0;
                                            return (
                                                <button key={p.id} onClick={() => setSelectedProduct(p)}
                                                    className={["rounded-xl border overflow-hidden text-left transition-all relative",
                                                        isSelected
                                                            ? "border-brand-500 ring-2 ring-brand-500/30"
                                                            : moves > 0
                                                            ? "border-success/50"
                                                            : "border-border/40 dark:border-white/10 hover:border-brand-500/40"
                                                    ].join(" ")}>
                                                    {/* 4/3 en vez de cuadrado: baja el alto de la foto sin recortar
                                                        de más, que es lo que hacía la tarjeta tan alta. La imagen va
                                                        en absolute porque en flujo normal una foto vertical estira
                                                        la tarjeta y descuadra toda la fila. */}
                                                    <div className="aspect-[4/3] bg-surface-2 dark:bg-white/5 relative overflow-hidden">
                                                        {p.image_url ? (
                                                            <img
                                                                src={resolveImageUrl(p.image_url)}
                                                                alt={p.name}
                                                                loading="lazy"
                                                                onError={imgRetryOnError}
                                                                className="absolute inset-0 w-full h-full object-contain p-1"
                                                            />
                                                        ) : (
                                                            <div className="absolute inset-0 flex items-center justify-center text-xl font-black text-content-subtle opacity-30">
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
                                                                {moves > 1 && <span className="text-[8px] font-black leading-none">{moves}</span>}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Franja de cantidad a todo el ancho: es el dato que se busca al
                                                        ajustar inventario, y en banda sólida se distingue de lejos. */}
                                                    <div className={`px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide tabular-nums ${stockBand(p.stock)}`}>
                                                        {fmt(p.stock)} <span className="opacity-75">{p.unit}</span>
                                                    </div>
                                                    <div className="px-1.5 py-1">
                                                        {p.category_name && <p className="text-[8px] font-black text-content-subtle/60 uppercase tracking-wide truncate leading-none mb-0.5">{p.category_name}</p>}
                                                        <p className={`text-[11px] font-black uppercase tracking-tight leading-tight line-clamp-2 ${isSelected ? "text-brand-500" : "text-content dark:text-white"}`}>{p.name}</p>
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
                                                    <div className="absolute inset-0 flex items-center justify-center text-[13px] font-black text-content-subtle opacity-30">
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
                                                            {moves > 1 && <span className="text-[7px] font-black leading-none">{moves}</span>}
                                                        </span>
                                                    )}
                                                    <p className={`text-[11px] font-black uppercase tracking-tight truncate ${isSelected ? "text-brand-500" : "text-content dark:text-white"}`}>{p.name}</p>
                                                </div>
                                                {p.category_name && <p className="text-[9px] text-content-subtle/50 uppercase tracking-wide mt-0.5">{p.category_name}</p>}
                                            </div>
                                            <span className={`shrink-0 text-[11px] font-black tabular-nums ml-3 ${stockColor(p.stock)}`}>
                                                {fmt(p.stock)} <span className="text-[9px] opacity-60">{p.unit}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                                {loadingMore && (
                                    <div className="py-4 text-center">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-content-subtle">Cargando más...</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Columna derecha: formulario + líneas de sesión */}
                        <div className="flex flex-col min-h-0 overflow-y-auto">

                            {/* Formulario */}
                            <div className={`shrink-0 p-5 space-y-4 transition-all duration-200 ${!selectedProduct ? "opacity-40 pointer-events-none" : ""}`}>
                                {/* Producto seleccionado */}
                                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${selectedProduct ? "border-brand-500 bg-brand-500/5" : "border-border/20 dark:border-white/[0.06]"}`}>
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selectedProduct ? "bg-brand-500" : "bg-surface-3 dark:bg-white/5"}`}>
                                        <svg className={`w-4 h-4 ${selectedProduct ? "text-black" : "text-content-subtle"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] font-black uppercase tracking-tight text-content dark:text-white truncate">
                                            {selectedProduct?.name || "← Selecciona un producto"}
                                        </p>
                                        {selectedProduct && (
                                            <p className={`text-[10px] font-black ${stockColor(selectedProduct.stock)}`}>
                                                Stock actual: {fmt(selectedProduct.stock)} {selectedProduct.unit}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Tipo */}
                                <div className="bg-surface-3 dark:bg-white/5 p-1 rounded-xl flex gap-1 border border-border/10">
                                    <button onClick={() => setForm(p => ({ ...p, type: "out", reason: "merma" }))}
                                        className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all font-black uppercase text-[10px] tracking-widest ${form.type === "out" ? "bg-danger text-white shadow-lg shadow-danger/20" : "text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        Restar (Salida)
                                    </button>
                                    <button onClick={() => setForm(p => ({ ...p, type: "in", reason: "compra" }))}
                                        className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all font-black uppercase text-[10px] tracking-widest ${form.type === "in" ? "bg-success text-white shadow-lg shadow-success/20" : "text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        Sumar (Entrada)
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="label">
                                            Cantidad
                                            {selectedProduct?.unit && <span className="ml-1 opacity-40 font-bold">({selectedProduct.unit})</span>}
                                        </label>
                                        <input type="number" min="0"
                                            step={isIntegerUnit(selectedProduct?.unit) ? "1" : "0.01"}
                                            placeholder={isIntegerUnit(selectedProduct?.unit) ? "0" : "0.00"}
                                            value={form.quantity}
                                            onChange={e => {
                                                let v = e.target.value;
                                                if (isIntegerUnit(selectedProduct?.unit)) v = String(v).replace(/[.,].*$/, "");
                                                setForm(p => ({ ...p, quantity: v }));
                                            }}
                                            className={`input h-10 text-[13px] font-black tabular-nums ${form.type === "out" ? "text-danger" : "text-success"}`} />
                                    </div>
                                    <div>
                                        <label className="label">Motivo</label>
                                        <CustomSelect value={form.reason} onChange={val => setForm(p => ({ ...p, reason: val }))} options={reasons} className="w-full" />
                                    </div>
                                </div>

                                <div>
                                    <label className="label">Notas (opcional)</label>
                                    <input type="text" value={form.notes}
                                        onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                                        placeholder="Detalle adicional..."
                                        className="input h-9 text-sm" />
                                </div>

                                <button onClick={handleSave} disabled={saving || !selectedProduct}
                                    className={`w-full h-11 rounded-xl font-black uppercase tracking-widest text-[11px] transition-all ${saving || !selectedProduct ? "bg-surface-3 dark:bg-white/5 text-content-subtle cursor-not-allowed" : form.type === "out" ? "bg-danger text-white hover:brightness-110 shadow-lg shadow-danger/20" : "bg-success text-black hover:brightness-110 shadow-lg shadow-success/20"}`}>
                                    {saving ? "Registrando..." : "Registrar Movimiento"}
                                </button>
                            </div>

                            {/* Líneas de la sesión actual */}
                            {session?.lines?.length > 0 && (
                                <div className="shrink-0 border-t border-border/10 dark:border-white/[0.06]">
                                    <div className="px-5 py-2.5 flex items-center justify-between">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle">
                                            Movimientos en esta sesión ({session.lines.length})
                                        </p>
                                    </div>
                                    <div className="max-h-52 overflow-y-auto divide-y divide-border/10 dark:divide-white/[0.04]">
                                        {[...session.lines].reverse().map(line => (
                                            <div key={line.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[11px] font-black text-content dark:text-white truncate">{line.product_name}</p>
                                                    <p className="text-[9px] text-content-subtle/50 uppercase">{line.reason}</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className={`text-[11px] font-black tabular-nums ${line.type === "in" ? "text-success" : "text-danger"}`}>
                                                        {line.type === "in" ? "+" : ""}{fmt(line.qty_adjusted)}
                                                    </p>
                                                    <p className="text-[9px] text-content-subtle/40 tabular-nums">{fmt(line.qty_before)} → {fmt(line.qty_after)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════ TAB: HISTORIAL ═══════════════ */}
            {tab === "historial" && (
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loadingHist ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-2 opacity-30">
                            <svg className="w-8 h-8 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            <p className="text-[11px] font-black uppercase tracking-wide text-content-subtle">Sin sesiones registradas</p>
                        </div>
                    ) : history.map(s => {
                        const isOpen     = s.status === "open";
                        const expanded   = expandedSession === s.id;
                        const lineCount  = s.line_count || s.lines?.length || 0;
                        return (
                            <div key={s.id} className="rounded-xl border border-border/20 dark:border-white/[0.06] overflow-hidden">
                                <button onClick={() => setExpandedSession(expanded ? null : s.id)}
                                    className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors text-left">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className={`w-2 h-2 rounded-full shrink-0 ${isOpen ? "bg-success animate-pulse" : "bg-content-subtle/30"}`} />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[11px] font-black text-content dark:text-white">{s.employee_name || "Sistema"}</span>
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase ${isOpen ? "bg-success/10 text-success" : "bg-surface-3 dark:bg-white/5 text-content-subtle"}`}>
                                                    {isOpen ? "Abierta" : "Cerrada"}
                                                </span>
                                            </div>
                                            <p className="text-[9px] text-content-subtle/50 mt-0.5">{fmtDate(s.opened_at)}{s.closed_at ? ` → ${fmtDate(s.closed_at)}` : ""}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className="text-[10px] font-black text-brand-500 tabular-nums">{lineCount} mov.</span>
                                        <svg className={`w-3.5 h-3.5 text-content-subtle transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                </button>
                                {expanded && (s.lines || []).length > 0 && (
                                    <div className="border-t border-border/10 dark:border-white/[0.06] divide-y divide-border/10 dark:divide-white/[0.04]">
                                        {s.lines.map(line => (
                                            <div key={line.id} className="px-5 py-2.5 flex items-center justify-between gap-3 bg-surface-1/30 dark:bg-white/[0.01]">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[11px] font-bold text-content dark:text-white truncate">{line.product_name}</p>
                                                    <p className="text-[9px] text-content-subtle/50 uppercase">{line.reason} {line.notes ? `· ${line.notes}` : ""}</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className={`text-[11px] font-black tabular-nums ${line.type === "in" ? "text-success" : "text-danger"}`}>
                                                        {line.type === "in" ? "+" : ""}{fmt(line.qty_adjusted)}
                                                    </p>
                                                    <p className="text-[9px] text-content-subtle/40 tabular-nums">{fmt(line.qty_before)} → {fmt(line.qty_after)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
