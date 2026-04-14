import { createContext, useContext, useState, useCallback } from "react";
import { api } from "../services/api";
import { useApp } from "./AppContext";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { employee, notify, baseCurrency, activeCurrencies } = useApp();

  // ── Carrito ────────────────────────────────────────────────
  const [cart, setCart] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [heldCarts, setHeldCarts] = useState([]);

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
      setMySeries(r.data || []);
    } catch (e) { console.error(e); }
  }, [employee]);

  const selectSerie = useCallback((serieId) => {
    setSelectedSerieId(prev => prev === serieId ? null : serieId);
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
      if (item.is_combo && item.combo_items) {
        for (const ing of item.combo_items) {
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

  const addToCart = useCallback((product, customQty = null) => {
    if (!activeWarehouse) return notify("Selecciona un almacén antes de cobrar", "err");
    if (!product.is_service && parseFloat(product.stock) <= 0) return notify("Sin stock disponible", "err");
    
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
      return notify("Stock insuficiente de este producto o sus ingredientes", "err");
    }
    setCart(newCart);
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

  const setQtyDirect = useCallback((id, raw) => {
    if (raw === "") {
      setCart(cart.map(i => i.id === id ? { ...i, qty: "" } : i));
      return;
    }
    let targetNq = parseFloat(raw);
    if (isNaN(targetNq) || targetNq < 0) return;

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

    if (!changeOccurred) return;
    if (!validateCartStock(newCart)) {
      return notify("Stock límite alcanzado", "err");
    }
    setCart(newCart);
  }, [notify, validateCartStock, cart]);

  const clearCart = useCallback(() => {
    setCart([]);
    setSelectedCustomer(null);
    setSelectedCurrency(null);
    setSelectedSerieId(null);
    setDiscountEnabled(false);
    setDiscountPct("");
  }, []);

  // ── Hold Cart ─────────────────────────────────────────────
  const holdCart = useCallback(() => {
    if (cart.length === 0) return notify("No hay productos para poner en espera", "info");

    const newHeld = {
      id: Date.now(),
      created_at: new Date(),
      items: [...cart],
      customer: selectedCustomer,
      currency: selectedCurrency,
      serie_id: selectedSerieId,
      discount: { enabled: discountEnabled, pct: discountPct }
    };

    setHeldCarts(prev => [newHeld, ...prev]);
    clearCart();
    notify("Venta puesta en espera");
  }, [cart, selectedCustomer, selectedCurrency, selectedSerieId, discountEnabled, discountPct, clearCart, notify]);

  const takeHeldCart = useCallback((heldId) => {
    const held = heldCarts.find(h => h.id === heldId);
    if (!held) return;

    // Si hay algo en el carrito actual, preguntamos si guardarlo? 
    // Por ahora solo lo reemplazamos (el usuario debería pausar el actual antes)
    setCart(held.items);
    setSelectedCustomer(held.customer);
    setSelectedCurrency(held.currency);
    setSelectedSerieId(held.serie_id);
    setDiscountEnabled(held.discount.enabled);
    setDiscountPct(held.discount.pct);

    setHeldCarts(prev => prev.filter(h => h.id !== heldId));
    notify("Venta recuperada");
  }, [heldCarts, notify]);

  const removeHeldCart = useCallback((heldId) => {
    setHeldCarts(prev => prev.filter(h => h.id !== heldId));
    notify("Venta en espera eliminada");
  }, [notify]);

  // ── Totales ────────────────────────────────────────────────
  const subtotalBase = cart.reduce((s, i) => s + parseFloat(i.price) * i.qty, 0);
  const discountAmount = discountEnabled && parseFloat(discountPct) > 0
    ? subtotalBase * (parseFloat(discountPct) / 100) : 0;
  const totalBase = subtotalBase - discountAmount;
  const totalDisplay = convertToDisplay(totalBase);
  const totalSecondary = convertToSecondary(totalBase);


  // ── Generar factura (sin pago aún) ─────────────────────────
  const checkout = useCallback(async (onSuccess) => {
    if (!cart.length) return notify("El carrito está vacío", "err");
    if (!activeWarehouse) return notify("Selecciona un almacén antes de continuar", "err");
    if (!selectedCustomer) return notify("El cliente es requerido", "err");
    if (!selectedSerieId) return notify("La serie es requerida", "err");

    setLoading(true);
    try {
      const res = await api.sales.create({
        items: cart.map(i => ({ product_id: i.id, quantity: parseFloat(i.qty) || 0 })),
        paid: 0,
        customer_id: selectedCustomer?.id || null,
        employee_id: employee?.id || null,
        currency_id: currentCurrency?.id || null,
        exchange_rate: exchangeRate,
        serie_id: selectedSerieId,
        warehouse_id: activeWarehouse.id,
        discount_amount: discountAmount,
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

      clearCart();
      onSuccess?.();
    } catch (e) {
      notify(e.message, "err");
    } finally {
      setLoading(false);
    }
  }, [cart, activeWarehouse, selectedCustomer, selectedSerieId,
    employee, currentCurrency, exchangeRate,
    mySeries, notify, clearCart]);

  return (
    <CartContext.Provider value={{
      // Carrito
      cart, addToCart, removeFromCart, changeQty, setQtyDirect, clearCart,
      // Totales
      subtotalBase, discountAmount, discountEnabled, setDiscountEnabled,
      discountPct, setDiscountPct, totalBase, totalDisplay, totalSecondary,
      // Moneda
      selectedCurrency, setSelectedCurrency, currentCurrency, exchangeRate,
      secondaryCurrency,
      convertToDisplay, convertToBase, convertToSecondary,
      // Serie
      selectedSerieId, setSelectedSerieId, selectSerie, mySeries, loadMySeries,
      // Cliente
      selectedCustomer, setSelectedCustomer,
      // Almacén
      employeeWarehouses, activeWarehouse, switchWarehouse, loadEmployeeWarehouses,
      // Checkout
      checkout, loading, receipt, setReceipt,
      // Hold Cart
      heldCarts, holdCart, takeHeldCart, removeHeldCart,
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
