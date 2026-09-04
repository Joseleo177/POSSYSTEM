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

  // Cambiar de sucursal cambia el juego de series: se recargan las del almacén nuevo y, si
  // la que estaba elegida no es de ahí, se reemplaza por la primera disponible.
  useEffect(() => { loadMySeries(activeWarehouse?.id); }, [activeWarehouse?.id, loadMySeries]);

  // Y el juego de promociones, por lo mismo: una promo de la otra tienda no debe seguir
  // descontando en el carrito después de cambiar de sucursal.
  useEffect(() => { loadActivePromos(activeWarehouse?.id); }, [activeWarehouse?.id, loadActivePromos]);

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
      // Tecleado a mano y no por el paso a paso (que ya redondea, ver changeQty): sin este
      // límite el campo aceptaba cualquier cantidad de decimales escritos, y KG/L/M solo
      // manejan 3.
      let nq = isIntegerUnit ? Math.floor(targetNq) : Math.round(targetNq * 1000) / 1000;

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
    // La moneda NO se resetea: es la preferencia de visualización del cajero y se mantiene
    // entre ventas. El cliente y la serie sí, porque pertenecen a la venta que se cerró.
    setSelectedSerieId(mySeries.length > 0 ? mySeries[0].id : null);
    setDiscountEnabled(false);
    setDiscountPct("");
    setDiscountMode("pct");
    setChargeEnabled(false);
    setChargeInput("");
    setChargeLabel("Servicio");
    setQuotationId(null);
  }, [mySeries]);

  // Pre-carga el carrito desde una cotización para editar antes de facturar
  const loadFromQuotation = useCallback(async (quot) => {
    if (!activeWarehouse) { notify("Selecciona una sucursal antes de cargar la cotización", "err"); return; }
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
  const netUsd = subtotalUsd - discountAmountUsd - promoDiscountUsd;

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
  const promoDiscountBs = vesRate ? cart.reduce((s, i) => s + promoLineDiscountBs(i), 0) : 0;
  const netBs = vesRate ? (subtotalBs - discountAmountBs - promoDiscountBs) : null;

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

  // ── Mapeo a "principal"/"secundaria" según la moneda seleccionada en el toggle ──
  // (subtotalUsd/discountAmountUsd/promoDiscountUsd/totalUsd se mantienen con estos nombres
  // porque checkout()/saveQuotation() los envían tal cual al backend, siempre en USD).
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
      // La cuenta que esta caja tiene abierta en el carrito no se lista: sigue en 'espera'
      // en el servidor, pero aquí ya está "en uso".
      setHeldCarts((res.data || []).filter(s => s.id !== heldSaleIdRef.current));
    } catch {
      // Silencioso: es una carga de fondo, no debe interrumpir el cobro en curso.
    }
  }, [employee, activeWarehouse]);

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
        items: cart.filter(i => parseFloat(i.qty) > 0).map(i => ({ product_id: i.id, quantity: parseFloat(i.qty) })),
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
        hold: true,
      });

      // Si la cuenta ya existía (se recuperó para agregar productos), se actualiza en vez
      // de crear otra: así no se duplica ni se descuenta el stock dos veces.
      let recreated = false;
      if (heldSaleId) {
        try {
          await api.sales.update(heldSaleId, {
            items: cart.filter(i => parseFloat(i.qty) > 0).map(i => ({ product_id: i.id, price: i.price, qty: parseFloat(i.qty) })),
            discount_amount: discountAmount,
            service_charge: chargeAmountBase,
            service_charge_label: chargeLabel,
            // La cabecera viaja también al re-pausar: si el cajero cambió el cliente o la
            // moneda antes de volver a dejarla en espera, la cuenta debe quedar con lo que
            // se ve en pantalla, no con lo que tenía al abrirla.
            customer_id: selectedCustomer?.id || null,
            currency_id: currentCurrency?.id || null,
            exchange_rate: exchangeRate,
            serie_id: selectedSerieId,
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
      await loadHeldCarts();
      notify(recreated
        ? "Otra caja eliminó esa cuenta. Se guardó como una cuenta en espera nueva."
        : "Cuenta puesta en espera");
    } catch (e) {
      notify(e.message || "No se pudo poner la cuenta en espera", "err");
    } finally {
      setLoading(false);
    }
  }, [cart, heldSaleId, activeWarehouse, selectedSerieId, selectedCustomer, employee,
    currentCurrency, exchangeRate, discountAmount, chargeAmountBase, chargeLabel,
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
      // Se reserva en el servidor ANTES de cargar nada: si otra caja se adelantó, el 409
      // llega aquí y el cajero se entera antes de ponerse a trabajar sobre una cuenta que
      // no va a poder cobrar. Antes esto se resolvía ocultándola solo en esta pantalla, y
      // las dos cajas creían tenerla.
      await api.sales.claim(saleId);

      // Las líneas guardadas solo traen product_id/precio/cantidad; hay que rehidratarlas
      // con los datos del producto (unidad, imagen, stock) que el carrito necesita.
      const wid = held.warehouse_id || activeWarehouse.id;
      const res = await api.warehouses.getProducts(wid, { limit: 500 });
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

      const newCart = (held.items || []).reduce((acc, item) => {
        const prod = productMap[item.product_id];
        if (!prod) return acc;
        const qty = parseFloat(item.quantity) || 1;
        return [...acc, { ...withOwnStock(prod, qty), price: parseFloat(item.price), qty }];
      }, []);

      setCart(newCart);
      setHeldSale(held.id);
      if (held.customer_id) {
        setSelectedCustomer({ id: held.customer_id, name: held.customer_name, rif: held.customer_rif });
      }
      if (held.serie_id) setSelectedSerieId(held.serie_id);

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
    }
    try {
      // Si se está cobrando una cuenta en espera, la venta YA existe: se actualizan sus
      // líneas (por si se agregaron rondas) y se pasa a 'borrador' para que el cobro le
      // asigne el correlativo. Crear una nueva duplicaría la venta y el descuento de stock.
      const createPayload = () => ({
        items: cart.filter(i => parseFloat(i.qty) > 0).map(i => ({ product_id: i.id, quantity: parseFloat(i.qty) })),
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
        idempotency_key: pendingKeyRef.current,
        quotation_id: quotationId || null,
      });

      let res;
      if (heldSaleId) {
        try {
          res = await api.sales.update(heldSaleId, {
            items: cart.filter(i => parseFloat(i.qty) > 0).map(i => ({ product_id: i.id, price: i.price, qty: parseFloat(i.qty) })),
            discount_amount: discountAmount,
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
    // discountAmount y el recargo van en la lista: sin ellos, cambiar el descuento o la
    // propina y cobrar sin volver a tocar el carrito enviaba los valores del render anterior.
  }, [cart, activeWarehouse, selectedCustomer, selectedSerieId,
    employee, currentCurrency, exchangeRate, heldSaleId, loadHeldCarts,
    discountAmount, chargeAmountBase, chargeLabel, quotationId,
    mySeries, notify, clearCart]);

  return (
    <CartContext.Provider value={{
      // Carrito
      cart, addToCart, removeFromCart, changeQty, setQtyDirect, clearCart,
      // Totales
      subtotalBase, discountAmount, discountEnabled, setDiscountEnabled,
      discountPct, setDiscountPct, discountMode, setDiscountMode,
      totalBase, totalDisplay, totalSecondary,
      subtotalDisplay, promoDiscountDisplay, discountAmountDisplay, promoLineDiscountDisplay,
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
      checkout, saveQuotation, loading, receipt, setReceipt,
      // Quotation pre-load
      loadFromQuotation, quotationId,
      // Hold Cart
      heldCarts, holdCart, takeHeldCart, removeHeldCart, releaseHeldCart, loadHeldCarts, heldSaleId,
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
