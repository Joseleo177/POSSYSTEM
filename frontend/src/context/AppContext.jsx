import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { hasPermission } from "../constants/permissions";
import { initSSE, closeSSE, onSSE } from "../services/sse";
import { applyBrandColor, clearBrandColor, rememberBrandColor, applyRememberedBrandColor } from "../helpers/brandColor";

const AppContext = createContext(null);

// La tasa del día cambia una vez al día; un minuto de retraso como mucho sobra de sobra.
const CURRENCIES_REFRESH_MS = 60_000;

// El color de marca llega con los ajustes, es decir tras una ida al servidor. Pintarlo desde
// localStorage antes del primer render evita que la interfaz aparezca en teal y cambie de
// color a medio segundo de haber entrado.
applyRememberedBrandColor();

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

  // Delegado en el mismo evaluador que usa el backend: si la pantalla y la API no coinciden,
  // el usuario ve botones que después le rebotan.
  const can = useCallback((perm) => hasPermission(employee?.permissions, perm), [employee]);

  // ── Navegación global ──────────────────────────────────────
  const [pendingNav, setPendingNav] = useState(null);
  const navigateTo = useCallback((tab) => setPendingNav(tab), []);

  // ── Acciones pendientes (command palette) ──────────────────
  const [pendingAction, setPendingAction] = useState(null);
  const triggerAction = useCallback((tab, action) => {
    setPendingNav(tab);
    if (action) setPendingAction(action);
  }, []);

  // ── Notificaciones ─────────────────────────────────────────
  const [notification, setNotification] = useState(null);

  const notify = useCallback((msg, type = "ok") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 2800);
  }, []);

  // ── Settings ───────────────────────────────────────────────
  const [settings, setSettings] = useState({});
  // Fila de `companies`, no ajustes: plan, vencimiento y extras como catalog_enabled. Vive
  // aparte de `settings` porque no lo edita la propia empresa — lo trae la misma respuesta
  // de /api/settings (ver controllers/settings.js) para no pagar una petición aparte.
  const [company, setCompany] = useState(null);

  const loadSettings = useCallback(async () => {
    try {
      const r = await api.settings.getAll();
      setSettings(r.data);
      setCompany(r.company || null);
      // Se aplica aquí y no en la pantalla de Configuración porque el color es de la
      // empresa, no del usuario: todo empleado que entra debe ver la interfaz en su color,
      // aunque no tenga permiso para cambiarlo.
      const brand = r.data?.brand_color;
      if (brand) applyBrandColor(brand); else clearBrandColor();
      rememberBrandColor(brand || null);
    } catch {}
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

  // ── SSE: actualizaciones en tiempo real ─────────────────────
  useEffect(() => {
    if (!employee) return;
    const token = localStorage.getItem('pos_token');
    initSSE(token);
    // El evento trae las monedas completas → setState directo, sin round-trip extra
    const unsubSSE = onSSE('currencies:updated', (data) => {
      if (data?.currencies?.length) setCurrencies(data.currencies);
      else loadCurrencies();  // fallback si llega sin datos
    });
    // Fallback sin costo: refresca solo cuando el usuario vuelve al tab
    const onVisible = () => { if (document.visibilityState === 'visible') loadCurrencies(); };
    document.addEventListener('visibilitychange', onVisible);
    // Red de seguridad, igual que la grilla de productos (ver REFRESH_MS en useCobroProducts).
    // El aviso por visibilitychange no basta: una caja pasa el turno entero en la misma
    // pantalla sin cambiar de pestaña, y ahí la tasa del día se quedaba vieja cuando el
    // evento en vivo no llegaba. Un minuto sobra: la tasa se carga una vez al día.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadCurrencies();
    }, CURRENCIES_REFRESH_MS);
    return () => {
      unsubSSE();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [employee, loadCurrencies, setCurrencies]);

  // Cerrar SSE al hacer logout
  useEffect(() => {
    if (!employee) closeSSE();
  }, [employee]);

  // ── Derived ────────────────────────────────────────────────
  const baseCurrency     = currencies.find(c => c.is_base);
  const activeCurrencies = currencies.filter(c => c.active);
  const activeJournals   = journals.filter(j => j.active);
  const activeBanks      = banks.filter(b => b.active);
  const activePaymentMethods = paymentMethods.filter(m => m.active);

  const storeName    = settings.store_name || "MI TIENDA POS";
  const printerWidth = parseInt(settings.printer_width || "80");
  const companyInfo  = {
    name:     settings.store_name    || "",
    rif:      settings.store_rif     || "",
    slogan:   settings.store_slogan  || "",
    address:  settings.store_address || "",
    city:     settings.store_city    || "",
    phone:    settings.store_phone   || "",
    phone2:   settings.store_phone2  || "",
    email:    settings.store_email   || "",
    website:  settings.store_website || "",
    logo_url: settings.logo_url      || "",
    footer:   settings.receipt_footer || "¡Gracias por su compra!",
    tax_name: settings.tax_name      || "",
    tax_rate: settings.tax_rate      || "",
    // Cómo se llama el papel que se le entrega al cliente. Mientras el sistema no esté
    // homologado ante el SENIAT lo que emite NO es una factura fiscal, así que llamarla así
    // en el documento es decir algo que no es. El día de la homologación esto se cambia acá
    // —una vez, desde Configuración— y queda bien en todas las impresiones a la vez.
    doc_name: settings.sales_doc_name || "Documento de Venta",
    show_header: (settings.receipt_show_header || "true") === "true",
  };

  return (
    <AppContext.Provider value={{
      // Auth
      employee, authChecked, login, logout, can,
      // Nav
      pendingNav, setPendingNav, navigateTo,
      // Actions
      pendingAction, setPendingAction, triggerAction,
      // Notify
      notification, notify,
      // Settings
      settings, loadSettings, storeName, companyInfo, company, printerWidth,
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
