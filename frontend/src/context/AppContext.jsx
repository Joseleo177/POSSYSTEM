import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../services/api";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // ── Auth ───────────────────────────────────────────────────
  const [employee, setEmployee]     = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("pos_token");
    if (!token) { setAuthChecked(true); return; }
    api.auth.me()
      .then(res => { setEmployee(res.employee); setAuthChecked(true); })
      .catch(() => { localStorage.removeItem("pos_token"); setAuthChecked(true); });
  }, []);

  const login  = (emp) => setEmployee(emp);
  const logout = () => { localStorage.removeItem("pos_token"); setEmployee(null); };

  const can = useCallback((perm) => {
    if (!employee) return false;
    if (employee.permissions?.all) return true;
    if (perm === "admin")     return !!employee.permissions?.all;
    if (perm === "inventory") return !!(employee.permissions?.inventory || employee.permissions?.inventory_view);
    return !!employee.permissions?.[perm];
  }, [employee]);

  // ── Notificaciones ─────────────────────────────────────────
  const [notification, setNotification] = useState(null);

  const notify = useCallback((msg, type = "ok") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 2800);
  }, []);

  // ── Settings ───────────────────────────────────────────────
  const [settings, setSettings] = useState({});

  const loadSettings = useCallback(async () => {
    try { const r = await api.settings.getAll(); setSettings(r.data); } catch {}
  }, []);

  // ── Currencies ─────────────────────────────────────────────
  const [currencies, setCurrencies] = useState([]);

  const loadCurrencies = useCallback(async () => {
    try { const r = await api.currencies.getAll(); setCurrencies(r.data); } catch {}
  }, []);

  // ── Journals ───────────────────────────────────────────────
  const [journals, setJournals] = useState([]);

  const loadJournals = useCallback(async () => {
    try { const r = await api.journals.getAll(); setJournals(r.data); } catch {}
  }, []);

  // ── Banks ──────────────────────────────────────────────────
  const [banks, setBanks] = useState([]);

  const loadBanks = useCallback(async () => {
    try { const r = await api.banks.getAll(); setBanks(r.data); } catch {}
  }, []);

  // ── Payment methods ────────────────────────────────────────
  const [paymentMethods, setPaymentMethods] = useState([]);

  const loadPaymentMethods = useCallback(async () => {
    try { const r = await api.paymentMethods.getAll(); setPaymentMethods(r.data); } catch {}
  }, []);

  // ── Categories ─────────────────────────────────────────────
  const [categories, setCategories] = useState([]);

  const loadCategories = useCallback(async () => {
    try { const r = await api.categories.getAll(); setCategories(r.data); } catch {}
  }, []);

  // ── Initial load ───────────────────────────────────────────
  useEffect(() => {
    if (!employee) return;
    loadSettings();
    loadCurrencies();
    loadJournals();
    loadBanks();
    loadPaymentMethods();
    loadCategories();
  }, [employee]);

  // ── Derived ────────────────────────────────────────────────
  const baseCurrency     = currencies.find(c => c.is_base);
  const activeCurrencies = currencies.filter(c => c.active);
  const activeJournals   = journals.filter(j => j.active);
  const activeBanks      = banks.filter(b => b.active);
  const activePaymentMethods = paymentMethods.filter(m => m.active);

  const storeName = settings.store_name || "MI TIENDA POS";

  return (
    <AppContext.Provider value={{
      // Auth
      employee, authChecked, login, logout, can,
      // Notify
      notification, notify,
      // Settings
      settings, loadSettings, storeName,
      // Currencies
      currencies, activeCurrencies, baseCurrency, loadCurrencies,
      // Journals
      journals, activeJournals, loadJournals,
      // Banks
      banks, activeBanks, loadBanks,
      // Payment methods
      paymentMethods, activePaymentMethods, loadPaymentMethods,
      // Categories
      categories, loadCategories,
    }}>
      {children}
    </AppContext.Provider>
  );
}

// Hook
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}