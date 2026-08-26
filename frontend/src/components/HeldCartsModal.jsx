import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { fmtMoney } from "../helpers";
import { api } from "../services/api";
import OrderPreviewModal from "./OrderPreviewModal";
import HeldCartBarCard, { totalCuentaEn } from "./HeldCartBarCard";

// La pestaña elegida se recuerda entre sesiones: en un bar la vista de barra es la de todos
// los días, y volver a la lista cada vez que se abre el modal es un clic de peaje.
const TAB_KEY = "pos_held_tab";

// Cuántos productos se traen del almacén para el buscador de la vista de barra. Se cargan de
// una sola vez —igual que al recuperar una cuenta— para que agregar una ronda no dependa de
// una consulta por cada letra tecleada.
const PRODUCTS_LIMIT = 400;

export default function HeldCartsModal({ open, onClose, carts, onTake, onRemove, onAcceptOrder, baseCurrency, canForceRelease, onForceRelease, convertToDisplay, convertToSecondary, currSym, secondaryCurrency, activeWarehouse, notify, onRefresh }) {
    // Búsqueda por cliente. Con una decena de cuentas abiertas —lo normal en un restaurante a
    // media tarde— recorrer la lista a ojo para encontrar la de una mesa es más lento que
    // teclear el nombre.
    const [search, setSearch] = useState("");
    // Pedido que se está previsualizando. Vive aquí y no en CobroPage porque solo tiene
    // sentido mientras este listado está abierto.
    const [preview, setPreview] = useState(null);

    // ── Vista de barra ────────────────────────────────────────
    // "lista" es el listado de siempre: se recupera la cuenta al carrito y se cobra. "barra"
    // atiende el caso del bar —el cliente pide otra cerveza y otra más—, donde recuperar,
    // sumar y volver a pausar por cada ronda es todo el trabajo del turno. Ahí las cantidades
    // se tocan sobre la propia cuenta.
    const [tab, setTab] = useState(() => localStorage.getItem(TAB_KEY) || "lista");
    const [expandedIds, setExpandedIds] = useState([]);
    const [products, setProducts] = useState([]);
    const [productsTotal, setProductsTotal] = useState(0);
    const [loadingProducts, setLoadingProducts] = useState(false);

    const pickTab = useCallback((t) => {
        setTab(t);
        try { localStorage.setItem(TAB_KEY, t); } catch { /* modo privado: no es crítico */ }
    }, []);

    // Los productos del almacén dan tres cosas que la venta guardada no trae: la unidad (para
    // saber si la cantidad admite decimales), el paso y las existencias, que son el techo de
    // cada línea. Se piden al entrar a la vista y se refrescan tras cada ronda guardada.
    const loadProducts = useCallback(async () => {
        if (!activeWarehouse) return;
        setLoadingProducts(true);
        try {
            const res = await api.warehouses.getProducts(activeWarehouse.id, { limit: PRODUCTS_LIMIT, sellable_only: true });
            // Vienen ordenados por lo más vendido, así que si el almacén tiene más productos
            // que el tope, lo que queda fuera es la cola larga: lo que un bar toca a diario
            // entra siempre. Para el resto está la búsqueda contra el servidor.
            setProducts(res.data || []);
            setProductsTotal(res.total ?? (res.data || []).length);
        } catch (e) {
            notify?.(e.message || "No se pudo cargar el catálogo del almacén", "err");
        } finally {
            setLoadingProducts(false);
        }
    }, [activeWarehouse, notify]);

    useEffect(() => {
        if (!open || tab !== "barra") return;
        loadProducts();
    }, [open, tab, loadProducts]);

    // Tras guardar una ronda cambian dos cosas: los totales de la cuenta y las existencias
    // que limitan la siguiente. Se recargan las dos.
    const handleSaved = useCallback(() => {
        onRefresh?.();
        loadProducts();
    }, [onRefresh, loadProducts]);

    // Red de seguridad del buscador: lo que no entró en la carga inicial se pide al servidor.
    const searchProducts = useCallback(async (q) => {
        if (!activeWarehouse) return [];
        const res = await api.warehouses.getProducts(activeWarehouse.id, { search: q, limit: 8, sellable_only: true });
        return res.data || [];
    }, [activeWarehouse]);

    // Un producto encontrado así se suma a la lista en memoria: de ahí salen la unidad, el
    // paso y las existencias con que la tarjeta limita los botones de cantidad.
    const rememberProduct = useCallback((p) => {
        setProducts(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p]);
    }, []);

    const visibles = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return carts;
        return carts.filter(c => [
            c.customer_name, c.web_customer_name, c.customer_rif,
            c.web_customer_phone, c.employee_name, c.invoice_number,
        ].filter(Boolean).some(v => String(v).toLowerCase().includes(q)));
    }, [carts, search]);

    // Cerrar el listado limpia búsqueda y previsualización: al volver a abrirlo se espera la
    // lista completa, no el filtro que quedó tecleado hace media hora.
    // Cerrar colapsa además la cuenta abierta en la vista de barra: al desmontarse, la tarjeta
    // manda lo que tuviera pendiente, así que ninguna ronda se queda sin guardar.
    const cerrar = useCallback(() => { setSearch(""); setPreview(null); setExpandedIds([]); onClose(); }, [onClose]);

    // El cursor entra al buscador al abrir: la cuenta se encuentra tecleando el nombre de la
    // mesa, no paseando la vista por la lista.
    const searchRef = useRef(null);
    useEffect(() => {
        if (!open) return;
        const frame = requestAnimationFrame(() => searchRef.current?.focus());
        return () => cancelAnimationFrame(frame);
    }, [open]);

    // Escape cierra el listado. Con una previsualización encima la tecla es suya —su propio
    // modal la escucha— y solo debe cerrarse esa capa, no las dos de un golpe.
    useEffect(() => {
        if (!open || preview) return;
        const onKey = e => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            cerrar();
        };
        window.addEventListener("keydown", onKey, true); // capture: antes que la página de fondo
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open, preview, cerrar]);

    if (!open) return null;

    const esBarra = tab === "barra";

    return (
        <div className={`fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 ${esBarra ? "p-0" : "p-4"}`}>
            {/* La barra ocupa la pantalla entera: es la vista con la que se trabaja el turno
                completo —no un diálogo que se abre y se cierra— y con las mesas en columnas
                se ve toda la sala de un vistazo. La lista sigue siendo un modal centrado. */}
            <div className={`bg-white dark:bg-surface-dark-2 border-border/30 dark:border-white/[0.07] overflow-hidden flex flex-col ${
                esBarra
                    ? "w-full h-full border-0 animate-in fade-in duration-200"
                    : "w-full max-w-xl border rounded-2xl shadow-2xl max-h-[85vh] animate-in zoom-in-95 slide-in-from-bottom-3 duration-200 ease-out"
            }`}>

                {/* Header */}
                <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-surface-1 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500 border border-brand-500/20">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 2m9-.828l-1.414-1.414M3.707 18.293V21h2.707l14.586-14.586a2 2 0 10-2.828-2.828L3.707 18.293z" /></svg>
                        </div>
                        <div>
                            <h2 className="text-sm font-black tracking-tight text-content dark:text-white uppercase">Ventas en Espera</h2>
                            <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Cuentas pausadas y pedidos del catálogo</p>
                        </div>
                    </div>
                    <button onClick={cerrar} className="w-9 h-9 rounded-full bg-surface-2 dark:bg-white/5 flex items-center justify-center hover:bg-danger hover:text-white transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Pestañas */}
                <div className="flex gap-1 px-4 border-b border-border/20 dark:border-white/5 shrink-0">
                    {[
                        { id: "lista", label: "Lista" },
                        { id: "barra", label: "Barra" },
                    ].map(t => (
                        <button
                            key={t.id}
                            onClick={() => pickTab(t.id)}
                            className={["px-4 py-2 text-[11px] font-black uppercase tracking-wide border-b-2 transition-all",
                                tab === t.id
                                    ? "border-brand-500 text-brand-500"
                                    : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
                            ].join(" ")}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Buscador por cliente */}
                {carts.length > 0 && (
                    <div className="px-4 pt-3 pb-1 shrink-0">
                        {/* A pantalla completa el buscador no se estira de lado a lado: un campo
                            de un metro de ancho para escribir "mesa 3" no ayuda a nadie. */}
                        <div className={`relative ${esBarra ? "max-w-2xl mx-auto" : ""}`}>
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                ref={searchRef}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="input h-9 pl-9 pr-9 text-[11px] w-full"
                                placeholder="Buscar por cliente, teléfono o cajero..."
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-content-subtle hover:bg-surface-2 dark:hover:bg-white/5 transition-all"
                                    title="Limpiar"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Content */}
                <div className={`flex-1 overflow-y-auto p-4 scrollbar-hide ${esBarra ? "" : "space-y-2"}`}>
                    {carts.length === 0 ? (
                        <div className="h-40 flex flex-col items-center justify-center opacity-20 gap-3">
                            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                            <span className="text-xs font-black uppercase tracking-widest text-center">No hay cuentas en espera</span>
                        </div>
                    ) : visibles.length === 0 ? (
                        <div className="h-32 flex flex-col items-center justify-center opacity-30 gap-3">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <span className="text-xs font-black uppercase tracking-widest text-center">Ninguna cuenta coincide con la búsqueda</span>
                        </div>
                    ) : esBarra ? (
                        <div className="max-w-[1600px] mx-auto space-y-3">
                            {!activeWarehouse && (
                                <div className="px-3 py-2.5 rounded-xl bg-warning/10 text-warning text-[9px] font-black uppercase tracking-widest text-center">
                                    Selecciona un almacén para atender las cuentas desde aquí
                                </div>
                            )}
                            {loadingProducts && products.length === 0 && (
                                <div className="py-6 text-center text-[10px] font-black uppercase tracking-widest text-content-subtle animate-pulse">
                                    Cargando el catálogo del almacén...
                                </div>
                            )}
                            {/* Las mesas en columnas, como la sala. `items-start` es lo que evita
                                que abrir una cuenta estire a las vecinas de su fila. */}
                            <div className="grid gap-3 items-start grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                            {visibles.map(c => {
                                const isWebOrder = c.status === "pedido";
                                const heldByOther = c.held_by && !c.held_by.is_mine;
                                // Una cuenta de otra sucursal se ve, pero no se le suman rondas desde
                                // aquí: el stock que limita cada línea es el del almacén de esta caja,
                                // y el catálogo cargado también.
                                const otroAlmacen = !!(c.warehouse_id && activeWarehouse && c.warehouse_id !== activeWarehouse.id);
                                const editable = !isWebOrder && !heldByOther && !otroAlmacen && !!activeWarehouse;
                                const lockedReason = isWebOrder
                                    ? "Acepta el pedido en la lista para poder editarlo"
                                    : heldByOther
                                        ? `La está atendiendo ${c.held_by.name}`
                                        : otroAlmacen
                                            ? `Cuenta de ${c.warehouse_name || "otra sucursal"}`
                                            : "Selecciona un almacén para editarla";
                                return (
                                    <HeldCartBarCard
                                        key={c.id}
                                        cart={c}
                                        products={products}
                                        searchProducts={searchProducts}
                                        onProductFound={rememberProduct}
                                        hasMoreProducts={productsTotal > products.length}
                                        expanded={expandedIds.includes(c.id)}
                                        // Varias cuentas pueden quedar abiertas a la vez: con la
                                        // sala entera a la vista, tener tres mesas desplegadas en
                                        // sus columnas es justo lo que ahorra toques en el turno.
                                        onToggle={() => setExpandedIds(prev =>
                                            prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                                        )}
                                        onSaved={handleSaved}
                                        notify={notify}
                                        editable={editable}
                                        lockedReason={lockedReason}
                                        onRemove={onRemove}
                                        onPrint={setPreview}
                                        onTake={isWebOrder ? onAcceptOrder : onTake}
                                        takeLabel={isWebOrder ? "Aceptar" : "Cobrar"}
                                        convertToDisplay={convertToDisplay}
                                        convertToSecondary={convertToSecondary}
                                        currSym={currSym}
                                        secondaryCurrency={secondaryCurrency}
                                    />
                                );
                            })}
                            </div>
                        </div>
                    ) : (
                        visibles.map(c => {
                            // Las cuentas vienen del servidor (ventas con status 'espera'),
                            // así que el total ya viene calculado y no hay que rearmarlo.
                            // El total se arma desde las líneas en la moneda que está en pantalla,
                            // no convirtiendo el total en base de la venta: son dos redondeos
                            // distintos y la misma cuenta salía con dos céntimos de diferencia
                            // entre este listado y el carrito. Mismo criterio que la vista de
                            // barra y que el carrito (ver totalCuentaEn).
                            const lineas = (c.items || []).map(i => ({ price: parseFloat(i.price), qty: parseFloat(i.quantity) }));
                            const sym = currSym || baseCurrency?.symbol || "Ref.";
                            const totalDisplay = totalCuentaEn(lineas, c, convertToDisplay);
                            const totalSecondary = convertToSecondary ? totalCuentaEn(lineas, c, convertToSecondary) : null;
                            // Un pedido del catálogo todavía no descontó inventario: no se puede
                            // llevar al carrito sin aceptarlo primero, porque el cobro daría por
                            // hecho que la mercancía ya salió.
                            const isWebOrder = c.status === "pedido";
                            // Otra caja la tiene abierta en su carrito. Se muestra igual —para
                            // que nadie la busque creyendo que se perdió— pero sin acciones:
                            // tomarla o eliminarla ahora es lo que dejaba al otro cajero con un
                            // carrito armado sobre una venta que ya no podía cobrar.
                            const heldByOther = c.held_by && !c.held_by.is_mine;

                            // Imprimir no toca la cuenta, así que se ofrece siempre: la comanda de
                            // una mesa que atiende otra caja también hay que poder mandarla a cocina.
                            const btnComanda = (
                                <button
                                    onClick={() => setPreview(c)}
                                    className="w-9 h-9 shrink-0 rounded-lg bg-surface-2 dark:bg-white/5 text-content-subtle hover:bg-brand-500 hover:text-brand-900 transition-all flex items-center justify-center"
                                    title="Ver el pedido e imprimir la comanda"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                </button>
                            );

                            return (
                                // En móvil las acciones bajan a su propia línea: al lado del texto
                                // dejaban tan poco ancho que cliente, empleado y total salían todos
                                // recortados en puntos suspensivos.
                                <div key={c.id} className={`px-4 py-3 rounded-2xl border flex flex-wrap items-center gap-3 sm:gap-4 transition-all ${
                                    heldByOther
                                        ? "bg-surface-2 dark:bg-white/[0.02] border-black/5 dark:border-white/5 opacity-60"
                                        : isWebOrder
                                            ? "bg-info/[0.06] border-info/25 hover:border-info/50"
                                            : "bg-surface-1 dark:bg-white/[0.03] border-black/5 dark:border-white/5 hover:border-brand-500/30"
                                }`}>
                                    <div className="w-10 h-10 rounded-xl bg-surface-2 dark:bg-black/20 flex flex-col items-center justify-center text-center shrink-0">
                                        <span className="text-[9px] font-black leading-none opacity-40">{new Date(c.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                        <span className={`text-xs font-black ${isWebOrder ? "text-info" : "text-brand-500"}`}>{c.items.length}</span>
                                        <span className="text-[7px] font-black uppercase opacity-40">items</span>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            {isWebOrder && (
                                                <span className="text-[8px] font-black uppercase tracking-widest bg-info text-white px-1.5 py-0.5 rounded shrink-0">
                                                    Web
                                                </span>
                                            )}
                                            {/* "Cliente:" delante del nombre: sin la etiqueta se confundía
                                                con el cajero de la línea de abajo. Se muestra el nombre de
                                                la ficha, no el que el cliente tecleó: es el que va a salir
                                                en la factura. */}
                                            <span className="text-[9px] font-black uppercase tracking-widest text-content-subtle shrink-0">Cliente:</span>
                                            <span className={`text-[9px] font-black uppercase tracking-widest truncate ${isWebOrder ? "text-info" : "text-brand-500"}`}>
                                                {c.customer_name || c.web_customer_name || "Cliente General"}
                                            </span>
                                        </div>
                                        {/* En un pedido web lo útil es a quién facturar y cómo
                                            contactarlo; en una cuenta de caja, quién la abrió. */}
                                        {isWebOrder ? (
                                            <>
                                                <div className="text-[9px] font-bold text-content-subtle truncate tabular-nums">
                                                    {[c.customer_rif, c.web_customer_phone].filter(Boolean).join(" · ")}
                                                </div>
                                                {c.web_note && (
                                                    <div className="text-[9px] font-bold text-content-subtle truncate" title={c.web_note}>
                                                        {c.web_note}
                                                    </div>
                                                )}
                                            </>
                                        ) : c.employee_name && (
                                            <div className="text-[9px] font-bold text-content-subtle uppercase truncate">
                                                Abrió: {c.employee_name}
                                            </div>
                                        )}
                                        {/* El importe no se trunca: un total a medias ("Ref. ...") no
                                            informa nada y es justo el dato que se viene a mirar. */}
                                        <div className="text-base font-black tracking-tight text-content dark:text-white tabular-nums leading-tight">
                                            {fmtMoney(totalDisplay, sym)}
                                        </div>
                                        {secondaryCurrency && totalSecondary !== null && (
                                            <div className="text-[10px] font-bold text-content-subtle dark:text-white/50 tabular-nums">
                                                ≈ {fmtMoney(totalSecondary, secondaryCurrency.symbol)}
                                            </div>
                                        )}
                                    </div>

                                    {/* En uso por otra caja: en vez de botones se dice quién la tiene.
                                        Un administrador puede soltarla si esa caja quedó colgada. */}
                                    {heldByOther ? (
                                        <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto border-t border-black/5 dark:border-white/[0.06] pt-2.5 sm:border-0 sm:pt-0">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-content-subtle flex items-center gap-1.5 whitespace-nowrap flex-1 sm:flex-none">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                                {c.held_by.name}
                                            </span>
                                            {btnComanda}
                                            {canForceRelease && (
                                                <button
                                                    onClick={() => onForceRelease(c.id)}
                                                    className="px-2.5 h-9 rounded-lg bg-warning/10 text-warning hover:bg-warning hover:text-white font-black text-[9px] uppercase tracking-widest transition-all"
                                                    title="Liberar la cuenta para que otra caja pueda atenderla"
                                                >
                                                    Liberar
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                    /* Las acciones se muestran siempre. Antes se revelaban al pasar el
                                        cursor: en una tablet no hay hover, así que quedaban invisibles
                                        y la cuenta no se podía recuperar, imprimir ni eliminar.
                                        Van al lado de los datos, salvo en móvil, donde bajan a su
                                        propia línea: tres botones táctiles junto al texto dejaban al
                                        cliente y al cajero recortados en puntos suspensivos, que es
                                        justo lo que se viene a leer de un vistazo. */
                                    <div className="flex items-center justify-end gap-1.5 w-full sm:w-auto border-t border-black/5 dark:border-white/[0.06] pt-2.5 sm:border-0 sm:pt-0">
                                        <button
                                            onClick={() => onRemove(c.id)}
                                            className="w-9 h-9 shrink-0 mr-auto sm:mr-0 rounded-lg bg-danger/10 text-danger hover:bg-danger hover:text-white transition-all flex items-center justify-center"
                                            title={isWebOrder ? "Rechazar pedido" : "Eliminar"}
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                        {btnComanda}
                                        {isWebOrder ? (
                                            <button
                                                onClick={() => onAcceptOrder(c.id)}
                                                className="flex-1 sm:flex-none justify-center px-4 h-9 rounded-lg bg-info text-white font-black text-[10px] uppercase tracking-widest hover:brightness-110 shadow-lg shadow-info/20 transition-all flex items-center gap-1.5"
                                                title="Descuenta el inventario y lo pasa a cuentas en espera"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                Aceptar
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => onTake(c.id)}
                                                className="flex-1 sm:flex-none justify-center px-4 h-9 rounded-lg bg-brand-500 text-brand-900 font-black text-[10px] uppercase tracking-widest hover:bg-brand-600 shadow-lg shadow-brand-500/20 transition-all flex items-center gap-1.5"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                Recuperar
                                            </button>
                                        )}
                                    </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {carts.length > 0 && (
                    <div className="px-5 py-3 bg-surface-2 dark:bg-white/[0.01] border-t border-border/20 dark:border-white/5 text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-content-subtle">
                            {search
                                ? `${visibles.length} de ${carts.length} cuentas`
                                : tab === "barra"
                                    ? "Toca una cuenta para sumarle la ronda · se guarda sola"
                                    : "Guardadas en el servidor · visibles desde cualquier caja"}
                        </p>
                    </div>
                )}
            </div>

            {/* Previsualización e impresión de la comanda. Se monta encima de este listado. */}
            <OrderPreviewModal
                open={!!preview}
                onClose={() => setPreview(null)}
                order={preview}
                convertToDisplay={convertToDisplay}
                convertToSecondary={convertToSecondary}
                currSym={currSym}
                secondaryCurrency={secondaryCurrency}
            />
        </div>
    );
}
