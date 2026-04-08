import { createContext, useContext, useState, useCallback } from "react";
import { api } from "../services/api";
import { useApp } from "./AppContext";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { employee, notify, baseCurrency, activeCurrencies } = useApp();

  // ── Carrito ────────────────────────────────────────────────
  const [cart, setCart]       = useState([]);
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);

  // ── Moneda seleccionada ────────────────────────────────────
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  const currentCurrency = selectedCurrency || baseCurrency;
  const exchangeRate    = currentCurrency?.exchange_rate
    ? parseFloat(currentCurrency.exchange_rate) : 1;

  // ── Serie seleccionada ─────────────────────────────────────
  const [selectedSerieId, setSelectedSerieId] = useState(null);
  const [mySeries,        setMySeries]        = useState([]);

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
  const [discountPct,     setDiscountPct]     = useState("");

  // ── Cliente seleccionado ───────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // ── Almacén activo ─────────────────────────────────────────
  const [employeeWarehouses, setEmployeeWarehouses] = useState([]);
  const [activeWarehouse, setActiveWarehouse]       = useState(null);

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

  const addToCart = useCallback((product) => {
    if (!activeWarehouse) return notify("Selecciona un almacén antes de cobrar", "err");
    if (!product.is_service && parseFloat(product.stock) <= 0) return notify("Sin stock disponible", "err");
    const step = parseFloat(product.qty_step) || 1;
    
    setCart(prev => {
      let newCart;
      const ex = prev.find(i => i.id === product.id);
      if (ex) {
        const nq = parseFloat((ex.qty + step).toFixed(3));
        newCart = prev.map(i => i.id === product.id ? { ...i, qty: nq } : i);
      } else {
        newCart = [...prev, { ...product, qty: step }];
      }
      if (!validateCartStock(newCart)) {
        notify("Stock insuficiente de este producto o sus ingredientes", "err");
        return prev;
      }
      return newCart;
    });
  }, [activeWarehouse, notify, validateCartStock]);

  const removeFromCart = useCallback((id) => {
    setCart(prev => prev.filter(i => i.id !== id));
  }, []);

  const changeQty = useCallback((id, dir) => {
    setCart(prev => {
      let changeOccurred = false;
      const newCart = prev.map(i => {
        if (i.id !== id) return i;
        const step = parseFloat(i.qty_step) || 1;
        let nq     = parseFloat((i.qty + dir * step).toFixed(3));
        
        const isIntegerUnit = ["unidad", "kg", "litro", "metro"].includes(i.unit?.toLowerCase());
        if (isIntegerUnit) nq = Math.max(1, Math.floor(nq));
        
        if (nq < step || nq === i.qty) return i;
        changeOccurred = true;
        return { ...i, qty: nq };
      });
      if (!changeOccurred) return prev;
      if (!validateCartStock(newCart)) {
        notify("Stock limite alcanzado", "err");
        return prev;
      }
      return newCart;
    });
  }, [notify, validateCartStock]);

  const setQtyDirect = useCallback((id, raw) => {
    if (raw === "") {
      setCart(prev => prev.map(i => i.id === id ? { ...i, qty: "" } : i));
      return;
    }
    let targetNq = parseFloat(raw);
    if (isNaN(targetNq) || targetNq < 0) return;

    setCart(prev => {
      let changeOccurred = false;
      const newCart = prev.map(i => {
        if (i.id !== id) return i;
        const isIntegerUnit = ["unidad", "kg", "litro", "metro"].includes(i.unit?.toLowerCase());
        let nq = targetNq;
        if (isIntegerUnit) nq = Math.floor(nq);
        
        if (nq === i.qty) return i;
        changeOccurred = true;
        return { ...i, qty: nq };
      });
      if (!changeOccurred) return prev;
      if (!validateCartStock(newCart)) {
        notify("Stock limite alcanzado por el componente", "err");
        return prev;
      }
      return newCart;
    });
  }, [notify, validateCartStock]);

  const clearCart = useCallback(() => {
    setCart([]);
    setSelectedCustomer(null);
    setSelectedCurrency(null);
    setSelectedSerieId(null);
    setDiscountEnabled(false);
    setDiscountPct("");
  }, []);

  // ── Totales ────────────────────────────────────────────────
  const subtotalBase   = cart.reduce((s, i) => s + parseFloat(i.price) * i.qty, 0);
  const discountAmount = discountEnabled && parseFloat(discountPct) > 0
    ? subtotalBase * (parseFloat(discountPct) / 100) : 0;
  const totalBase      = subtotalBase - discountAmount;
  const totalDisplay   = convertToDisplay(totalBase);

  // ── Generar factura (sin pago aún) ─────────────────────────
  const checkout = useCallback(async (onSuccess) => {
    if (!cart.length)      return notify("El carrito está vacío", "err");
    if (!activeWarehouse)  return notify("Selecciona un almacén antes de continuar", "err");
    if (!selectedCustomer) return notify("El cliente es requerido", "err");
    if (!selectedSerieId)  return notify("La serie es requerida", "err");

    setLoading(true);
    try {
      const res = await api.sales.create({
        items:           cart.map(i => ({ product_id: i.id, quantity: parseFloat(i.qty) || 0 })),
        paid:            0,
        customer_id:     selectedCustomer?.id || null,
        employee_id:     employee?.id         || null,
        currency_id:     currentCurrency?.id  || null,
        exchange_rate:   exchangeRate,
        serie_id:        selectedSerieId,
        warehouse_id:    activeWarehouse.id,
        discount_amount: discountAmount,
      });

      const serie = mySeries.find(s => s.id === selectedSerieId);
      setReceipt({
        ...res.data,
        customerName: selectedCustomer?.name || null,
        customerRif: selectedCustomer?.rif || null,
        currency:     currentCurrency,
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
      discountPct, setDiscountPct, totalBase, totalDisplay,
      // Moneda
      selectedCurrency, setSelectedCurrency, currentCurrency, exchangeRate,
      convertToDisplay, convertToBase,
      // Serie
      selectedSerieId, setSelectedSerieId, selectSerie, mySeries, loadMySeries,
      // Cliente
      selectedCustomer, setSelectedCustomer,
      // Almacén
      employeeWarehouses, activeWarehouse, switchWarehouse, loadEmployeeWarehouses,
      // Checkout
      checkout, loading, receipt, setReceipt,
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
