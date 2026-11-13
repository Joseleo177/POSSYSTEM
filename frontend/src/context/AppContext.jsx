import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { api, recordarSesion, setSucursalesFiltro } from "../services/api";
import { hasPermission } from "../constants/permissions";
import { initSSE, closeSSE, onSSE } from "../services/sse";
import { alCambiar } from "../services/huellaCaja";
import { applyBrandColor, clearBrandColor, rememberBrandColor, applyRememberedBrandColor } from "../helpers/brandColor";
import { pedirAlmacenamientoPersistente } from "../services/offline/store";
import { iniciarSincronizacion } from "../services/offline/sync";
import { esSinServidor } from "../services/offline/network";
import { monedaLocal } from "../helpers/currency";

const AppContext = createContext(null);

// El color de marca llega con los ajustes, es decir tras una ida al servidor. Pintarlo desde
// localStorage antes del primer render evita que la interfaz aparezca en teal y cambie de
// color a medio segundo de haber entrado.
applyRememberedBrandColor();

// ── Sucursales de trabajo ────────────────────────────────────
// Como las empresas en Odoo: al entrar se elige la sucursal ACTUAL (con la que se vende, se
// ajusta el inventario y se ve el catálogo) y en la barra se pueden marcar otras para ver
// sus listados y reportes juntos. Va por empresa y usuario, y se borra en cada inicio de
// sesión para que la pregunta se repita; una recarga de la página la conserva.
const claveSucursal = (emp) => `nxus_sucursal_${emp.company_id ?? 0}_${emp.id}`;

// Lo que viene del servidor. Una respuesta vieja (sin `sucursales`) se arma con las asignadas.
const sucursalesDe = (emp) => emp?.sucursales
  ?? (emp?.warehouses || []).map(w => ({ id: w.id, name: w.name, sells: w.sells !== false }));

// Deja solo ids que sigan siendo del usuario. Sin actual válida no hay selección: se pregunta.
function normalizarSeleccion(sel, lista) {
  const ids = new Set(lista.map(w => w.id));
  if (!sel || !ids.has(sel.actual)) return null;
  const marcadas = [...new Set([sel.actual, ...(sel.marcadas || [])])].filter(id => ids.has(id));
  return { actual: sel.actual, marcadas };
}

function leerSeleccion(emp, lista) {
  if (lista.length === 1) return { actual: lista[0].id, marcadas: [lista[0].id] };
  try { return normalizarSeleccion(JSON.parse(localStorage.getItem(claveSucursal(emp)) || "null"), lista); }
  catch { return null; }
}

// La cabecera se fija ANTES de que se monte cualquier pantalla: los efectos de los hijos corren
// antes que los del proveedor y su primera petición ya tiene que ir recortada. Marcadas todas,
// no se manda nada: el servidor responde como siempre.
function aplicarFiltro(sel, lista) {
  const todas = !sel || sel.marcadas.length >= lista.length;
  setSucursalesFiltro(todas ? null : sel.marcadas);
}

export function AppProvider({ children }) {
  // ── Auth ───────────────────────────────────────────────────
  const [employee, setEmployee]     = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("pos_token");
    if (!token) { setAuthChecked(true); return; }
    // Sin conexión, /auth/me responde con la sesión guardada en el equipo (ver GUARDABLES en
    // api.js). Si ni eso hay, el token se conserva: un corte de red no prueba que la sesión
    // sea mala, y borrarlo dejaba fuera a la caja justo cuando volvía de un apagón.
    api.auth.me()
      .then(res => {
        // El filtro de sucursales va puesto antes de tener empleado: el carrito y el resto
        // de los proveedores consultan en cuanto lo tienen, antes que el efecto de abajo.
        if (res.employee) aplicarFiltro(leerSeleccion(res.employee, sucursalesDe(res.employee)), sucursalesDe(res.employee));
        setEmployee(res.employee);
        setAuthChecked(true);
      })
      .catch(e => {
        if (!esSinServidor(e)) localStorage.removeItem("pos_token");
        setAuthChecked(true);
      });
  }, []);

  useEffect(() => { if (employee) pedirAlmacenamientoPersistente(); }, [employee]);

  // Envío de las ventas hechas sin conexión (ver services/offline/sync.js). Corre mientras haya
  // sesión, y solo con las ventas de la empresa con la que se entró.
  useEffect(() => { if (employee?.company_id) iniciarSincronizacion(employee.company_id); }, [employee?.company_id]);

  const login  = (emp) => {
    recordarSesion(emp);
    // Cada inicio de sesión vuelve a preguntar la sucursal: la de ayer no tiene por qué ser la de hoy.
    try { localStorage.removeItem(claveSucursal(emp)); } catch { /* modo privado */ }
    setEmployee(emp);
  };
  const logout = () => { localStorage.removeItem("pos_token"); setEmployee(null); };

  // ── Sucursales ─────────────────────────────────────────────
  const sucursales = useMemo(() => sucursalesDe(employee), [employee]);
  const [seleccion, setSeleccion] = useState(null);
  // La selección se lee en un efecto: hasta entonces no se sabe si hay que preguntar, y sin
  // esta marca la pantalla de elegir sucursal asomaba un instante en cada recarga.
  const [seleccionLista, setSeleccionLista] = useState(false);

  // Al tener empleado (login o recarga) se recupera lo elegido, si sigue valiendo.
  const firmaSucursales = sucursales.map(w => w.id).join(",");
  useEffect(() => {
    if (!employee) { setSeleccion(null); setSeleccionLista(false); setSucursalesFiltro(null); return; }
    const sel = leerSeleccion(employee, sucursales);
    aplicarFiltro(sel, sucursales);
    setSeleccion(sel);
    setSeleccionLista(true);
  }, [employee?.id, employee?.company_id, firmaSucursales]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardarSeleccion = useCallback((sel) => {
    aplicarFiltro(sel, sucursales);
    setSeleccion(sel);
    if (employee) {
      try { localStorage.setItem(claveSucursal(employee), JSON.stringify(sel)); } catch { /* modo privado */ }
    }
  }, [employee, sucursales]);

  // Clic en el nombre: trabajar solo en esa.
  const elegirSucursal = useCallback((id) => guardarSeleccion({ actual: id, marcadas: [id] }), [guardarSeleccion]);

  // Casilla: sumarla o quitarla de lo que se ve. La última no se puede quitar, y si se quita la
  // actual pasa a serlo la primera que quede marcada.
  const alternarSucursal = useCallback((id) => {
    if (!seleccion) return;
    const marcada = seleccion.marcadas.includes(id);
    if (marcada && seleccion.marcadas.length === 1) return;
    const marcadas = marcada
      ? seleccion.marcadas.filter(x => x !== id)
      : sucursales.map(w => w.id).filter(x => x === id || seleccion.marcadas.includes(x));
    const actual = marcadas.includes(seleccion.actual) ? seleccion.actual : marcadas[0];
    guardarSeleccion({ actual, marcadas });
  }, [seleccion, sucursales, guardarSeleccion]);

  // Pasar a trabajar en otra sucursal sin soltar las que ya se miraban (p. ej. para cobrar un
  // pedido de ella desde su caja).
  const trabajarEn = useCallback((id) => {
    if (!seleccion) return guardarSeleccion({ actual: id, marcadas: [id] });
    const marcadas = sucursales.map(w => w.id).filter(x => x === id || seleccion.marcadas.includes(x));
    guardarSeleccion({ actual: id, marcadas });
  }, [seleccion, sucursales, guardarSeleccion]);

  const marcarTodas = useCallback(() => {
    if (!seleccion) return;
    guardarSeleccion({ actual: seleccion.actual, marcadas: sucursales.map(w => w.id) });
  }, [seleccion, sucursales, guardarSeleccion]);

  const sucursalActual = seleccion ? sucursales.find(w => w.id === seleccion.actual) || null : null;
  const sucursalesMarcadas = seleccion ? sucursales.filter(w => seleccion.marcadas.includes(w.id)) : [];
  // Para los títulos de PDF y Excel: vacía si se ve todo, como antes con "Todas las sucursales".
  const etiquetaSucursales = sucursalesMarcadas.length && sucursalesMarcadas.length < sucursales.length
    ? sucursalesMarcadas.map(w => w.name).join(", ") : "";
  // Sin sucursales (usuario sin almacén asignado) no hay nada que preguntar.
  const faltaSucursal = !!employee && seleccionLista && sucursales.length > 1 && !seleccion;
  // Cambia con cada cambio de sucursales: PosApp la usa de `key` para volver a montar la
  // pantalla, que así recarga todo con el nuevo recorte.
  // Vacía mientras falta elegir; "sin" para el usuario que no tiene ninguna.
  const seleccionKey = seleccion
    ? `${seleccion.actual}:${seleccion.marcadas.join(",")}`
    : (employee && seleccionLista && !sucursales.length ? "sin" : "");

  // Vuelve a pedir los almacenes del usuario tras crear o asignar uno. Solo se reemplaza el
  // empleado si la lista cambió: muchos efectos dependen de `employee` y recargarían todo.
  const refreshEmployee = useCallback(async () => {
    try {
      const res = await api.auth.me();
      const fresh = res.employee?.warehouses;
      if (!Array.isArray(fresh)) return;
      const nuevas = res.employee?.sucursales;
      const firma = (ws) => (ws || []).map(w => `${w.id}:${w.name}:${w.sells}`).sort().join("|");
      setEmployee(prev => (!prev || (firma(prev.warehouses) === firma(fresh) && firma(prev.sucursales) === firma(nuevas)))
        ? prev : { ...prev, warehouses: fresh, ...(nuevas ? { sucursales: nuevas } : {}) });
    } catch {}
  }, []);

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
    loadBanks();
    loadPaymentMethods();
    loadCategories();
  }, [employee]);

  // Los diarios dependen de las sucursales marcadas: se cargan una vez elegidas, y de nuevo
  // con cada cambio.
  useEffect(() => {
    if (!employee || !seleccionKey) return;
    loadJournals();
  }, [seleccionKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // evento en vivo no llegaba. Las monedas se piden solo si cambia su huella, que viaja en
    // la misma consulta que las demás de la caja (services/huellaCaja.js).
    const dejar = alCambiar('monedas', null, loadCurrencies);
    return () => {
      unsubSSE();
      dejar();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [employee, loadCurrencies, setCurrencies]);

  // Cerrar SSE al hacer logout
  useEffect(() => {
    if (!employee) closeSSE();
  }, [employee]);

  // ── Derived ────────────────────────────────────────────────
  const baseCurrency     = currencies.find(c => c.is_base);
  // Sin las tasas alternas (Bs a la tasa USDT): son la misma moneda a otra tasa, no una divisa
  // más para elegir en pantalla, en compras o en la ficha del producto. Las ofrece solo el cobro
  // (monedasCobro), según el método.
  const activeCurrencies = currencies.filter(c => c.active && !c.rate_of_id);
  const localCurrency    = monedaLocal(activeCurrencies);
  const monedasCobro     = currencies.filter(c => c.active);
  // El diario Cashea no es una caja: guarda lo que Cashea debe y solo se mueve al vender con
  // Cashea o al liquidar (services/cashea). No se ofrece para cobrar, pagar ni registrar nada.
  const activeJournals   = journals.filter(j => j.active && j.type !== "cashea");
  const activeBanks      = banks.filter(b => b.active);
  const activePaymentMethods = paymentMethods.filter(m => m.active);
  // Sentido de cada caja: lo dice el DIARIO (allows_inflow / allows_outflow). Si el backend
  // todavía no manda la marca (migración pendiente), se cae a la del método, como antes.
  const outflowCodes    = new Set(paymentMethods.filter(m => m.allows_outflow !== false).map(m => m.code));
  // El diario es la cuenta y cada uno de sus métodos dice si recibe, paga o ambas. La cuenta
  // paga si alguno de sus métodos paga. Sin la lista (respuesta vieja), manda el método.
  const journalPays     = (j) => j.methods?.length ? j.methods.some(m => m.allows_outflow) : outflowCodes.has(j.type);
  const journalReceives = (j) => j.methods?.length ? j.methods.some(m => m.allows_inflow) : true;
  // Para dinero que SALE (egresos, pagos a proveedores, vuelto) y para el que ENTRA (cobros).
  const outflowJournals = activeJournals.filter(journalPays);
  const inflowJournals  = activeJournals.filter(journalReceives);

  const storeName    = settings.store_name || "Mi tienda POS";
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
      employee, authChecked, login, logout, can, refreshEmployee,
      // Sucursales
      sucursales, sucursalActual, sucursalesMarcadas, etiquetaSucursales, faltaSucursal, seleccionKey,
      elegirSucursal, alternarSucursal, marcarTodas, trabajarEn,
      // Nav
      pendingNav, setPendingNav, navigateTo,
      // Actions
      pendingAction, setPendingAction, triggerAction,
      // Notify
      notification, notify,
      // Settings
      settings, loadSettings, storeName, companyInfo, company, printerWidth,
      // Currencies
      currencies, activeCurrencies, baseCurrency, localCurrency, monedasCobro, loadCurrencies,
      // Journals
      journals, activeJournals, outflowJournals, inflowJournals, journalPays, journalReceives, loadJournals,
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
