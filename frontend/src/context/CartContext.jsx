import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { netoLineaEnTasa, descuentoDivisas, totalBsEnTasa } from "../helpers/currency";
import { api } from "../services/api";
import { onSSE } from "../services/sse";
import { useApp } from "./AppContext";
import { isOffline, esSinServidor } from "../services/offline/network";
import { guardarVenta, descartarSinCobro, siguienteNumeroProvisional } from "../services/offline/outbox";
import { descontarDeCatalogo } from "../services/offline/catalog";
import { cartKey, textoAdicionales } from "../helpers/cartLine";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { employee, notify, baseCurrency, activeCurrencies, settings, company } = useApp();

  // ── Carrito ────────────────────────────────────────────────
  const [cart, setCart] = useState([]);
  // Espejo del carrito para quien lo lee fuera del render. Se refresca acá y no en un efecto
  // porque los efectos de los hijos corren antes que los del provider: CobroPage sincroniza
  // precios en uno de ellos y leería el carrito de hace un render.
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  // Clave de idempotencia: se mantiene entre reintentos del mismo cobro
  // y se renueva sólo cuando la venta se concreta con éxito.
  const pendingKeyRef = useRef(null);
  const [heldCarts, setHeldCarts] = useState([]);
  // Id de la cuenta en espera que se está editando. Si está puesto, finalizar actualiza
  // esa venta en vez de crear una nueva (evita duplicarla y descontar stock dos veces).
  const [heldSaleId, setHeldSaleId] = useState(null);
  // Espejo en ref: loadHeldCarts se ejecuta desde efectos y respuestas asíncronas, donde
  // el valor del estado puede estar desfasado. La ref siempre tiene el actual.
  const heldSaleIdRef = useRef(null);
  // Paso por cocina de cada cuenta en la vuelta anterior, para avisar cuando una queda lista.
  const kitchenRef = useRef(null);
  // Mesa de la venta en pantalla (mapa de mesas). Viaja al pausar y al cobrar; se limpia con
  // el carrito.
  const [cartTable, setCartTable] = useState(null);
  const setHeldSale = useCallback((id) => { heldSaleIdRef.current = id; setHeldSaleId(id); }, []);
  const [quotationId, setQuotationId] = useState(null);

  // ── Moneda seleccionada ────────────────────────────────────
  // Es una preferencia de quien atiende la caja —en qué moneda quiere ver los precios—, no un
  // dato de la venta, así que sobrevive al cierre del carrito y a recargar la página. Antes
  // clearCart la reseteaba y el cajero tenía que volver a poner bolívares en cada venta.
  //
  // Se guarda el id y no el objeto: al recargar, las monedas vienen del servidor con sus tasas
  // al día, y un objeto guardado arrastraría una tasa vieja.
  const CURRENCY_KEY = "pos_display_currency";
  const [selectedCurrencyId, setSelectedCurrencyId] = useState(() => {
    const saved = localStorage.getItem(CURRENCY_KEY);
    return saved ? parseInt(saved, 10) : null;
  });
  // Si la moneda guardada dejó de estar activa, cae sola a la base en vez de quedar colgada.
  const selectedCurrency = selectedCurrencyId
    ? (activeCurrencies || []).find(c => c.id === selectedCurrencyId) || null
    : null;
  const setSelectedCurrency = useCallback((cur) => {
    const id = cur?.id ?? null;
    setSelectedCurrencyId(id);
    if (id) localStorage.setItem(CURRENCY_KEY, String(id));
    else localStorage.removeItem(CURRENCY_KEY);
  }, []);
  const currentCurrency = selectedCurrency || baseCurrency;
  const exchangeRate = currentCurrency?.exchange_rate
    ? parseFloat(currentCurrency.exchange_rate) : 1;

  // ── Serie seleccionada ─────────────────────────────────────
  const [selectedSerieId, setSelectedSerieId] = useState(null);
  const [mySeries, setMySeries] = useState([]);

  // Las series pertenecen al almacén (la sucursal factura con su propia numeración), así que
  // solo se cargan las del almacén desde el que se está vendiendo.
  const loadMySeries = useCallback(async (warehouseId) => {
    if (!employee || !warehouseId) { setMySeries([]); setSelectedSerieId(null); return; }
    try {
      const r = await api.series.getMy({ warehouse_id: warehouseId });
      // El POS solo emite facturas — las series de nota de crédito no aplican aquí
      const series = (r.data || []).filter(s => s.type !== "nc");
      setMySeries(series);
      setSelectedSerieId(prev => series.some(s => s.id === prev) ? prev : (series[0]?.id ?? null));
    } catch (e) { console.error(e); }
  }, [employee]);

  const selectSerie = useCallback((serieId) => {
    setSelectedSerieId(prev => prev === serieId ? null : serieId);
  }, []);

  // ── Promociones activas ────────────────────────────────────
  const [activePromos, setActivePromos] = useState([]);

  // Las promociones también son de la sucursal: se piden las de este almacén más las que
  // corren en todas. Sin almacén no se pide nada, porque el carrito tampoco puede cobrar.
  const loadActivePromos = useCallback(async (warehouseId) => {
    if (!warehouseId) { setActivePromos([]); return; }
    try {
      const r = await api.promotions.getActive({ warehouse_id: warehouseId });
      setActivePromos(r.data || []);
    } catch (e) { console.error(e); }
  }, []);

  // ── Descuento global ──────────────────────────────────────
  const [discountEnabled, setDiscountEnabled] = useState(false);
  // Valor tecleado en el descuento global. Se interpreta según `discountMode`: como porcentaje
  // del subtotal, o como un monto fijo en la moneda que está en pantalla —"te dejo 5$ menos"
  // es tan corriente como "te hago el 10%", y antes había que calcular el porcentaje a mano.
  const [discountPct, setDiscountPct] = useState("");
  const [discountMode, setDiscountMode] = useState("pct");   // pct | amount

  // ── Recargo (propina / servicio / delivery) ───────────────
  // Es lo contrario del descuento: suma al total. Se carga por MONTO en la moneda que el
  // cajero tiene en pantalla —así puede cobrar la propina exacta que deja el cliente— y la
  // caja ve al lado a qué porcentaje del consumo equivale.
  //
  // No entra como línea del carrito a propósito: una propina no es un producto, no descuenta
  // inventario y no debe aparecer en el reporte de lo vendido.
  const [chargeEnabled, setChargeEnabled] = useState(false);
  const [chargeLabel, setChargeLabel] = useState("Servicio");
  const [chargeInput, setChargeInput] = useState("");
  // Cómo se lee chargeInput, igual que discountMode en el descuento: "amount" es un monto en la
  // moneda de pantalla y "pct" un porcentaje del consumo neto. Por defecto monto, que es como
  // funcionaba antes y como se carga una propina ya calculada.
  const [chargeMode, setChargeMode] = useState("amount");   // amount | pct
  // En qué moneda está expresado chargeInput. El selector de arriba cambia la moneda de toda
  // la pantalla, y un monto tecleado no puede quedarse en el mismo número al cambiarla: una
  // propina de 2 Ref se convertiría sola en 2 Bs, o sea en nada. El descuento no sufre esto
  // porque es un porcentaje.
  const chargeIsVesRef = useRef(false);

  // ── Cobro a tasa de divisas ───────────────────────────────
  // El dólar se recibe por encima de la tasa oficial: la cuenta da Bs.8000 a 800 y en divisas
  // se cobran $8, a 1000. La tasa la teclea la caja en cada venta y se conserva para la
  // siguiente; el interruptor no, como el descuento. Ver descuentoDivisas (helpers/currency).
  const [fxEnabled, setFxEnabled] = useState(false);
  const [fxRateInput, setFxRateInput] = useState("");

  // ── Avance de efectivo junto a la venta ───────────────────
  // El cliente compra y además pide billetes, todo en un pase del punto. No toca la factura: se
  // anota aquí y viaja con el comprobante hasta el cobro, que lo registra en la misma operación
  // (createPayment, `cash_advance`). Ver services/cashAdvances.
  const [avanceOn, setAvanceOn] = useState(false);
  const [avanceMonto, setAvanceMonto] = useState("");
  const [avancePct, setAvancePct] = useState("");

  // ── Cliente seleccionado ───────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // ── Almacén activo ─────────────────────────────────────────
  const [employeeWarehouses, setEmployeeWarehouses] = useState([]);
  const [activeWarehouse, setActiveWarehouse] = useState(null);

  const loadEmployeeWarehouses = useCallback(async () => {
    if (!employee) return;
    try {
      const r = await api.warehouses.getByEmployee(employee.id);
      // La caja solo lista los almacenes que atienden público: un depósito guarda mercancía
      // pero no factura, y ofrecerlo acá solo lleva a vender contra el stock equivocado.
      const vendedores = (r.data || []).filter(w => w.sells !== false);
      setEmployeeWarehouses(vendedores);

      if (vendedores.length >= 1) {
        setActiveWarehouse(prev => {
          if (!prev) return vendedores[0];
          // Validar que el almacén previo siga asignado al empleado
          const stillAssigned = vendedores.find(w => w.id === prev.id);
          return stillAssigned || vendedores[0];
        });
      } else {
        setActiveWarehouse(null);
      }
    } catch (e) { console.error(e); }
  }, [employee]);

  const switchWarehouse = useCallback((warehouse) => {
    setActiveWarehouse(warehouse);
    setCart([]);
  }, []);

  // ── Carrito guardado en el equipo ──────────────────────────
  // Si se va la luz con una venta a medio armar, al volver el cajero la encuentra como la dejó:
  // productos, cliente, descuento y recargo. Va por cajero y sucursal.
  //
  // También se guarda la clave de idempotencia del cobro en curso. Si el apagón llega justo
  // mientras se enviaba la venta, el servidor pudo haberla creado sin que la respuesta llegara;
  // al reintentar con la misma clave la devuelve en vez de crear otra.
  //
  // Las cuentas en espera y las cotizaciones no se guardan aquí: ya viven en el servidor y se
  // recuperan desde sus propias listas.
  const cartStorageKey = employee?.id && activeWarehouse?.id ? `pos_cart:${employee.id}:${activeWarehouse.id}` : null;
  const restoredKeyRef = useRef(null);
  const skipSaveRef = useRef(false);

  useEffect(() => {
    if (!cartStorageKey || restoredKeyRef.current === cartStorageKey) return;
    restoredKeyRef.current = cartStorageKey;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(cartStorageKey) || "null"); } catch { /* dañado: se ignora */ }
    if (!saved?.cart?.length || cartRef.current.length) return;
    // El guardado de abajo corre en este mismo ciclo, con el carrito aún vacío, y lo borraría.
    skipSaveRef.current = true;
    setCart(saved.cart);
    setSelectedCustomer(saved.customer || null);
    setDiscountEnabled(!!saved.discountEnabled);
    setDiscountPct(saved.discountPct ?? "");
    setDiscountMode(saved.discountMode || "pct");
    setChargeEnabled(!!saved.chargeEnabled);
    setChargeInput(saved.chargeInput ?? "");
    setChargeMode(saved.chargeMode || "amount");
    setChargeLabel(saved.chargeLabel || "Servicio");
    if (saved.pendingKey) pendingKeyRef.current = saved.pendingKey;
  }, [cartStorageKey]);

  const saveCart = useCallback(() => {
    if (!cartStorageKey || restoredKeyRef.current !== cartStorageKey) return;
    try {
      if (!cart.length || heldSaleId || quotationId) { localStorage.removeItem(cartStorageKey); return; }
      localStorage.setItem(cartStorageKey, JSON.stringify({
        cart, customer: selectedCustomer,
        discountEnabled, discountPct, discountMode,
        chargeEnabled, chargeInput, chargeMode, chargeLabel,
        pendingKey: pendingKeyRef.current,
      }));
    } catch { /* almacenamiento lleno o bloqueado: el carrito sigue en pantalla */ }
  }, [cartStorageKey, cart, selectedCustomer, heldSaleId, quotationId,
    discountEnabled, discountPct, discountMode, chargeEnabled, chargeInput, chargeMode, chargeLabel]);

  useEffect(() => {
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    saveCart();
  }, [saveCart]);

  // Cambiar de sucursal cambia el juego de series: se recargan las del almacén nuevo y, si
  // la que estaba elegida no es de ahí, se reemplaza por la primera disponible.
  useEffect(() => { loadMySeries(activeWarehouse?.id); }, [activeWarehouse?.id, loadMySeries]);

  // Y el juego de promociones, por lo mismo: una promo de la otra tienda no debe seguir
  // descontando en el carrito después de cambiar de sucursal.
  useEffect(() => { loadActivePromos(activeWarehouse?.id); }, [activeWarehouse?.id, loadActivePromos]);

  // Las promociones también caducan solas. Cargarlas únicamente al cambiar de sucursal dejaba
  // a una caja abierta todo el día descontando con una promo ya vencida —o sin aplicar una que
  // acababa de empezar—, mientras el servidor, que las revalida al facturar, cobraba otra cosa:
  // el carrito mostraba un total y la factura salía con otro. Se refrescan con el mismo ritmo
  // que los productos: aviso en vivo, al volver a la pestaña y cada minuto como red de
  // seguridad (el vencimiento no dispara ningún aviso).
  useEffect(() => {
    if (!activeWarehouse?.id) return;
    const refrescar = () => loadActivePromos(activeWarehouse.id);
    const unsubSSE = onSSE('products:updated', refrescar);
    const onVisible = () => { if (document.visibilityState === 'visible') refrescar(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refrescar();
    }, 60_000);
    return () => {
      unsubSSE();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activeWarehouse?.id, loadActivePromos]);

  // ── Conversión de moneda ───────────────────────────────────
  // El precio del producto se guarda con precisión completa (5 decimales, ej. costo × margen =
  // 3.79171). En Bs se conserva esa precisión completa (para poder calibrar precios finos en el
  // catálogo); en $ se redondea a 2 decimales solo al mostrar (ver fmtMoney).
  const convertToDisplay = useCallback((baseAmount) => {
    if (!currentCurrency || currentCurrency.is_base) return baseAmount;
    return baseAmount * exchangeRate;
  }, [currentCurrency, exchangeRate]);

  const convertToBase = useCallback((displayAmount) => {
    if (!currentCurrency || currentCurrency.is_base) return displayAmount;
    return displayAmount / exchangeRate;
  }, [currentCurrency, exchangeRate]);

  // Identificar moneda secundaria para visualización dual
  // Si la actual es base (USD), la secundaria es la primera activa no-base (VES)
  // Si la actual no es base, la secundaria es la base (USD)
  const secondaryCurrency = currentCurrency?.is_base
    ? activeCurrencies.find(c => !c.is_base)
    : baseCurrency;

  const secondaryExchangeRate = secondaryCurrency?.exchange_rate
    ? parseFloat(secondaryCurrency.exchange_rate) : 1;

  const convertToSecondary = useCallback((baseAmount) => {
    if (!secondaryCurrency) return null;
    if (secondaryCurrency.is_base) return baseAmount;
    return baseAmount * secondaryExchangeRate;
  }, [secondaryCurrency, secondaryExchangeRate]);

  // ── Cart helpers ───────────────────────────────────────────
  const validateCartStock = useCallback((newCart) => {
    const usage = {};
    for (const item of newCart) {
      if (item.is_service) continue;
      if (item.is_combo && item.stock === null) continue; // combo de solo-servicios, sin límite
      if (item.is_combo && item.combo_items) {
        for (const ing of item.combo_items) {
          if (ing.ingredient_is_service) continue; // ingrediente servicio, no limita
          if (!usage[ing.ingredient_id]) {
            usage[ing.ingredient_id] = { used: 0, maxStock: ing.ingredient_stock };
          }
          usage[ing.ingredient_id].used += parseFloat(item.qty) * ing.quantity;
        }
      } else {
        if (!usage[item.id]) {
          usage[item.id] = { used: 0, maxStock: parseFloat(item.stock) || 0 };
        }
        usage[item.id].used += parseFloat(item.qty);
      }
    }
    for (const id in usage) {
      if (usage[id].used > usage[id].maxStock + 0.001) return false;
    }
    return true;
  }, []);

  const addToCart = useCallback((product, customQty = null, silentError = false) => {
    if (!activeWarehouse) { if (!silentError) notify("Selecciona una sucursal antes de cobrar", "err"); return false; }
    // Plato con adicionales (término, extras): se eligen en su ficha antes de entrar al carrito.
    // Pasa por aquí venga de donde venga —toque en la grilla, lector de código, cantidad—, así
    // que ningún camino lo mete sin elegir lo obligatorio.
    if (product.has_addons) { setAddonPick({ product, qty: customQty }); return false; }
    // stock === null significa combo de solo-servicios (sin límite de stock)
    const hasUnlimitedStock = product.is_service || (product.is_combo && product.stock === null);
    if (!hasUnlimitedStock && parseFloat(product.stock) <= 0) { if (!silentError) notify("Sin stock disponible", "err"); return false; }

    const step = parseFloat(product.qty_step) || 1;
    const initialQty = customQty !== null ? parseFloat(customQty) : step;

    // Solo se suma sobre la línea "simple" del producto: no sobre un plato con adicionales ni
    // sobre el extra de otro plato, que tienen su propia clave (ver helpers/cartLine.js).
    const ex = cart.find(i => !i.key && i.id === product.id);
    let newCart;
    if (ex) {
      const nq = parseFloat((ex.qty + initialQty).toFixed(3));
      newCart = cart.map(i => !i.key && i.id === product.id ? { ...i, qty: nq } : i);
    } else {
      newCart = [...cart, { ...product, qty: initialQty }];
    }

    if (!validateCartStock(newCart)) {
      if (!silentError) notify("Stock insuficiente de este producto o sus ingredientes", "err");
      return false;
    }
    setCart(newCart);
    return true;
  }, [activeWarehouse, notify, validateCartStock, cart]);

  // El carrito guarda una copia del producto tal como estaba al agregarlo, así que un cambio
  // de precio hecho mientras la línea ya estaba cargada —desde el catálogo, desde stock o
  // desde otra caja— no llegaba a ella: el cajero seguía viendo el precio viejo y la factura
  // salía con el vigente, porque el servidor recalcula cada línea al facturar. Cada vez que la
  // caja recarga su lista de productos (aviso en vivo o refresco periódico) se reponen aquí
  // los precios de lo que ya está en el carrito.
  //
  // Las líneas con precio pactado (`price_locked`) no se tocan: vienen de una cuenta en espera
  // o de una cotización, donde el precio acordado manda.
  const syncCartPrices = useCallback((warehouseProducts) => {
    if (!warehouseProducts?.length) return;
    const byId = new Map(warehouseProducts.map(p => [p.id, p]));
    let cambiados = 0;
    const next = cartRef.current.map(i => {
      if (i.price_locked) return i;
      const p = byId.get(i.id);
      if (!p || p.price == null) return i;
      const nuevo = parseFloat(p.price);
      if (!isFinite(nuevo) || Math.abs(nuevo - parseFloat(i.price)) < 1e-9) return i;
      cambiados++;
      return { ...i, price: nuevo };
    });
    if (!cambiados) return;
    setCart(next);
    // El cajero tiene que enterarse: el total que estaba leyendo acaba de cambiar.
    notify(cambiados === 1
      ? "Se actualizó el precio de un producto del carrito"
      : `Se actualizaron los precios de ${cambiados} productos del carrito`);
  }, [notify]);

  // Plato con adicionales que entra al carrito desde su ficha (PosAddonModal). El plato va en su
  // propia línea, con la nota de cocina; cada extra con precio va en otra línea, con su producto
  // y su precio de sucursal, igual que el servidor arma la venta: así el total de la pantalla es
  // el de la factura sin un cálculo aparte.
  const [addonPick, setAddonPick] = useState(null);   // { product, qty } cuya ficha está abierta
  const addAddonLine = useCallback((product, qty, rawNote, options = []) => {
    const cantidad = parseFloat(qty) || 1;
    const nota = String(rawNote || "").trim().slice(0, 200);
    const texto = options.filter(o => !(o.price > 0)).map(o => o.name).join(" · ");
    const key = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const plato = {
      ...product,
      key,
      qty: cantidad,
      // Nota de la línea en la venta: lo que no cuesta y lo que se escribió.
      note: [texto, nota].filter(Boolean).join(" · ") || undefined,
      // Para la caja y la comanda: lo elegido, con los extras incluidos.
      addon_options: options,
      addon_text: textoAdicionales(options),
      kitchen_note: nota || undefined,
    };
    // Un contorno sin precio que gasta inventario también va como línea, a 0 (`incluido`): es la
    // que descuenta los 150 g de papa. En pantalla no se muestra; ya se lee en el plato.
    const extras = options.filter(o => o.product_id).map(o => ({
      id: o.product_id,
      name: o.name,
      price: o.price,
      incluido: !(o.price > 0),
      unit: "unidad",
      qty_step: 1,
      is_service: !!o.is_service,
      // Sin existencia conocida (combo, servicio) no limita aquí: lo revisa el servidor.
      is_combo: !!o.is_combo,
      stock: o.is_service || o.is_combo ? null : o.stock,
      key: `${key}+${o.product_id}`,
      parentKey: key,
      qty: cantidad,
    }));
    const newCart = [...cart, plato, ...extras];
    if (!validateCartStock(newCart)) {
      notify("No hay existencia suficiente de uno de los adicionales", "err");
      return false;
    }
    setCart(newCart);
    return true;
  }, [cart, validateCartStock, notify]);

  // Quitar un plato con adicionales se lleva sus extras.
  const removeFromCart = useCallback((id) => {
    setCart(prev => prev.filter(i => cartKey(i) !== id && i.parentKey !== id));
  }, []);

  // Los extras de un plato siguen su cantidad: un "+ Tocineta" por cada hamburguesa.
  const conExtras = (lineas) => {
    const qtyDe = new Map(lineas.filter(i => i.key && !i.parentKey).map(i => [i.key, i.qty]));
    return lineas.map(i => (i.parentKey && qtyDe.has(i.parentKey) && i.qty !== qtyDe.get(i.parentKey) ? { ...i, qty: qtyDe.get(i.parentKey) } : i));
  };

  const changeQty = useCallback((id, dir) => {
    let changeOccurred = false;
    const mapped = cart.map(i => {
      if (cartKey(i) !== id) return i;
      const step = parseFloat(i.qty_step) || 1;
      let nq = parseFloat((i.qty + dir * step).toFixed(3));

      const isIntegerUnit = ["unidad", "uds", "pieza"].includes(i.unit?.toLowerCase());
      if (isIntegerUnit) nq = Math.max(1, Math.floor(nq));

      if (nq < step || nq === i.qty) return i;
      changeOccurred = true;
      return { ...i, qty: nq };
    });

    if (!changeOccurred) return;
    const newCart = conExtras(mapped);
    if (!validateCartStock(newCart)) {
      return notify("Stock límite alcanzado", "err");
    }
    setCart(newCart);
  }, [notify, validateCartStock, cart]);

  const setQtyDirect = useCallback((id, raw, silentError = false) => {
    if (raw === "") {
      setCart(cart.map(i => cartKey(i) === id ? { ...i, qty: "" } : i));
      return true;
    }
    let targetNq = parseFloat(raw);
    if (isNaN(targetNq) || targetNq < 0) return false;

    let changeOccurred = false;
    const mapped = cart.map(i => {
      if (cartKey(i) !== id) return i;
      const isIntegerUnit = ["unidad", "uds", "pieza"].includes(i.unit?.toLowerCase());
      // Tecleado a mano y no por el paso a paso (que ya redondea, ver changeQty): sin este
      // límite el campo aceptaba cualquier cantidad de decimales escritos, y KG/L/M solo
      // manejan 3.
      let nq = isIntegerUnit ? Math.floor(targetNq) : Math.round(targetNq * 1000) / 1000;

      if (nq === i.qty) return i;
      changeOccurred = true;
      return { ...i, qty: nq };
    });

    if (!changeOccurred) return true;
    const newCart = conExtras(mapped);
    if (!validateCartStock(newCart)) {
      if (!silentError) notify("Stock límite alcanzado", "err");
      return false;
    }
    setCart(newCart);
    return true;
  }, [notify, validateCartStock, cart]);

  const clearCart = useCallback(() => {
    setCart([]);
    setCartTable(null);
    setSelectedCustomer(null);
    // La moneda NO se resetea: es la preferencia de visualización del cajero y se mantiene
    // entre ventas. El cliente y la serie sí, porque pertenecen a la venta que se cerró.
    setSelectedSerieId(mySeries.length > 0 ? mySeries[0].id : null);
    setDiscountEnabled(false);
    setDiscountPct("");
    setDiscountMode("pct");
    setChargeEnabled(false);
    setChargeInput("");
    setChargeLabel("Servicio");
    setFxEnabled(false);
    setAvanceOn(false);
    setAvanceMonto("");
    setQuotationId(null);
  }, [mySeries]);

  // Pre-carga el carrito desde una cotización para editar antes de facturar
  const loadFromQuotation = useCallback(async (quot) => {
    if (!activeWarehouse) { notify("Selecciona una sucursal antes de cargar la cotización", "err"); return; }
    try {
      const wid = quot.warehouse_id || activeWarehouse.id;
      // Solo los productos de la cotización, por id: pedir "las primeras 500" del almacén
      // dejaba fuera —sin decir nada— cualquier línea que cayera más abajo en un catálogo
      // grande, y la cotización se cargaba incompleta.
      const ids = [...new Set((quot.items || []).map(i => i.product_id).filter(Boolean))];
      const res = ids.length
        ? await api.warehouses.getProducts(wid, { ids: ids.join(','), limit: ids.length })
        : { data: [] };
      const warehouseProducts = res.data || [];
      const productMap = Object.fromEntries(warehouseProducts.map(p => [p.id, p]));

      const newCart = (quot.items || []).reduce((acc, item) => {
        if (!item.product_id) return acc;
        const prod = productMap[item.product_id];
        if (!prod) return acc;
        const qty = parseFloat(item.quantity) || 1;
        const existing = acc.find(i => i.id === prod.id);
        if (existing) {
          return acc.map(i => i.id === prod.id ? { ...i, qty: i.qty + qty } : i);
        }
        // Precio pactado en la cotización: no lo pisa el refresco de precios del carrito.
        return [...acc, { ...prod, price: parseFloat(item.price), price_locked: true, qty }];
      }, []);

      setCart(newCart);
      setQuotationId(quot.id);
      if (quot.customer_id) {
        setSelectedCustomer({ id: quot.customer_id, name: quot.customer_name, rif: quot.customer_rif });
      }
      if (quot.discount_amount > 0) {
        const pct = parseFloat(quot.discount_amount) / parseFloat(quot.subtotal || quot.total) * 100;
        if (!isNaN(pct) && pct > 0) {
          setDiscountEnabled(true);
          // La cotización guarda el descuento como monto en base; se recarga como porcentaje
          // para que siga valiendo lo mismo aunque los precios hayan cambiado.
          setDiscountMode("pct");
          setDiscountPct(String(Math.round(pct * 100) / 100));
        }
      }
    } catch (e) {
      notify(e.message || "Error al cargar la cotización", "err");
    }
  }, [activeWarehouse, notify]);

  // ── Totales ────────────────────────────────────────────────
  // USD: suma precios PRECISOS, redondea solo el total final (round-after-sum).
  //   round2(sum(4.06569 × 3)) = round2(12.197) = 12.20
  //   round2(totalBs / tasa)   = round2(9000 / 737.88) = 12.20  ← cuadran exacto
  // Con round-per-line (antes): sum(round2(4.06569) × 3) = 4.07×3 = 12.21 ≠ 12.20.
  // Bs (VES): precio por línea convertido y redondeado EN Bs antes de sumar, sin cambios.
  const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;
  const vesCurrency = activeCurrencies.find(c => !c.is_base) || null;
  const vesRate = vesCurrency?.exchange_rate ? parseFloat(vesCurrency.exchange_rate) : null;
  const isVesPrimary = !!currentCurrency && !currentCurrency.is_base;

  // El recargo se teclea en la moneda de pantalla y se persiste en base (como discount_amount).
  // Cada pista lo usa sin ida y vuelta por la tasa: lo que el cajero escribió es exacto en su
  // propia moneda, y la otra pista lo convierte una sola vez.
  const chargeRaw = chargeEnabled
    ? Math.max(0, parseFloat(String(chargeInput).replace(",", ".")) || 0)
    : 0;
  // chargeUsd y chargeBs se calculan más abajo, junto a los totales: en modo porcentaje
  // dependen del consumo neto, que necesita el subtotal y los descuentos ya resueltos.

  // Cambiar la moneda de la pantalla reexpresa el recargo, no lo reescribe: lo que valía
  // Ref. 2.00 pasa a valer Bs. 1559.90, y el porcentaje sobre el consumo se mantiene. Sin
  // esto el monto se leía como si fuera de la moneda nueva y la propina se evaporaba.
  useEffect(() => {
    const eraVes = chargeIsVesRef.current;
    chargeIsVesRef.current = isVesPrimary;
    if (eraVes === isVesPrimary || !vesRate) return;
    setChargeInput(prev => {
      // En porcentaje no hay nada que reexpresar: el 10% es el mismo en las dos monedas.
      if (chargeMode !== "amount") return prev;
      const n = parseFloat(String(prev).replace(",", "."));
      if (!(n > 0)) return prev;
      return String(round2(isVesPrimary ? n * vesRate : n / vesRate));
    });
    // El descuento por monto se reexpresa igual: los 5 Ref. que se rebajaron pasan a valer
    // Bs.3.923,32. En porcentaje no hay nada que convertir, el 10% es el mismo en las dos.
    setDiscountPct(prev => {
      if (discountMode !== "amount") return prev;
      const n = parseFloat(String(prev).replace(",", "."));
      if (!(n > 0)) return prev;
      return String(round2(isVesPrimary ? n * vesRate : n / vesRate));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVesPrimary, vesRate]);

  // USD — redondeo POR LÍNEA (round2(price) × qty) → 3 × 4.07 = 12.21
  // Bs — redondeo POR LÍNEA EN Bs (round2(price × vesRate) × qty) → 3 × 3000 = 9000 (bloque independiente abajo)
  // La diferencia de 0.01 entre ambas pistas es inherente al redondeo dual y se gestiona en
  // PaymentFormModal con la tolerancia de 0.02 USD al calcular el abono en Bs.
  const subtotalUsd = cart.reduce((s, i) => s + round2(i.price) * i.qty, 0);

  // Lo tecleado en el descuento global, ya sea porcentaje o monto.
  const discountRaw = discountEnabled
    ? Math.max(0, parseFloat(String(discountPct).replace(",", ".")) || 0)
    : 0;
  // Por monto se teclea en la moneda de pantalla y cada pista lo usa sin ida y vuelta por la
  // tasa, igual que el recargo. Se topa al subtotal: un descuento mayor dejaría el total en
  // negativo y la venta cobrando al revés.
  const discountAmountUsd = Math.min(
    discountMode === "pct"
      ? subtotalUsd * (discountRaw / 100)
      : (isVesPrimary ? (vesRate ? discountRaw / vesRate : 0) : discountRaw),
    subtotalUsd
  );

  // Descuento manual de la línea, si la caja le dio uno (ver setLineDiscount). Reemplaza a la
  // promoción de esa línea, igual que en el servidor (services/sales/lineDiscount.js).
  const manualDe = (item) => (item?.ld_mode && parseFloat(item.ld_value) > 0)
    ? { mode: item.ld_mode, value: parseFloat(item.ld_value) }
    : null;
  // Descuento TOTAL de la línea sobre el bruto de su pista: el porcentaje sale de ese bruto y
  // el monto llega ya expresado en la moneda de la pista. Nunca más que la propia línea.
  const manualSobre = (m, bruto, montoEnPista) =>
    Math.min(Math.max(m.mode === "pct" ? bruto * m.value / 100 : montoEnPista, 0), bruto);

  const promoOnlyUsd = useCallback((item) => {
    for (const promo of activePromos) {
      if (!promo.product_ids?.includes(item.id)) continue;
      const p = round2(item.price); // mismo round2 que la línea de subtotalUsd
      if (promo.type === 'percentage')
        return p * item.qty * (parseFloat(promo.discount_pct) / 100);
      if (promo.type === 'buy_x_get_y') {
        const free = Math.floor(item.qty / (promo.buy_qty + promo.get_qty)) * promo.get_qty;
        return free * p;
      }
    }
    return 0;
  }, [activePromos]);

  // Lo que se le rebaja a la línea, venga de la caja o de una promoción. El nombre se quedó
  // en "promo" porque es lo que ya leen el carrito y la revisión para pintar cada línea.
  const promoLineDiscountUsd = useCallback((item) => {
    const m = manualDe(item);
    if (!m) return promoOnlyUsd(item);
    return manualSobre(m, round2(item.price) * item.qty, m.value);
  }, [promoOnlyUsd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Por separado, para que el resumen distinga "Promociones" de "Descuentos por línea".
  const promoDiscountUsd = cart.reduce((s, i) => s + (manualDe(i) ? 0 : promoOnlyUsd(i)), 0);
  const lineManualUsd = cart.reduce((s, i) => s + (manualDe(i) ? promoLineDiscountUsd(i) : 0), 0);
  const netUsd = subtotalUsd - discountAmountUsd - promoDiscountUsd - lineManualUsd;

  const promoOnlyBs = useCallback((item) => {
    if (!vesRate) return 0;
    for (const promo of activePromos) {
      if (!promo.product_ids?.includes(item.id)) continue;
      const pBs = round2((parseFloat(item.price) || 0) * vesRate);
      if (promo.type === 'percentage')
        return pBs * item.qty * (parseFloat(promo.discount_pct) / 100);
      if (promo.type === 'buy_x_get_y') {
        const free = Math.floor(item.qty / (promo.buy_qty + promo.get_qty)) * promo.get_qty;
        return free * pBs;
      }
    }
    return 0;
  }, [activePromos, vesRate]);

  // En bolívares, la línea con descuento manual se calcula como la cobra la caja y la imprime
  // el ticket (netoLineaEnTasa): bruto de la línea menos el descuento de la LÍNEA entera, con
  // un solo redondeo. Así los 200 Bs tecleados son 200 Bs en el carrito, el cobro y el papel.
  const promoLineDiscountBs = useCallback((item) => {
    if (!vesRate) return 0;
    const m = manualDe(item);
    if (!m) return promoOnlyBs(item);
    const precio = parseFloat(item.price) || 0;
    const q = parseFloat(item.qty) || 0;
    if (!(q > 0)) return 0;
    const bruto = round2(precio * vesRate) * q;
    return bruto - netoLineaEnTasa({ price: precio, quantity: q, line_discount_mode: m.mode, line_discount_value: m.value }, vesRate);
  }, [promoOnlyBs, vesRate]); // eslint-disable-line react-hooks/exhaustive-deps

  const subtotalBs = vesRate
    ? cart.reduce((s, i) => s + round2((parseFloat(i.price) || 0) * vesRate) * i.qty, 0)
    : null;
  // Misma regla que en la pista en divisas, calculada aquí en bolívares para no arrastrar el
  // redondeo de la conversión.
  const discountAmountBs = vesRate
    ? Math.min(
        discountMode === "pct"
          ? subtotalBs * (discountRaw / 100)
          : (isVesPrimary ? discountRaw : round2(discountRaw * vesRate)),
        subtotalBs
      )
    : 0;
  const promoDiscountBs = vesRate ? cart.reduce((s, i) => s + (manualDe(i) ? 0 : promoOnlyBs(i)), 0) : 0;
  const lineManualBs = vesRate ? cart.reduce((s, i) => s + (manualDe(i) ? promoLineDiscountBs(i) : 0), 0) : 0;
  const netBs = vesRate ? (subtotalBs - discountAmountBs - promoDiscountBs - lineManualBs) : null;

  // El recargo, ya con el neto resuelto. En porcentaje se aplica sobre el consumo neto —el
  // 10% es del consumo, no de sí mismo— y cada pista lo calcula en su propia moneda, sin ida
  // y vuelta por la tasa, igual que el descuento.
  const chargeUsd = chargeMode === "pct"
    ? netUsd * (chargeRaw / 100)
    : (isVesPrimary ? (vesRate ? chargeRaw / vesRate : 0) : chargeRaw);
  const chargeBs = vesRate
    ? (chargeMode === "pct"
        ? (netBs ?? 0) * (chargeRaw / 100)
        : (isVesPrimary ? chargeRaw : round2(chargeRaw * vesRate)))
    : 0;

  const totalUsd = netUsd + chargeUsd;
  const totalBs = vesRate ? (netBs + chargeBs) : null;
  // Avance de efectivo pedido junto a la venta (en Bs). No se combina con la tasa de divisas:
  // esa pide un pago en divisas y el avance va por punto o pago móvil.
  const avanceEfectivo = avanceOn && !fxEnabled ? (parseFloat(String(avanceMonto).replace(",", ".")) || 0) : 0;

  // Las líneas como las guarda la factura (createSale): precio completo y descuento POR UNIDAD
  // con 5 decimales, de la promoción o del descuento manual. Las usan la venta sin conexión,
  // que se arma aquí igual que la armaría el servidor, y la tasa de divisas.
  const promoDeLinea = (id) => {
    const p = activePromos.find(pr => pr.product_ids?.includes(id));
    return p ? { type: p.type, discount_pct: p.discount_pct, buy_qty: p.buy_qty, get_qty: p.get_qty } : null;
  };
  // Misma cuenta que calcLineDiscount en el servidor (services/sales/promoDiscounts.js).
  const descuentoPromo = (promo, unit, qty) => {
    if (promo?.type === "percentage") return parseFloat((unit * qty * parseFloat(promo.discount_pct) / 100).toFixed(5));
    if (promo?.type === "buy_x_get_y") {
      const gratis = Math.floor(qty / (promo.buy_qty + promo.get_qty)) * promo.get_qty;
      return parseFloat((gratis * unit).toFixed(5));
    }
    return 0;
  };
  // Dos pistas, como createSale: el total en $ con el precio redondeado por línea (descUsd), y
  // el descuento por unidad de cada línea con el precio completo.
  const lineasFactura = () => cart.filter(i => parseFloat(i.qty) > 0).map(i => {
    const quantity = parseFloat(i.qty);
    const price = parseFloat(i.price) || 0;
    // El descuento manual reemplaza a la promoción, como en createSale.
    const manual = manualDe(i);
    const promo = manual ? null : promoDeLinea(i.id);
    const descLinea = (unit) => manual ? manualSobre(manual, unit * quantity, manual.value) : descuentoPromo(promo, unit, quantity);
    const discount = quantity > 0 ? parseFloat((descLinea(price) / quantity).toFixed(5)) : 0;
    return {
      product_id: i.id, name: i.name, price, quantity, discount, promo, manual,
      line_discount_mode: manual?.mode ?? null, line_discount_value: manual?.value ?? null,
      subtotal: parseFloat(((price - discount) * quantity).toFixed(5)),
      descUsd: descLinea(round2(price)),
    };
  });

  // Tasa de divisas: solo con bolívares en la caja y por encima de la tasa del sistema (por
  // debajo sería un recargo, y para eso está el suyo). El total en Bs no cambia —a esa tasa, en
  // bolívares se paga lo de siempre—; baja el de divisas, y la diferencia viaja como descuento.
  const fxRate = parseFloat(String(fxRateInput).replace(",", ".")) || 0;
  const fxActivo = fxEnabled && !!vesRate && fxRate > vesRate && (totalBs ?? 0) > 0;
  const fxDiscount = fxActivo
    ? descuentoDivisas({ lineas: lineasFactura(), manual: discountAmountUsd, recargo: chargeUsd, totalBs, tasa: fxRate })
    : 0;
  const totalUsdCobro = totalUsd - fxDiscount;
  // Los bolívares que va a pedir el cobro a la tasa especial. Son los de siempre salvo, a veces,
  // un céntimo de redondeo: se muestran estos para que pantalla, cobro y ticket digan lo mismo.
  const totalBsCobro = fxDiscount > 0
    ? totalBsEnTasa({ lineas: lineasFactura(), descuento: discountAmountUsd + fxDiscount, recargo: chargeUsd, tasa: fxRate })
    : totalBs;
  // Lo que viaja al servidor sobre la tasa. `fx_rate: null` la quita (updateSale).
  const fxPayload = () => fxDiscount > 0
    // fx_base_rate: la tasa del sistema con que se calculó la rebaja; el ticket en Bs va a ella.
    ? { fx_rate: fxRate, fx_discount: fxDiscount, fx_currency_id: vesCurrency?.id ?? null, fx_base_rate: vesRate }
    : { fx_rate: null, fx_discount: 0, fx_currency_id: null };

  // ── Mapeo a "principal"/"secundaria" según la moneda seleccionada en el toggle ──
  // (subtotalUsd/discountAmountUsd/promoDiscountUsd/totalUsd se mantienen con estos nombres
  // porque checkout()/saveQuotation() los envían tal cual al backend, siempre en USD).
  const subtotalBase    = subtotalUsd;
  const discountAmount  = discountAmountUsd;
  const promoLineDiscount = promoLineDiscountUsd;
  const promoDiscount   = promoDiscountUsd;
  const totalBase        = totalUsdCobro;

  const subtotalDisplay        = isVesPrimary ? (subtotalBs ?? 0) : subtotalUsd;
  const promoDiscountDisplay   = isVesPrimary ? promoDiscountBs : promoDiscountUsd;
  const discountAmountDisplay  = isVesPrimary ? discountAmountBs : discountAmountUsd;
  const promoLineDiscountDisplay = isVesPrimary ? promoLineDiscountBs : promoLineDiscountUsd;
  const lineManualDiscountDisplay = isVesPrimary ? lineManualBs : lineManualUsd;

  // Descuento manual de una línea. `value` es el porcentaje, o el monto de la LÍNEA entera en
  // moneda base con 5 decimales (como discount_amount: con 2, lo tecleado en bolívares no
  // vuelve redondo). Sin modo o sin valor se quita y la línea vuelve a su promoción.
  const setLineDiscount = useCallback((id, mode, value) => {
    setCart(prev => prev.map(i => {
      if (cartKey(i) !== id) return i;
      const v = parseFloat(value);
      if (!mode || !(v > 0)) {
        const { ld_mode, ld_value, ...rest } = i; // eslint-disable-line no-unused-vars
        return rest;
      }
      return { ...i, ld_mode: mode, ld_value: parseFloat(v.toFixed(5)) };
    }));
  }, []);
  // Lo que viaja al servidor por línea: null quita el descuento (updateSale distingue null de
  // "no lo trae", que conserva el que tenía la cuenta en espera).
  const ldPayload = (i) => { const m = manualDe(i); return m ? { mode: m.mode, value: m.value } : null; };
  const totalDisplay    = isVesPrimary ? (totalBsCobro ?? 0) : totalUsdCobro;
  const totalSecondary  = isVesPrimary ? totalUsdCobro : (totalBsCobro ?? convertToSecondary(totalUsdCobro));

  // Lo que se muestra del recargo: el monto en la moneda de pantalla (tal cual se tecleó) y
  // el porcentaje que representa sobre el consumo neto, que es la lectura que le interesa a
  // la caja ("¿esta propina es el 10%?"). El neto va antes del recargo: un 10% sobre el
  // consumo, no sobre sí mismo.
  const chargeAmountBase    = chargeUsd;
  const chargeAmountDisplay = isVesPrimary ? chargeBs : chargeUsd;
  const netBeforeChargeDisplay = isVesPrimary ? (netBs ?? 0) : netUsd;
  const chargePct = netBeforeChargeDisplay > 0
    ? (chargeAmountDisplay / netBeforeChargeDisplay) * 100
    : 0;

  // Rellena el monto a partir de un porcentaje del neto: los botones de 10% / 15% del POS.
  // Escribe en el mismo input que el cajero puede editar a mano, así que después de tocarlo
  // el monto sigue siendo suyo.
  const setChargeFromPct = useCallback((pct) => {
    setChargeEnabled(true);
    // En modo porcentaje el atajo es el propio número: escribir el monto ahí lo leería como
    // un 1.234%. En modo monto se rellena la cifra, que el cajero puede seguir ajustando.
    if (chargeMode === "pct") return setChargeInput(String(parseFloat(pct) || 0));
    const base = isVesPrimary ? (netBs ?? 0) : netUsd;
    if (!(base > 0)) return;
    setChargeInput(String(round2(base * (parseFloat(pct) || 0) / 100)));
  }, [chargeMode, isVesPrimary, netBs, netUsd]);


  // ── Cuentas en espera ─────────────────────────────────────
  // Antes vivían en estado local: solo existían en la máquina que las creó y se perdían
  // al recargar. Ahora son ventas reales con status 'espera'. Se listan por la sucursal
  // activa: dos sucursales sin nada que ver entre sí no necesitan ver la barra la una de
  // la otra, y menos poder cobrarla por error. Los pedidos del catálogo público ('pedido')
  // son la excepción —todavía no tienen sucursal asignada— y el backend los deja pasar
  // igual (ver getAllSales.js). No aparecen en Facturas Pendientes porque ese listado
  // filtra borrador/pendiente/parcial.
  const loadHeldCarts = useCallback(async () => {
    if (!employee) return;
    try {
      const res = await api.sales.getHeld(activeWarehouse ? { warehouse_id: activeWarehouse.id } : {});
      // Aviso de la pantalla de cocina: un pedido que en la vuelta anterior seguía en cocina y
      // ahora está listo para llevarlo a la mesa. La primera carga no avisa nada.
      const previo = kitchenRef.current;
      const actual = new Map((res.data || []).map(s => [s.id, s.kitchen_status]));
      if (previo) {
        for (const s of res.data || []) {
          const antes = previo.get(s.id);
          if (s.kitchen_status === "lista" && (antes === "nueva" || antes === "preparando")) {
            notify(`Pedido listo para entregar: ${s.web_customer_name || s.customer_name || `#${s.id}`}`, "ok");
          }
        }
      }
      kitchenRef.current = actual;
      // La cuenta que esta caja tiene abierta en el carrito no se lista: sigue en 'espera'
      // en el servidor, pero aquí ya está "en uso".
      // Con el módulo Pedidos (extra pedidos web), los pedidos del catálogo sin aceptar viven allá:
      // aquí solo llegan ya aceptados, como cuenta en espera.
      const conPedidos = !!company?.pedidos_web_enabled;
      setHeldCarts((res.data || []).filter(s => s.id !== heldSaleIdRef.current && !(conPedidos && s.status === "pedido")));
    } catch {
      // Silencioso: es una carga de fondo, no debe interrumpir el cobro en curso.
    }
  }, [employee, activeWarehouse, notify, company?.pedidos_web_enabled]);

  // El carrito vive solo en memoria: al recargar la página se pierde, pero el bloqueo que
  // esta caja puso al recuperar una cuenta sigue en el servidor. Sin esto, un F5 dejaba la
  // cuenta trabada a nombre de un carrito que ya no existe, y nadie podía atenderla hasta
  // que venciera el plazo.
  //
  // Corre una sola vez al entrar, y ahí la premisa es segura: si acabo de cargar la página
  // no tengo ninguna cuenta abierta, así que cualquier bloqueo mío es un resto.
  const releasedOwnLocksRef = useRef(false);

  const releaseOwnStaleLocks = useCallback(async () => {
    if (releasedOwnLocksRef.current) return;
    releasedOwnLocksRef.current = true;
    try {
      const res = await api.sales.getHeld();
      const mine = (res.data || []).filter(s => s.held_by?.is_mine);
      if (!mine.length) return;
      await Promise.allSettled(mine.map(s => api.sales.release(s.id)));
    } catch {
      // Silencioso: si falla, el bloqueo caduca solo y un admin puede soltarlo.
    }
  }, []);

  // CartProvider envuelve toda la app, así que sin esta guarda la petición saldría
  // también en la pantalla de login: un 401 dispararía el refresh de token y la recarga.
  //
  // Se repite cada tanto por lo mismo que la grilla de productos (ver REFRESH_MS en
  // useCobroProducts): con el backend en serverless los avisos en vivo no llegan, y aquí
  // además hay que ver las cuentas que abren las otras cajas y cuáles quedaron bloqueadas.
  useEffect(() => {
    if (!employee) return;
    // El orden importa: primero se sueltan los restos de la sesión anterior, y recién
    // entonces se pide la lista, para que no aparezcan bloqueadas por uno mismo.
    releaseOwnStaleLocks().finally(loadHeldCarts);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadHeldCarts();
    }, 25_000);
    const onVisible = () => { if (document.visibilityState === 'visible') loadHeldCarts(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [employee, loadHeldCarts, releaseOwnStaleLocks]);

  // Suelta la cuenta al cerrar o recargar la pestaña, para que otra caja pueda tomarla en
  // el acto en vez de esperar a que este cajero vuelva a entrar. `keepalive` permite que la
  // petición sobreviva a la descarga de la página; si aun así no llega, la limpieza de
  // arriba lo resuelve en el próximo arranque.
  useEffect(() => {
    const onUnload = () => {
      const id = heldSaleIdRef.current;
      if (!id) return;
      try {
        const token = localStorage.getItem("pos_token");
        fetch(`${import.meta.env.VITE_API_URL || ""}/api/sales/${id}/claim`, {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          keepalive: true,
        });
      } catch { /* la página se está cerrando: no hay a quién avisar */ }
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, []);

  // Sin parámetros a propósito: se invoca como onClick={holdCart} y con el atajo F4, así
  // que cualquier argumento sería el evento del clic, no un callback.
  const holdCart = useCallback(async () => {
    if (cart.length === 0) return notify("No hay productos para poner en espera", "info");
    if (!activeWarehouse) return notify("Selecciona una sucursal antes de continuar", "err");
    if (!selectedSerieId) return notify("La serie es requerida", "err");

    setLoading(true);
    try {
      const createHold = () => api.sales.create({
        items: cart.filter(i => parseFloat(i.qty) > 0).map(i => ({ product_id: i.id, quantity: parseFloat(i.qty), line_discount: ldPayload(i), note: i.note })),
        paid: 0,
        customer_id: selectedCustomer?.id || null,
        employee_id: employee?.id || null,
        currency_id: currentCurrency?.id || null,
        exchange_rate: exchangeRate,
        serie_id: selectedSerieId,
        warehouse_id: activeWarehouse.id,
        discount_amount: discountAmount,
        service_charge: chargeAmountBase,
        service_charge_label: chargeLabel,
        table_id: cartTable?.id || null,
        hold: true,
      });

      // Si la cuenta ya existía (se recuperó para agregar productos), se actualiza en vez
      // de crear otra: así no se duplica ni se descuenta el stock dos veces.
      let recreated = false;
      if (heldSaleId) {
        try {
          await api.sales.update(heldSaleId, {
            items: cart.filter(i => parseFloat(i.qty) > 0).map(i => ({ product_id: i.id, price: i.price, qty: parseFloat(i.qty), line_discount: ldPayload(i), note: i.note ?? null })),
            discount_amount: discountAmount,
            // La tasa de divisas se elige al cobrar: una cuenta en espera no la guarda.
            fx_rate: null,
            service_charge: chargeAmountBase,
            service_charge_label: chargeLabel,
            // La cabecera viaja también al re-pausar: si el cajero cambió el cliente o la
            // moneda antes de volver a dejarla en espera, la cuenta debe quedar con lo que
            // se ve en pantalla, no con lo que tenía al abrirla.
            customer_id: selectedCustomer?.id || null,
            currency_id: currentCurrency?.id || null,
            exchange_rate: exchangeRate,
            serie_id: selectedSerieId,
            table_id: cartTable?.id ?? null,
          });
        } catch (e) {
          // Otra caja la eliminó o la cobró mientras se atendía: se guarda como cuenta
          // nueva para no perder lo que el cajero llevaba armado.
          if (!isStaleSale(e)) throw e;
          await createHold();
          recreated = true;
        }
      } else {
        await createHold();
      }
      setHeldSale(null);
      clearCart();
      notify(recreated
        ? "Otra caja eliminó esa cuenta. Se guardó como una cuenta en espera nueva."
        : "Cuenta puesta en espera");
      // El listado se refresca en segundo plano: el cajero ya puede seguir vendiendo sin
      // aguardar un segundo viaje a la red. El intervalo de 25s lo actualiza igual.
      loadHeldCarts();
    } catch (e) {
      notify(e.message || "No se pudo poner la cuenta en espera", "err");
    } finally {
      setLoading(false);
    }
  }, [cart, heldSaleId, activeWarehouse, selectedSerieId, selectedCustomer, employee,
    currentCurrency, exchangeRate, discountAmount, chargeAmountBase, chargeLabel, cartTable,
    clearCart, loadHeldCarts, notify]);

  // Dos cajas pueden acabar sobre la misma cuenta en espera: una la recupera y otra la
  // elimina o la cobra antes de que la primera termine. Ahí el PATCH devuelve SALE_GONE
  // (una cuenta en espera se borra de verdad, ver cancelSale) o SALE_NOT_EDITABLE (ya la
  // cobraron), y el cajero se quedaba con el carrito lleno, el cliente delante y ninguna
  // salida: reintentar daba siempre el mismo error.
  //
  // Rehacerla como venta nueva es seguro: quien la eliminó devolvió el inventario al
  // anularla, así que la venta nueva lo descuenta otra vez sin duplicar nada.
  const isStaleSale = (e) => e?.code === "SALE_GONE" || e?.code === "SALE_NOT_EDITABLE";

  // Acepta un pedido llegado del catálogo público. Hasta aquí no había tocado inventario:
  // el servidor lo descuenta ahora, del almacén activo de esta caja, y el pedido pasa a
  // ser una cuenta en espera normal que se recupera y se cobra como cualquier otra.
  const acceptWebOrder = useCallback(async (saleId) => {
    if (!activeWarehouse) return notify("Selecciona una sucursal antes de aceptar el pedido", "err");
    // El pedido nace sin serie porque lo creó el cliente desde el catálogo. Se le asigna
    // la de esta caja al aceptarlo; sin ella la venta llegaría a cobrarse sin correlativo.
    if (!selectedSerieId) return notify("La serie es requerida", "err");
    try {
      await api.sales.acceptOrder(saleId, {
        warehouse_id: activeWarehouse.id,
        serie_id: selectedSerieId,
      });
      await loadHeldCarts();
      notify("Pedido aceptado. Está en cuentas en espera.");
    } catch (e) {
      notify(e.message || "No se pudo aceptar el pedido", "err");
    }
  }, [activeWarehouse, selectedSerieId, loadHeldCarts, notify]);

  // Recupera una cuenta al carrito para seguir agregándole productos o cobrarla.
  const takeHeldCart = useCallback(async (saleId) => {
    const held = heldCarts.find(h => h.id === saleId);
    if (!held) return;
    if (!activeWarehouse) return notify("Selecciona una sucursal antes de continuar", "err");

    try {
      // Las líneas guardadas solo traen product_id/precio/cantidad; hay que rehidratarlas
      // con los datos del producto (unidad, imagen, stock) que el carrito necesita. Se
      // piden SOLO los productos de esta cuenta: antes se traía el catálogo entero (hasta
      // 500 fichas, con su agregado de ventas) para rehidratar tres líneas.
      const wid = held.warehouse_id || activeWarehouse.id;
      const ids = [...new Set((held.items || []).map(i => i.product_id))];

      // El claim reserva la cuenta en el servidor: si otra caja se adelantó, el 409 llega
      // aquí y el cajero se entera antes de ponerse a trabajar sobre algo que no podrá
      // cobrar. No depende de la carga de productos, así que van en paralelo.
      const [, res] = await Promise.all([
        api.sales.claim(saleId),
        api.warehouses.getProducts(wid, { ids: ids.join(','), limit: ids.length || 1 }),
      ]);
      const productMap = Object.fromEntries((res.data || []).map(p => [p.id, p]));

      // El stock que devuelve el almacén ya tiene descontado lo que ESTA cuenta apartó al
      // pausarla, así que usarlo tal cual deja al cajero sin poder subir la cantidad: con 9
      // empanadas físicas y 2 en la cuenta, el almacén reporta 7 y el carrito trataba ese 7
      // como el techo, cuando el techo real son las 9.
      //
      // Se le devuelve lo apartado por la propia línea. Es lo mismo que hace updateSale en
      // el servidor: restaura lo que la venta tenía y recién entonces descuenta lo nuevo.
      const withOwnStock = (prod, qty) => {
        if (prod.is_service) return prod;

        if (prod.is_combo) {
          // En un combo el límite lo ponen los ingredientes, no el combo en sí: a cada uno
          // se le devuelve lo que esta cuenta consumía de él.
          return {
            ...prod,
            stock: prod.stock === null ? null : parseFloat(prod.stock || 0) + qty,
            combo_items: (prod.combo_items || []).map(ing => ing.ingredient_is_service ? ing : {
              ...ing,
              ingredient_stock: parseFloat(ing.ingredient_stock || 0) + qty * parseFloat(ing.quantity || 1),
            }),
          };
        }

        return { ...prod, stock: parseFloat(prod.stock || 0) + qty };
      };

      // Los adicionales vuelven colgados del plato que tienen delante (la venta los guarda
      // detrás de él): siguen su cantidad y se van con él, igual que al armarlo en la caja.
      const platoDe = new Map();
      let ultimoPlato = null;
      for (const item of held.items || []) {
        const prod = productMap[item.product_id];
        if (!prod) continue;
        if (prod.is_addon && ultimoPlato) platoDe.set(item.id, ultimoPlato);
        else if (!prod.is_addon) ultimoPlato = item;
      }
      const conAdicional = new Set([...platoDe.values()].map(p => p.id));

      const newCart = (held.items || []).reduce((acc, item) => {
        const prod = productMap[item.product_id];
        if (!prod) return acc;
        const plato = platoDe.get(item.id);
        if (plato) {
          const precio = parseFloat(item.price);
          return [...acc, {
            ...withOwnStock(prod, parseFloat(item.quantity) || 1), price: precio, price_locked: true,
            qty: parseFloat(item.quantity) || 1, incluido: !(precio > 0),
            key: `h${item.id}`, parentKey: `h${plato.id}`,
          }];
        }
        const qty = parseFloat(item.quantity) || 1;
        // El precio con que se abrió la cuenta manda: es el que updateSale vuelve a grabar
        // al cobrarla, así que el refresco de precios no debe cambiarlo por debajo.
        // El descuento manual que se le dio vuelve con la línea (ver sale_items.line_discount_*).
        const ld = item.line_discount_mode ? { ld_mode: item.line_discount_mode, ld_value: parseFloat(item.line_discount_value) } : {};
        // Una cuenta puede traer el mismo producto en varias líneas (dos hamburguesas con distinto
        // término, o el extra de dos platos): desde la segunda llevan clave propia para que cada una
        // se maneje sola (ver helpers/cartLine.js). La nota vuelve con la línea.
        const repetido = acc.some(l => l.id === prod.id);
        return [...acc, {
          ...withOwnStock(prod, qty), price: parseFloat(item.price), price_locked: true, qty, ...ld,
          note: item.note || undefined,
          ...(repetido || conAdicional.has(item.id) ? { key: `h${item.id}` } : {}),
        }];
      }, []);

      setCart(newCart);
      setHeldSale(held.id);
      setCartTable(held.table_id ? { id: held.table_id, name: held.table_name } : null);
      if (held.customer_id) {
        setSelectedCustomer({ id: held.customer_id, name: held.customer_name, rif: held.customer_rif });
      }
      if (held.serie_id) setSelectedSerieId(held.serie_id);

      // El descuento vuelve con la cuenta, por lo mismo que el recargo: se guardó como monto
      // en base y el carrito lo repone como monto en la moneda de pantalla. Sin esto, una
      // cuenta pausada con descuento reaparecía por el total completo —el listado de cuentas
      // sí mostraba el rebajado— y al cobrarla el carrito enviaba 0 y lo borraba.
      const heldDiscount = parseFloat(held.discount_amount || 0);
      if (heldDiscount > 0) {
        setDiscountEnabled(true);
        setDiscountMode("amount");
        setDiscountPct(String(round2(isVesPrimary && vesRate ? heldDiscount * vesRate : heldDiscount)));
      } else {
        setDiscountEnabled(false);
        setDiscountPct("");
      }

      // El recargo vuelve con la cuenta. Sin esto, reabrir una mesa que ya tenía servicio
      // cargado lo borraba en silencio al cobrarla: el carrito enviaría 0 y pisaría el monto
      // guardado. Llega en moneda base y se repone en la moneda que la caja tiene en pantalla.
      const heldCharge = parseFloat(held.service_charge || 0);
      if (heldCharge > 0) {
        setChargeEnabled(true);
        setChargeLabel(held.service_charge_label || "Servicio");
        // La cuenta guarda el recargo como monto en base: se repone como monto, sea cual sea
        // el modo en que estuviera el selector.
        setChargeMode("amount");
        setChargeInput(String(round2(isVesPrimary && vesRate ? heldCharge * vesRate : heldCharge)));
      } else {
        setChargeEnabled(false);
        setChargeInput("");
      }

      // Sale del listado: ya está en el carrito de esta caja, y dejarla visible invitaría
      // a que otra la recupere en paralelo. En el servidor sigue en 'espera', así que si
      // se abandona sin cobrarla ni volver a pausarla, reaparece en la próxima carga.
      setHeldCarts(prev => prev.filter(h => h.id !== held.id));
      notify("Cuenta recuperada");
    } catch (e) {
      notify(e.message || "No se pudo recuperar la cuenta", "err");
    }
  }, [heldCarts, activeWarehouse, isVesPrimary, vesRate, notify]);

  // Suelta el bloqueo de una cuenta que quedó tomada por una caja que ya no la está
  // atendiendo (se cerró el navegador, se fue el cajero). El bloqueo caduca solo, pero con
  // un cliente esperando no hay por qué aguardar el plazo: un administrador la destraba aquí.
  const releaseHeldCart = useCallback(async (saleId) => {
    try {
      await api.sales.release(saleId);
      await loadHeldCarts();
      notify("Cuenta liberada");
    } catch (e) {
      notify(e.message || "No se pudo liberar la cuenta", "err");
    }
  }, [loadHeldCarts, notify]);

  // Eliminar devuelve el inventario: cancelSale restaura el stock de cada línea.
  const removeHeldCart = useCallback(async (saleId) => {
    try {
      await api.sales.cancel(saleId);
      if (heldSaleId === saleId) { setHeldSale(null); clearCart(); }
      await loadHeldCarts();
      notify("Cuenta en espera eliminada");
    } catch (e) {
      notify(e.message || "No se pudo eliminar la cuenta", "err");
    }
  }, [heldSaleId, clearCart, loadHeldCarts, notify]);

  // ── Guardar cotización ────────────────────────────────────
  const saveQuotation = useCallback(async (onSuccess) => {
    if (!cart.length) return notify("El carrito está vacío", "err");
    if (!activeWarehouse) return notify("Selecciona una sucursal antes de continuar", "err");
    // Igual que el cobro: una cotización es un documento nominal que se entrega y luego se
    // busca por cliente. Sin cliente el papel sale sin destinatario y la cotización solo se
    // puede volver a encontrar por su número.
    if (!selectedCustomer) return notify("El cliente es requerido", "err");

    setLoading(true);
    try {
      const res = await api.quotations.create({
        items: cart.filter(i => parseFloat(i.qty) > 0).map(i => ({
          product_id:   i.id,
          product_name: i.name,
          quantity:     parseFloat(i.qty),
          // La cotización no tiene descuento por línea: se pacta dentro del precio, que es lo
          // que guarda y lo que la caja cobra al recuperarla (precio pactado).
          price:        (() => {
            const m = manualDe(i); const q = parseFloat(i.qty); const pr = parseFloat(i.price);
            return m && q > 0 ? parseFloat((pr - manualSobre(m, pr * q, m.value) / q).toFixed(5)) : pr;
          })(),
        })),
        customer_id:     selectedCustomer?.id || null,
        customer_name:   selectedCustomer?.name || null,
        customer_rif:    selectedCustomer?.rif || null,
        employee_id:     employee?.id || null,
        currency_id:     currentCurrency?.id || null,
        exchange_rate:   exchangeRate,
        warehouse_id:    activeWarehouse.id,
        discount_amount: discountAmount,
      });
      clearCart();
      onSuccess?.(res.data);
    } catch (e) {
      notify(e.message, "err");
    } finally {
      setLoading(false);
    }
  }, [cart, activeWarehouse, selectedCustomer, employee, currentCurrency, exchangeRate,
    discountAmount, notify, clearCart]);

  // ── Generar factura (sin pago aún) ─────────────────────────
  const checkout = useCallback(async (onSuccess) => {
    // Guard contra doble envío: evita ventas duplicadas por doble clic
    // o por la tecla Enter disparada dos veces antes de que termine la petición.
    if (submittingRef.current) return;
    if (!cart.length) return notify("El carrito está vacío", "err");
    // Las líneas en cero se descartan al armar el pedido; si no queda ninguna, el servidor
    // respondería "items es requerido", que no le dice nada a quien está en la caja.
    if (!cart.some(i => parseFloat(i.qty) > 0)) return notify("Ningún producto tiene cantidad", "err");
    if (!activeWarehouse) return notify("Selecciona una sucursal antes de continuar", "err");
    if (!selectedCustomer) return notify("El cliente es requerido", "err");
    if (!selectedSerieId) return notify("La serie es requerida", "err");

    submittingRef.current = true;
    setLoading(true);
    // Se genera una vez y se reutiliza en reintentos del mismo cobro:
    // si un reintento ya había creado la venta, el backend la devuelve
    // en lugar de duplicarla.
    if (!pendingKeyRef.current) {
      pendingKeyRef.current =
        (crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      // Al disco antes de enviar: si se va la luz con la petición en vuelo, la clave sobrevive.
      saveCart();
    }

    // ── Venta sin conexión ──
    // No hay servidor que cree la venta: se arma aquí, igual que la armaría createSale, y se
    // guarda en la cola del equipo (offline/outbox.js) para enviarla cuando vuelva internet.
    // Lleva la misma clave de idempotencia: si un intento en línea alcanzó a crearla sin que
    // llegara la respuesta, al sincronizar el servidor devuelve esa en vez de duplicarla.
    const ventaSinConexion = async () => {
      const key = pendingKeyRef.current;
      const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
      // La promoción que el carrito aplicó a cada línea viaja con ella: al sincronizar puede
      // haber vencido, y se cobra la que vio el cliente.
      const lineas = lineasFactura();
      // El de divisas viaja dentro del descuento de la venta, como en línea.
      const fx = fxPayload();
      const descuento = parseFloat(((parseFloat(discountAmount) || 0) + fx.fx_discount).toFixed(5));
      const recargo = Math.max(0, parseFloat(chargeAmountBase) || 0);
      const recargoLabel = recargo > 0 ? (chargeLabel?.trim().slice(0, 40) || "Servicio") : null;
      const total = Math.max(0, parseFloat(
        (lineas.reduce((s, l) => s + r2(l.price) * l.quantity - l.descUsd, 0) - descuento + recargo).toFixed(2)
      ));
      const items = lineas.map(({ descUsd, promo, manual, ...l }) => l); // eslint-disable-line no-unused-vars
      const serie = mySeries.find(s => s.id === selectedSerieId);
      const ref = siguienteNumeroProvisional();
      const soldAt = new Date().toISOString();

      // El mismo formato que devuelve POST /sales: el modal de cobro y el ticket lo leen igual.
      const venta = {
        id: null, offline: true, offline_key: key, offline_ref: ref, invoice_number: null,
        total, total_precise: parseFloat(items.reduce((s, l) => s + l.subtotal, 0).toFixed(5)),
        status: "borrador", amount_paid: 0, balance: total, credit_applied: 0,
        items, discount_amount: descuento, service_charge: recargo, service_charge_label: recargoLabel,
        ...fx,
        exchange_rate: exchangeRate, currency_id: currentCurrency?.id || null,
        customer_id: selectedCustomer?.id || null, customer_name: selectedCustomer?.name || null,
        customer_rif: selectedCustomer?.rif || null,
        employee_id: employee?.id || null, employee_name: employee?.full_name || null,
        warehouse_id: activeWarehouse.id, warehouse_name: activeWarehouse.name,
        serie_id: selectedSerieId, serie_name: serie?.name || null,
        currency_symbol: currentCurrency?.symbol || null, currency_code: currentCurrency?.code || null,
        created_at: soldAt,
      };
      try {
        await guardarVenta({
          key, ref, sold_at: soldAt,
          company_id: employee?.company_id ?? null,
          employee_id: employee?.id || null,
          warehouse_id: activeWarehouse.id,
          sale: {
            serie_id: selectedSerieId,
            customer_id: selectedCustomer?.id || null,
            currency_id: currentCurrency?.id || null,
            exchange_rate: exchangeRate,
            discount_amount: descuento,
            ...fx,
            service_charge: recargo,
            service_charge_label: recargoLabel,
            items: lineas.map(l => ({ product_id: l.product_id, quantity: l.quantity, price: l.price, promo: l.promo, line_discount: l.manual })),
          },
          receipt: venta,
          // Para volver al carrito si la venta no llega a cobrarse.
          cart, customer: selectedCustomer,
        });
      } catch {
        throw new Error("No se pudo guardar la venta en este equipo. Revisa que el navegador no esté en modo privado.");
      }
      descontarDeCatalogo(activeWarehouse.id, items).catch(() => {});
      setReceipt({
        ...venta,
        customerName: selectedCustomer?.name || null,
        customerRif: selectedCustomer?.rif || null,
        currency: currentCurrency,
        exchangeRate,
        serie,
      });
      pendingKeyRef.current = null;
      clearCart();
      onSuccess?.();
    };

    if (isOffline()) {
      try {
        if (heldSaleId) notify("Las cuentas en espera necesitan conexión para cobrarse", "err");
        else await ventaSinConexion();
      } catch (e) {
        notify(e.message, "err");
      } finally {
        setLoading(false);
        submittingRef.current = false;
      }
      return;
    }

    try {
      // Si se está cobrando una cuenta en espera, la venta YA existe: se actualizan sus
      // líneas (por si se agregaron rondas) y se pasa a 'borrador' para que el cobro le
      // asigne el correlativo. Crear una nueva duplicaría la venta y el descuento de stock.
      const createPayload = () => ({
        items: cart.filter(i => parseFloat(i.qty) > 0).map(i => ({ product_id: i.id, quantity: parseFloat(i.qty), line_discount: ldPayload(i), note: i.note })),
        paid: 0,
        customer_id: selectedCustomer?.id || null,
        employee_id: employee?.id || null,
        currency_id: currentCurrency?.id || null,
        exchange_rate: exchangeRate,
        serie_id: selectedSerieId,
        warehouse_id: activeWarehouse.id,
        // El descuento de divisas va dentro del de la venta; fx_discount dice cuánto es suyo.
        discount_amount: parseFloat((discountAmount + fxDiscount).toFixed(5)),
        ...fxPayload(),
        service_charge: chargeAmountBase,
        service_charge_label: chargeLabel,
        idempotency_key: pendingKeyRef.current,
        quotation_id: quotationId || null,
        table_id: cartTable?.id || null,
      });

      let res;
      if (heldSaleId) {
        try {
          res = await api.sales.update(heldSaleId, {
            items: cart.filter(i => parseFloat(i.qty) > 0).map(i => ({ product_id: i.id, price: i.price, qty: parseFloat(i.qty), line_discount: ldPayload(i), note: i.note ?? null })),
            discount_amount: parseFloat((discountAmount + fxDiscount).toFixed(5)),
            ...fxPayload(),
            service_charge: chargeAmountBase,
            service_charge_label: chargeLabel,
            status: "borrador",
            // Se cobra con el cliente y la moneda que hay en pantalla, no con los que tenía
            // la cuenta al pausarse: en restaurante la cuenta se abre a nombre de la mesa y
            // el cliente real se elige justo antes de cobrar.
            customer_id: selectedCustomer?.id || null,
            currency_id: currentCurrency?.id || null,
            exchange_rate: exchangeRate,
            serie_id: selectedSerieId,
          });
        } catch (e) {
          // Otra caja eliminó o cobró esta cuenta mientras se atendía. En vez de dejar al
          // cajero atascado con el carrito armado, se cobra como venta nueva.
          if (!isStaleSale(e)) throw e;
          setHeldSale(null);
          notify(`${e.message} Se cobró como una venta nueva.`);
          res = await api.sales.create(createPayload());
        }
      } else {
        res = await api.sales.create(createPayload());
      }

      const serie = mySeries.find(s => s.id === selectedSerieId);
      setReceipt({
        ...res.data,
        customerName: selectedCustomer?.name || null,
        customerRif: selectedCustomer?.rif || null,
        currency: currentCurrency,
        exchangeRate,
        serie,
        // Avance de efectivo pedido junto a la venta: lo registra el cobro (PaymentFormModal).
        _avance: avanceEfectivo > 0
          ? { cash_amount: avanceEfectivo, fee_pct: parseFloat(String(avancePct).replace(",", ".")) || 0 }
          : null,
      });

      // Restaurante donde se cobra antes de pedir: lo cobrado sale a cocina en el acto, con cada
      // plato y sus adicionales debajo (los extras no van sueltos). Si la cuenta ya pasó por
      // cocina —rondas del mesonero, pedido del catálogo— el servidor no la repite. Un fallo
      // aquí no deshace la venta: se avisa para imprimir la comanda a mano.
      if (company?.cocina_enabled && settings?.pos_kitchen_on_charge === "true" && res?.data?.id) {
        const platos = cart.filter(i => !i.parentKey && parseFloat(i.qty) > 0).map(i => ({
          product_id: i.id,
          name: i.name,
          quantity: parseFloat(i.qty),
          note: i.addon_options ? (i.kitchen_note || null) : (i.note || null),
          modifiers: i.addon_text || null,
        }));
        const nombre = selectedCustomer?.name && !/^cliente general$/i.test(selectedCustomer.name) ? selectedCustomer.name : null;
        const label = cartTable?.name || (nombre ? `Para llevar · ${nombre}` : undefined);
        api.kitchen.fromSale(res.data.id, { items: platos, label })
          .catch(e => notify(`La venta se cobró, pero no llegó a la cocina: ${e.message || "sin conexión"}. Imprime la comanda.`, "err"));
      }

      // Venta concretada: invalidamos la clave para que el próximo
      // cobro use una nueva (en errores la dejamos viva para reintentos).
      pendingKeyRef.current = null;
      if (heldSaleId) { setHeldSale(null); loadHeldCarts(); }
      clearCart();
      onSuccess?.();
    } catch (e) {
      // Se cayó la conexión justo al facturar: la venta sigue sin conexión, con la misma clave.
      if (esSinServidor(e) && !heldSaleId) {
        try { await ventaSinConexion(); } catch (e2) { notify(e2.message, "err"); }
        return;
      }
      notify(e.message, "err");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
    // discountAmount y el recargo van en la lista: sin ellos, cambiar el descuento o la
    // propina y cobrar sin volver a tocar el carrito enviaba los valores del render anterior.
  }, [cart, activeWarehouse, selectedCustomer, selectedSerieId,
    employee, currentCurrency, exchangeRate, heldSaleId, loadHeldCarts,
    discountAmount, chargeAmountBase, chargeLabel, quotationId,
    mySeries, notify, clearCart, saveCart, activePromos, fxDiscount, fxRate, avanceEfectivo, avancePct, cartTable,
    company, settings]);

  // Venta sin conexión que no llegó a cobrarse (el cliente se fue, o hay que corregirla): se
  // saca de la cola y su carrito vuelve a la pantalla, como si no se hubiera finalizado.
  const deshacerVentaSinConexion = useCallback(async (rcpt) => {
    const e = await descartarSinCobro(rcpt?.offline_key);
    if (e) {
      setCart(e.cart || []);
      setSelectedCustomer(e.customer || null);
      descontarDeCatalogo(e.warehouse_id, (e.receipt?.items || []).map(l => ({ ...l, quantity: -l.quantity }))).catch(() => {});
    }
    setReceipt(null);
  }, []);

  return (
    <CartContext.Provider value={{
      // Carrito
      cart, addToCart, removeFromCart, changeQty, setQtyDirect, clearCart, syncCartPrices,
      // Totales
      subtotalBase, discountAmount, discountEnabled, setDiscountEnabled,
      discountPct, setDiscountPct, discountMode, setDiscountMode,
      totalBase, totalDisplay, totalSecondary,
      subtotalDisplay, promoDiscountDisplay, discountAmountDisplay, promoLineDiscountDisplay,
      // Descuento por línea
      setLineDiscount, lineManualDiscountDisplay,
      // Tasa de divisas
      fxEnabled, setFxEnabled, fxRateInput, setFxRateInput, fxRate, fxActivo, fxDiscount,
      // Avance de efectivo junto a la venta
      avanceOn, setAvanceOn, avanceMonto, setAvanceMonto, avancePct, setAvancePct,
      // Recargo (propina / servicio)
      chargeEnabled, setChargeEnabled, chargeLabel, setChargeLabel,
      chargeInput, setChargeInput, chargeMode, setChargeMode, setChargeFromPct,
      chargeAmountBase, chargeAmountDisplay, chargePct,
      // Moneda
      selectedCurrency, setSelectedCurrency, currentCurrency, exchangeRate,
      secondaryCurrency,
      convertToDisplay, convertToBase, convertToSecondary,
      // Serie
      selectedSerieId, setSelectedSerieId, selectSerie, mySeries, loadMySeries,
      // Promociones
      activePromos, loadActivePromos, promoLineDiscount, promoDiscount,
      // Cliente
      selectedCustomer, setSelectedCustomer,
      // Almacén
      employeeWarehouses, activeWarehouse, switchWarehouse, loadEmployeeWarehouses,
      // Checkout
      checkout, saveQuotation, loading, receipt, setReceipt, deshacerVentaSinConexion,
      // Quotation pre-load
      loadFromQuotation, quotationId,
      // Hold Cart
      heldCarts, holdCart, takeHeldCart, removeHeldCart, releaseHeldCart, loadHeldCarts, heldSaleId,
      // Mapa de mesas
      cartTable, setCartTable,
      // Adicionales de los platos
      addonPick, setAddonPick, addAddonLine,
      // Pedidos del catálogo público
      acceptWebOrder,
    }}>
      {children}
    </CartContext.Provider>
  );
}

// Hook
export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
