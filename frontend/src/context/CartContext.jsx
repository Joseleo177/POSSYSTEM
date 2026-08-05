import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { api } from "../services/api";
import { useApp } from "./AppContext";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { employee, notify, baseCurrency, activeCurrencies } = useApp();

  // ── Carrito ────────────────────────────────────────────────
  const [cart, setCart] = useState([]);
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
  const setHeldSale = useCallback((id) => { heldSaleIdRef.current = id; setHeldSaleId(id); }, []);
  const [quotationId, setQuotationId] = useState(null);

  // ── Moneda seleccionada ────────────────────────────────────
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  const currentCurrency = selectedCurrency || baseCurrency;
  const exchangeRate = currentCurrency?.exchange_rate
    ? parseFloat(currentCurrency.exchange_rate) : 1;

  // ── Serie seleccionada ─────────────────────────────────────
  const [selectedSerieId, setSelectedSerieId] = useState(null);
  const [mySeries, setMySeries] = useState([]);

  const loadMySeries = useCallback(async () => {
    if (!employee) return;
    try {
      const r = await api.series.getMy();
      // El POS solo emite facturas — las series de nota de crédito no aplican aquí
      const series = (r.data || []).filter(s => s.type !== "nc");
      setMySeries(series);
      if (series.length > 0) setSelectedSerieId(prev => prev ?? series[0].id);
    } catch (e) { console.error(e); }
  }, [employee]);

  const selectSerie = useCallback((serieId) => {
    setSelectedSerieId(prev => prev === serieId ? null : serieId);
  }, []);

  // ── Promociones activas ────────────────────────────────────
  const [activePromos, setActivePromos] = useState([]);

  const loadActivePromos = useCallback(async () => {
    try {
      const r = await api.promotions.getActive();
      setActivePromos(r.data || []);
    } catch (e) { console.error(e); }
  }, []);

  // ── Descuento global ──────────────────────────────────────
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountPct, setDiscountPct] = useState("");

  // ── Cliente seleccionado ───────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // ── Almacén activo ─────────────────────────────────────────
  const [employeeWarehouses, setEmployeeWarehouses] = useState([]);
  const [activeWarehouse, setActiveWarehouse] = useState(null);

  const loadEmployeeWarehouses = useCallback(async () => {
    if (!employee) return;
    try {
      const r = await api.warehouses.getByEmployee(employee.id);
      setEmployeeWarehouses(r.data);

      if (r.data.length >= 1) {
        setActiveWarehouse(prev => {
          if (!prev) return r.data[0];
          // Validar que el almacén previo siga asignado al empleado
          const stillAssigned = r.data.find(w => w.id === prev.id);
          return stillAssigned || r.data[0];
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
    if (!activeWarehouse) { if (!silentError) notify("Selecciona un almacén antes de cobrar", "err"); return false; }
    // stock === null significa combo de solo-servicios (sin límite de stock)
    const hasUnlimitedStock = product.is_service || (product.is_combo && product.stock === null);
    if (!hasUnlimitedStock && parseFloat(product.stock) <= 0) { if (!silentError) notify("Sin stock disponible", "err"); return false; }

    const step = parseFloat(product.qty_step) || 1;
    const initialQty = customQty !== null ? parseFloat(customQty) : step;

    const ex = cart.find(i => i.id === product.id);
    let newCart;
    if (ex) {
      const nq = parseFloat((ex.qty + initialQty).toFixed(3));
      newCart = cart.map(i => i.id === product.id ? { ...i, qty: nq } : i);
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

  const removeFromCart = useCallback((id) => {
    setCart(prev => prev.filter(i => i.id !== id));
  }, []);

  const changeQty = useCallback((id, dir) => {
    let changeOccurred = false;
    const newCart = cart.map(i => {
      if (i.id !== id) return i;
      const step = parseFloat(i.qty_step) || 1;
      let nq = parseFloat((i.qty + dir * step).toFixed(3));

      const isIntegerUnit = ["unidad", "uds", "pieza"].includes(i.unit?.toLowerCase());
      if (isIntegerUnit) nq = Math.max(1, Math.floor(nq));

      if (nq < step || nq === i.qty) return i;
      changeOccurred = true;
      return { ...i, qty: nq };
    });

    if (!changeOccurred) return;
    if (!validateCartStock(newCart)) {
      return notify("Stock límite alcanzado", "err");
    }
    setCart(newCart);
  }, [notify, validateCartStock, cart]);

  const setQtyDirect = useCallback((id, raw, silentError = false) => {
    if (raw === "") {
      setCart(cart.map(i => i.id === id ? { ...i, qty: "" } : i));
      return true;
    }
    let targetNq = parseFloat(raw);
    if (isNaN(targetNq) || targetNq < 0) return false;

    let changeOccurred = false;
    const newCart = cart.map(i => {
      if (i.id !== id) return i;
      const isIntegerUnit = ["unidad", "uds", "pieza"].includes(i.unit?.toLowerCase());
      let nq = targetNq;
      if (isIntegerUnit) nq = Math.floor(nq);

      if (nq === i.qty) return i;
      changeOccurred = true;
      return { ...i, qty: nq };
    });

    if (!changeOccurred) return true;
    if (!validateCartStock(newCart)) {
      if (!silentError) notify("Stock límite alcanzado", "err");
      return false;
    }
    setCart(newCart);
    return true;
  }, [notify, validateCartStock, cart]);

  const clearCart = useCallback(() => {
    setCart([]);
    setSelectedCustomer(null);
    setSelectedCurrency(null);
    setSelectedSerieId(mySeries.length > 0 ? mySeries[0].id : null);
    setDiscountEnabled(false);
    setDiscountPct("");
    setQuotationId(null);
  }, [mySeries]);

  // Pre-carga el carrito desde una cotización para editar antes de facturar
  const loadFromQuotation = useCallback(async (quot) => {
    if (!activeWarehouse) { notify("Selecciona un almacén antes de cargar la cotización", "err"); return; }
    try {
      const wid = quot.warehouse_id || activeWarehouse.id;
      const res = await api.warehouses.getProducts(wid, { limit: 500 });
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
        return [...acc, { ...prod, price: parseFloat(item.price), qty }];
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

  // USD — redondeo POR LÍNEA (round2(price) × qty) → 3 × 4.07 = 12.21
  // Bs — redondeo POR LÍNEA EN Bs (round2(price × vesRate) × qty) → 3 × 3000 = 9000 (bloque independiente abajo)
  // La diferencia de 0.01 entre ambas pistas es inherente al redondeo dual y se gestiona en
  // PaymentFormModal con la tolerancia de 0.02 USD al calcular el abono en Bs.
  const subtotalUsd = cart.reduce((s, i) => s + round2(i.price) * i.qty, 0);
  const discountAmountUsd = discountEnabled && parseFloat(discountPct) > 0
    ? subtotalUsd * (parseFloat(discountPct) / 100) : 0;

  const promoLineDiscountUsd = useCallback((item) => {
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

  const promoDiscountUsd = cart.reduce((s, i) => s + promoLineDiscountUsd(i), 0);
  const totalUsd = subtotalUsd - discountAmountUsd - promoDiscountUsd;

  const promoLineDiscountBs = useCallback((item) => {
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

  const subtotalBs = vesRate
    ? cart.reduce((s, i) => s + round2((parseFloat(i.price) || 0) * vesRate) * i.qty, 0)
    : null;
  const discountAmountBs = (vesRate && discountEnabled && parseFloat(discountPct) > 0)
    ? subtotalBs * (parseFloat(discountPct) / 100) : 0;
  const promoDiscountBs = vesRate ? cart.reduce((s, i) => s + promoLineDiscountBs(i), 0) : 0;
  const totalBs = vesRate ? (subtotalBs - discountAmountBs - promoDiscountBs) : null;

  // ── Mapeo a "principal"/"secundaria" según la moneda seleccionada en el toggle ──
  // (subtotalUsd/discountAmountUsd/promoDiscountUsd/totalUsd se mantienen con estos nombres
  // porque checkout()/saveQuotation() los envían tal cual al backend, siempre en USD).
  const isVesPrimary = !!currentCurrency && !currentCurrency.is_base;
  const subtotalBase    = subtotalUsd;
  const discountAmount  = discountAmountUsd;
  const promoLineDiscount = promoLineDiscountUsd;
  const promoDiscount   = promoDiscountUsd;
  const totalBase        = totalUsd;

  const subtotalDisplay        = isVesPrimary ? (subtotalBs ?? 0) : subtotalUsd;
  const promoDiscountDisplay   = isVesPrimary ? promoDiscountBs : promoDiscountUsd;
  const discountAmountDisplay  = isVesPrimary ? discountAmountBs : discountAmountUsd;
  const promoLineDiscountDisplay = isVesPrimary ? promoLineDiscountBs : promoLineDiscountUsd;
  const totalDisplay    = isVesPrimary ? (totalBs ?? 0) : totalUsd;
  const totalSecondary  = isVesPrimary ? totalUsd : (totalBs ?? convertToSecondary(totalUsd));


  // ── Cuentas en espera ─────────────────────────────────────
  // Antes vivían en estado local: solo existían en la máquina que las creó y se perdían
  // al recargar. Ahora son ventas reales con status 'espera', así que cualquier caja de
  // la empresa las ve y las puede cobrar. No aparecen en Facturas Pendientes porque ese
  // listado filtra borrador/pendiente/parcial.
  const loadHeldCarts = useCallback(async () => {
    if (!employee) return;
    try {
      const res = await api.sales.getHeld();
      // La cuenta que esta caja tiene abierta en el carrito no se lista: sigue en 'espera'
      // en el servidor, pero aquí ya está "en uso".
      setHeldCarts((res.data || []).filter(s => s.id !== heldSaleIdRef.current));
    } catch {
      // Silencioso: es una carga de fondo, no debe interrumpir el cobro en curso.
    }
  }, [employee]);

  // CartProvider envuelve toda la app, así que sin esta guarda la petición saldría
  // también en la pantalla de login: un 401 dispararía el refresh de token y la recarga.
  useEffect(() => { if (employee) loadHeldCarts(); }, [employee, loadHeldCarts]);

  // Sin parámetros a propósito: se invoca como onClick={holdCart} y con el atajo F4, así
  // que cualquier argumento sería el evento del clic, no un callback.
  const holdCart = useCallback(async () => {
    if (cart.length === 0) return notify("No hay productos para poner en espera", "info");
    if (!activeWarehouse) return notify("Selecciona un almacén antes de continuar", "err");
    if (!selectedSerieId) return notify("La serie es requerida", "err");

    setLoading(true);
    try {
      // Si la cuenta ya existía (se recuperó para agregar productos), se actualiza en vez
      // de crear otra: así no se duplica ni se descuenta el stock dos veces.
      if (heldSaleId) {
        await api.sales.update(heldSaleId, {
          items: cart.filter(i => parseFloat(i.qty) > 0).map(i => ({ product_id: i.id, price: i.price, qty: parseFloat(i.qty) })),
          discount_amount: discountAmount,
        });
      } else {
        await api.sales.create({
          items: cart.filter(i => parseFloat(i.qty) > 0).map(i => ({ product_id: i.id, quantity: parseFloat(i.qty) })),
          paid: 0,
          customer_id: selectedCustomer?.id || null,
          employee_id: employee?.id || null,
          currency_id: currentCurrency?.id || null,
          exchange_rate: exchangeRate,
          serie_id: selectedSerieId,
          warehouse_id: activeWarehouse.id,
          discount_amount: discountAmount,
          hold: true,
        });
      }
      setHeldSale(null);
      clearCart();
      await loadHeldCarts();
      notify("Cuenta puesta en espera");
    } catch (e) {
      notify(e.message || "No se pudo poner la cuenta en espera", "err");
    } finally {
      setLoading(false);
    }
  }, [cart, heldSaleId, activeWarehouse, selectedSerieId, selectedCustomer, employee,
    currentCurrency, exchangeRate, discountAmount, clearCart, loadHeldCarts, notify]);

  // Acepta un pedido llegado del catálogo público. Hasta aquí no había tocado inventario:
  // el servidor lo descuenta ahora, del almacén activo de esta caja, y el pedido pasa a
  // ser una cuenta en espera normal que se recupera y se cobra como cualquier otra.
  const acceptWebOrder = useCallback(async (saleId) => {
    if (!activeWarehouse) return notify("Selecciona un almacén antes de aceptar el pedido", "err");
    try {
      await api.sales.acceptOrder(saleId, { warehouse_id: activeWarehouse.id });
      await loadHeldCarts();
      notify("Pedido aceptado. Está en cuentas en espera.");
    } catch (e) {
      notify(e.message || "No se pudo aceptar el pedido", "err");
    }
  }, [activeWarehouse, loadHeldCarts, notify]);

  // Recupera una cuenta al carrito para seguir agregándole productos o cobrarla.
  const takeHeldCart = useCallback(async (saleId) => {
    const held = heldCarts.find(h => h.id === saleId);
    if (!held) return;
    if (!activeWarehouse) return notify("Selecciona un almacén antes de continuar", "err");

    try {
      // Las líneas guardadas solo traen product_id/precio/cantidad; hay que rehidratarlas
      // con los datos del producto (unidad, imagen, stock) que el carrito necesita.
      const wid = held.warehouse_id || activeWarehouse.id;
      const res = await api.warehouses.getProducts(wid, { limit: 500 });
      const productMap = Object.fromEntries((res.data || []).map(p => [p.id, p]));

      const newCart = (held.items || []).reduce((acc, item) => {
        const prod = productMap[item.product_id];
        if (!prod) return acc;
        return [...acc, { ...prod, price: parseFloat(item.price), qty: parseFloat(item.quantity) || 1 }];
      }, []);

      setCart(newCart);
      setHeldSale(held.id);
      if (held.customer_id) {
        setSelectedCustomer({ id: held.customer_id, name: held.customer_name, rif: held.customer_rif });
      }
      if (held.serie_id) setSelectedSerieId(held.serie_id);

      // Sale del listado: ya está en el carrito de esta caja, y dejarla visible invitaría
      // a que otra la recupere en paralelo. En el servidor sigue en 'espera', así que si
      // se abandona sin cobrarla ni volver a pausarla, reaparece en la próxima carga.
      setHeldCarts(prev => prev.filter(h => h.id !== held.id));
      notify("Cuenta recuperada");
    } catch (e) {
      notify(e.message || "No se pudo recuperar la cuenta", "err");
    }
  }, [heldCarts, activeWarehouse, notify]);

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
    if (!activeWarehouse) return notify("Selecciona un almacén antes de continuar", "err");

    setLoading(true);
    try {
      const res = await api.quotations.create({
        items: cart.filter(i => parseFloat(i.qty) > 0).map(i => ({
          product_id:   i.id,
          product_name: i.name,
          quantity:     parseFloat(i.qty),
          price:        parseFloat(i.price),
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
    if (!activeWarehouse) return notify("Selecciona un almacén antes de continuar", "err");
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
    }
    try {
      // Si se está cobrando una cuenta en espera, la venta YA existe: se actualizan sus
      // líneas (por si se agregaron rondas) y se pasa a 'borrador' para que el cobro le
      // asigne el correlativo. Crear una nueva duplicaría la venta y el descuento de stock.
      const res = heldSaleId
        ? await api.sales.update(heldSaleId, {
            items: cart.filter(i => parseFloat(i.qty) > 0).map(i => ({ product_id: i.id, price: i.price, qty: parseFloat(i.qty) })),
            discount_amount: discountAmount,
            status: "borrador",
          })
        : await api.sales.create({
            items: cart.filter(i => parseFloat(i.qty) > 0).map(i => ({ product_id: i.id, quantity: parseFloat(i.qty) })),
            paid: 0,
            customer_id: selectedCustomer?.id || null,
            employee_id: employee?.id || null,
            currency_id: currentCurrency?.id || null,
            exchange_rate: exchangeRate,
            serie_id: selectedSerieId,
            warehouse_id: activeWarehouse.id,
            discount_amount: discountAmount,
            idempotency_key: pendingKeyRef.current,
            quotation_id: quotationId || null,
          });

      const serie = mySeries.find(s => s.id === selectedSerieId);
      setReceipt({
        ...res.data,
        customerName: selectedCustomer?.name || null,
        customerRif: selectedCustomer?.rif || null,
        currency: currentCurrency,
        exchangeRate,
        serie,
      });

      // Venta concretada: invalidamos la clave para que el próximo
      // cobro use una nueva (en errores la dejamos viva para reintentos).
      pendingKeyRef.current = null;
      if (heldSaleId) { setHeldSale(null); loadHeldCarts(); }
      clearCart();
      onSuccess?.();
    } catch (e) {
      notify(e.message, "err");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }, [cart, activeWarehouse, selectedCustomer, selectedSerieId,
    employee, currentCurrency, exchangeRate, heldSaleId, loadHeldCarts,
    mySeries, notify, clearCart]);

  return (
    <CartContext.Provider value={{
      // Carrito
      cart, addToCart, removeFromCart, changeQty, setQtyDirect, clearCart,
      // Totales
      subtotalBase, discountAmount, discountEnabled, setDiscountEnabled,
      discountPct, setDiscountPct, totalBase, totalDisplay, totalSecondary,
      subtotalDisplay, promoDiscountDisplay, discountAmountDisplay, promoLineDiscountDisplay,
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
      checkout, saveQuotation, loading, receipt, setReceipt,
      // Quotation pre-load
      loadFromQuotation, quotationId,
      // Hold Cart
      heldCarts, holdCart, takeHeldCart, removeHeldCart, loadHeldCarts, heldSaleId,
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
