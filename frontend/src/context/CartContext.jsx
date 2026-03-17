import { createContext, useContext, useState, useCallback } from "react";
import { api } from "../services/api";
import { useApp } from "./AppContext";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { employee, notify, baseCurrency, activeCurrencies, journals, activeJournals } = useApp();

  // ── Carrito ────────────────────────────────────────────────
  const [cart, setCart]       = useState([]);
  const [payInput, setPayInput] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);

  // ── Moneda seleccionada ────────────────────────────────────
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  const currentCurrency = selectedCurrency || baseCurrency;
  const exchangeRate    = currentCurrency?.exchange_rate
    ? parseFloat(currentCurrency.exchange_rate) : 1;

  // ── Diario seleccionado ────────────────────────────────────
  const [selectedJournalId, setSelectedJournalId] = useState(null);

  const selectJournal = useCallback((journalId, currencies) => {
    const isDeselect = journalId === selectedJournalId;
    setSelectedJournalId(isDeselect ? null : journalId);
    if (isDeselect) {
      setSelectedCurrency(null);
      return;
    }
    const journal = activeJournals.find(j => j.id === journalId);
    if (journal?.currency_id) {
      const jCur = currencies.find(c => c.id === journal.currency_id);
      setSelectedCurrency(jCur?.is_base ? null : jCur || null);
    }
  }, [selectedJournalId, activeJournals]);

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
      if (r.data.length >= 1) setActiveWarehouse(prev => prev || r.data[0]);
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
  const addToCart = useCallback((product) => {
    if (!activeWarehouse) return notify("Selecciona un almacén antes de cobrar", "err");
    if (parseFloat(product.stock) <= 0) return notify("Sin stock disponible", "err");
    const step = parseFloat(product.qty_step) || 1;
    setCart(prev => {
      const ex = prev.find(i => i.id === product.id);
      if (ex) {
        const nq = parseFloat((ex.qty + step).toFixed(3));
        if (nq > parseFloat(product.stock)) { notify("Stock insuficiente", "err"); return prev; }
        return prev.map(i => i.id === product.id ? { ...i, qty: nq } : i);
      }
      return [...prev, { ...product, qty: step }];
    });
  }, [activeWarehouse, notify]);

  const removeFromCart = useCallback((id) => {
    setCart(prev => prev.filter(i => i.id !== id));
  }, []);

  const changeQty = useCallback((id, dir, products) => {
    setCart(prev => prev.map(i => {
      if (i.id !== id) return i;
      const step = parseFloat(i.qty_step) || 1;
      const nq   = parseFloat((i.qty + dir * step).toFixed(3));
      const prod = products.find(p => p.id === id);
      if (nq < step) return i;
      if (prod && nq > parseFloat(prod.stock)) { notify("Stock insuficiente", "err"); return i; }
      return { ...i, qty: nq };
    }));
  }, [notify]);

  const setQtyDirect = useCallback((id, raw, products) => {
    const nq = parseFloat(raw);
    if (isNaN(nq) || nq <= 0) return;
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    if (nq > parseFloat(prod.stock)) { notify("Stock insuficiente", "err"); return; }
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty: parseFloat(nq.toFixed(3)) } : i));
  }, [notify]);

  const clearCart = useCallback(() => {
    setCart([]);
    setPayInput("");
    setSelectedCustomer(null);
    setSelectedCurrency(null);
    setSelectedJournalId(null);
  }, []);

  // ── Totales ────────────────────────────────────────────────
  const totalBase    = cart.reduce((s, i) => s + parseFloat(i.price) * i.qty, 0);
  const totalDisplay = convertToDisplay(totalBase);
  const paid         = parseFloat(payInput) || 0;
  const change       = paid - totalDisplay;

  // ── Checkout ───────────────────────────────────────────────
  const checkout = useCallback(async (onSuccess) => {
    if (!cart.length)        return notify("El carrito está vacío", "err");
    if (!activeWarehouse)    return notify("Selecciona un almacén antes de cobrar", "err");
    if (paid < totalDisplay) return notify("Pago insuficiente", "err");

    setLoading(true);
    try {
      const res = await api.sales.create({
        items:              cart.map(i => ({ product_id: i.id, quantity: i.qty })),
        paid,
        customer_id:        selectedCustomer?.id   || null,
        employee_id:        employee?.id           || null,
        currency_id:        currentCurrency?.id    || null,
        exchange_rate:      exchangeRate,
        payment_journal_id: selectedJournalId,
        warehouse_id:       activeWarehouse.id,
      });

      const journal = activeJournals.find(j => j.id === selectedJournalId);
      setReceipt({
        ...res.data,
        customerName: selectedCustomer?.name || null,
        currency:     currentCurrency,
        exchangeRate,
        journal,
      });

      clearCart();
      notify("¡Venta registrada! ✓");
      onSuccess?.();
    } catch (e) {
      notify(e.message, "err");
    } finally {
      setLoading(false);
    }
  }, [cart, activeWarehouse, paid, totalDisplay, selectedCustomer,
      employee, currentCurrency, exchangeRate, selectedJournalId,
      activeJournals, notify, clearCart]);

  return (
    <CartContext.Provider value={{
      // Carrito
      cart, addToCart, removeFromCart, changeQty, setQtyDirect, clearCart,
      // Totales
      totalBase, totalDisplay, paid, change, payInput, setPayInput,
      // Moneda
      selectedCurrency, setSelectedCurrency, currentCurrency, exchangeRate,
      convertToDisplay, convertToBase,
      // Diario
      selectedJournalId, setSelectedJournalId, selectJournal,
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