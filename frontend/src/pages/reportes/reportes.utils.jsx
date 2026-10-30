import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { fmtNumber, fmtInt, todayISO, toLocalISO } from "../../helpers";
import GlobalDateRangePicker from "../../components/ui/DateRangePicker";
import GlobalHourRangePicker from "../../components/ui/HourRangePicker";

// ── Helpers ───────────────────────────────────────────────────
export const fmt$ = (n) => `Ref. ${fmtNumber(n, 2)}`;
export const fmtN = (n) => fmtInt(n);
export const pct = (part, total) => total > 0 ? ((part / total) * 100).toFixed(1) : "0.0";
export const delta = (curr, prev) => prev > 0 ? (((curr - prev) / prev) * 100).toFixed(1) : null;

// Todos los métodos comparten el color de los gráficos (ver ProgressBar): la barra mide
// cuánto entró por cada uno, no quién es. Se conserva el mapa para no romper las llamadas.
export const METHOD_COLORS = {
 efectivo: "bg-chart", transferencia: "bg-chart", banco: "bg-chart",
 movil: "bg-chart", pago_movil: "bg-chart", zelle: "bg-chart",
 punto_venta: "bg-chart", otro: "bg-chart",
};

// ── Hook de reporte genérico ──────────────────────────────────
export function useReport(fetchFn, params, deps = []) {
 const [data, setData] = useState(null);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState(null);
 const load = useCallback(async () => {
 setLoading(true); setError(null);
 try { const r = await fetchFn(params); setData(r.data); }
 catch (e) { console.error(e); setError(e.message || "Error al cargar reporte"); }
 setLoading(false);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, deps);
 useEffect(() => { load(); }, [load]);
 return { data, loading, error, reload: load };
}

export function defaultRange(days = 30) {
 const t = todayISO();
 const d = new Date(); d.setDate(d.getDate() - days);
 return { from: toLocalISO(d), to: t };
}

// Franja horaria del reporte. Arranca vacía —todo el día, como siempre— y solo se manda al
// servidor cuando están las dos horas: con una sola no hay franja que aplicar.
export function useHourRange() {
 const [hours, setHours] = useState({ from: "", to: "" });
 const params = hours.from && hours.to && hours.from !== hours.to
   ? { hour_from: hours.from, hour_to: hours.to }
   : {};
 return {
   hours,
   setHours: (from, to) => setHours({ from, to }),
   params,
   // Para las deps de useReport: un string cambia de identidad solo si cambió la franja.
   key: `${params.hour_from || ""}-${params.hour_to || ""}`,
   activa: Boolean(params.hour_from),
   // Una franja que termina antes de empezar cruza la medianoche, y ahí el servidor imputa
   // la madrugada a la jornada anterior. Las pantallas lo dicen para que el corrimiento de
   // los días no se lea como un error.
   nocturna: Boolean(params.hour_from && params.hour_to < params.hour_from),
 };
}

// ── Export completo: pide el dataset sin límites antes de generar el Excel ──
export function useExportFull(fetchFn, params, build) {
 const [exporting, setExporting] = useState(false);
 const run = async () => {
 if (exporting) return;
 setExporting(true);
 try {
 const r = await fetchFn({ ...params, limit: 100000 });
 build(r.data);
 } catch (e) { console.error(e); }
 finally { setExporting(false); }
 };
 return { run, exporting };
}

// ── Componentes UI reutilizables ──────────────────────────────

export function DateRangePicker({ from, to, onChange }) {
 return <GlobalDateRangePicker from={from} to={to} onRangeChange={(f, t) => onChange(f, t)} />;
}

export function HourRangePicker({ from, to, onChange }) {
 return <GlobalHourRangePicker from={from} to={to} onChange={onChange} />;
}

// Aviso de jornada nocturna para la barra de filtros.
//
// Con una franja que cruza medianoche, el selector de fechas deja de elegir días del
// calendario y pasa a elegir JORNADAS por su día de apertura: pedir "30/08" trae hasta la
// madrugada del 31. Decirlo en abstracto no alcanzaba —se pedía 30→31 creyendo que hacía
// falta abarcar los dos días, y eso trae dos jornadas—, así que el aviso deletrea la ventana
// exacta que se está consultando, con sus fechas y sus horas.
const masUnDia = (iso) => {
 const [y, m, d] = String(iso).split("-").map(Number);
 if (!y || !m || !d) return iso;
 return toLocalISO(new Date(y, m - 1, d + 1));
};
const diaMes = (iso) => String(iso).split("-").reverse().slice(0, 2).join("/");

export function NightShiftNotice({ from, to, dateFrom, dateTo }) {
 // Cuántas jornadas abarca el rango. Sin fechas todavía, se cae al aviso genérico.
 const jornadas = dateFrom && dateTo
   ? Math.round((new Date(dateTo) - new Date(dateFrom)) / 86400000) + 1
   : 0;
 const ventana = dateFrom && dateTo
   ? `${diaMes(dateFrom)} ${from} → ${diaMes(masUnDia(dateTo))} ${to}`
   : `${from}–${to}`;

 return (
   <div className="flex items-center gap-1.5 px-2.5 h-10 rounded-md border border-brand-500/20 bg-brand-500/5 shrink-0">
     <svg className="w-3 h-3 shrink-0 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
     </svg>
     <span className="text-[11px] font-semibold uppercase tracking-tight text-brand-500 whitespace-nowrap">
       {jornadas === 1 ? "Jornada" : `${jornadas} jornadas`}: {ventana}
     </span>
   </div>
 );
}

// Cifra destacada. La cifra va SIEMPRE en tinta: antes cada tarjeta traía su color (verde,
// azul, rojo) y cuatro tarjetas en fila se leían como un semáforo sin significado. El color
// queda para lo que sí lo tiene —la variación contra el período anterior—. `color` se acepta
// por compatibilidad con las llamadas viejas, pero ya no pinta la cifra.
//
// En el teléfono caben dos tarjetas por fila (~145px útiles) y "Ref. 50.041,23" a 22px se
// cortaba en "Ref. 50.04…": justo la cifra, que es lo único que importa. El prefijo de moneda
// va aparte, chico y atenuado como en ui/Money, y el tamaño de la cifra se calcula contra el
// ancho de la tarjeta (cqi) según cuánto mide el número: llega a 22px si cabe y baja si no.
// Sin soporte de cqi el estilo se descarta y queda el text-[22px] de la clase.
const PREFIJO_MONEDA = /^(Ref\.|Bs\.|\$)\s*/;
const anchoEnEm = (s) => [...s].reduce((a, c) => a + (/\d/.test(c) ? 0.62 : /[.,]/.test(c) ? 0.3 : 0.66), 0);

// eslint-disable-next-line no-unused-vars
export function KpiCard({ label, value, sub, icon, color, delta: d }) {
 const texto = typeof value === "string" ? value : null;
 const prefijo = texto?.match(PREFIJO_MONEDA)?.[1] ?? null;
 const cifra = prefijo ? texto.replace(PREFIJO_MONEDA, "") : value;
 const em = texto ? anchoEnEm(String(cifra)) : 0;
 const ajuste = em > 0
 ? { fontSize: `clamp(15px, calc((100cqi - ${prefijo ? 32 : 0}px) / ${em.toFixed(2)}), 22px)` }
 : undefined;
 return (
 <div className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-4 py-3.5 flex flex-col gap-1.5 min-w-0">
 <div className="text-[12px] font-medium text-content-subtle leading-none truncate">{label}</div>
 <div className="[container-type:inline-size] min-w-0">
 <div className="flex items-baseline gap-1 text-[22px] font-bold text-content dark:text-white tracking-[-0.02em] leading-none tabular-nums whitespace-nowrap overflow-hidden" style={ajuste}>
 {prefijo && <span className="text-[12px] font-medium tracking-normal text-content-subtle shrink-0">{prefijo}</span>}
 <span className="min-w-0 truncate">{cifra}</span>
 </div>
 </div>
 <div className="flex items-center justify-between gap-2 min-h-[16px]">
 {sub && <div className="text-[12px] text-content-subtle truncate">{sub}</div>}
 {d !== null && d !== undefined && (
 <div className={`text-[12px] font-semibold tabular-nums shrink-0 ${parseFloat(d) >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
 {parseFloat(d) >= 0 ? "▲" : "▼"} {Math.abs(d)}%
 </div>
 )}
 </div>
 </div>
 );
}

// Título de tarjeta: en tinta y caja normal. El título en color de marca y el subtítulo en
// versalitas competían con los datos de la tarjeta.
export function SectionHeader({ title, sub, right }) {
 return (
 <div className="flex items-start justify-between gap-3 mb-3">
 <div className="min-w-0">
 <div className="text-[14px] font-semibold text-content dark:text-white leading-tight">{title}</div>
 {sub && <div className="text-[12px] text-content-subtle mt-0.5">{sub}</div>}
 </div>
 {right}
 </div>
 );
}

export function Card({ children, className = "" }) {
 return (
 <div className={`bg-white dark:bg-white/[0.03] rounded-xl border border-border/70 dark:border-white/[0.06] p-4 ${className}`}>
 {children}
 </div>
 );
}

// Dato destacado dentro de una tarjeta ("Pico de actividad", "Mejor día"): rótulo gris y
// cifra en tinta sobre un fondo apenas gris. Antes era una caja punteada en color de marca
// con el rótulo en versalitas.
export function Callout({ label, children }) {
 return (
 <div className="mt-3 px-3 py-2.5 rounded-lg bg-surface-2 dark:bg-white/[0.04] flex items-center justify-between gap-3">
 <span className="text-[12px] text-content-subtle">{label}</span>
 <span className="text-[13px] font-semibold text-content dark:text-white tabular-nums text-right">{children}</span>
 </div>
 );
}

export function Loading() {
 return (
 <div className="flex flex-col items-center justify-center py-24 gap-4">
 <div className="w-12 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin" />
 <div className="text-[12px] font-bold text-content-muted dark:text-content-subtle">Cargando reporte...</div>
 </div>
 );
}

// Botón de borde de la barra de reportes (Excel, PDF): mismo alto que los filtros (h-10) y sin
// color propio. Antes Excel iba en verde y PDF en rojo, y el rojo se leía como un error.
// self-start: en el móvil la barra de filtros es una columna y el botón se estiraba a todo el ancho.
export const REPORT_BTN = "btn-outline self-start md:self-auto shrink-0 whitespace-nowrap flex items-center gap-2 h-10 px-3 sm:px-4 text-[13px] font-semibold rounded-lg active:scale-[0.98] disabled:opacity-60";

export function ExportButton({ onClick, loading = false }) {
 if (loading) {
 return (
 <button disabled className={REPORT_BTN}>
 <div className="w-4 h-4 shrink-0 border-2 border-content-subtle/25 border-t-content-subtle rounded-full animate-spin" />
 Generando...
 </button>
 );
 }
 return (
 // shrink-0 y whitespace-nowrap: compartiendo fila con el buscador y los filtros, el botón se
 // comprimía hasta partir "Exportar Excel" en dos líneas y quedaba el doble de alto que sus
 // vecinos. En pantallas estrechas la etiqueta se acorta en vez de envolverse.
 <button onClick={onClick} title="Exportar a Excel" className={REPORT_BTN}>
 <svg className="w-4 h-4 shrink-0 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
 </svg>
 <span className="hidden sm:inline">Exportar Excel</span>
 <span className="sm:hidden">Excel</span>
 </button>
 );
}

// Estado de existencias con el mismo lenguaje que las tablas: "OK" en gris con su check, y
// punto de color solo para lo que pide reponer.
export function StockBadge({ qty, min }) {
 const mark = (label, dot, text) => (
 <span className={`inline-flex items-center gap-2 text-[12px] font-semibold whitespace-nowrap ${text}`}>
 <span className={`w-1.5 h-1.5 rounded-full ring-4 ${dot}`} />{label}
 </span>
 );
 if (parseFloat(qty) <= 0) return mark("Sin stock", "bg-red-500 ring-red-500/20", "text-red-600 dark:text-red-400");
 if (min > 0 && parseFloat(qty) < parseFloat(min)) return mark("Crítico", "bg-amber-500 ring-amber-500/20", "text-amber-700 dark:text-amber-400");
 return (
 <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-content-subtle">
 <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
 OK
 </span>
 );
}

// Barra de proporción de una lista (canales de pago, vendedores, productos). Un solo tono
// —el de los gráficos— porque mide magnitud; el nombre de cada fila ya dice quién es. Antes
// cada método de pago traía su color y la tarjeta parecía un arcoíris. `color` solo se
// respeta si es un color de estado (rojo/ámbar), que sí significa algo.
export function ProgressBar({ value, max, color }) {
 const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
 const fill = /\b(bg-danger|bg-red-|bg-amber-|bg-warning)/.test(color || "") ? color : "bg-chart";
 // Entra en 0 y se llena: el ancho final se pone dos cuadros después del montaje, cuando el
 // navegador ya pintó el 0, o la transición no tiene desde dónde arrancar.
 const [shown, setShown] = useState(() => (reduceMotion() ? w : 0));
 useEffect(() => {
 let r2;
 const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShown(w)); });
 return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
 }, [w]);
 return (
 <div className="h-1.5 bg-surface-3 dark:bg-white/[0.06] rounded-full overflow-hidden">
 <div className={`h-full rounded-full ${fill} transition-[width] duration-700 ease-out motion-reduce:transition-none`} style={{ width: `${shown}%` }} />
 </div>
 );
}

// Color de un tramo. "chart" y "chart-muted" (o sin color) salen de las variables CSS del
// tema, que el canvas no puede leer como clase. Los amarillos que traían las llamadas viejas
// (#FFB800, #fabd2f) se tratan como "chart": ese amarillo con degradado es lo que se cambió.
const LEGACY_YELLOW = /^#?(ffb800|fabd2f|f59e0b|fbbf24)/i;
const cssVar = (name) => typeof document === "undefined" ? "" :
 getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const resolveColor = (c) => {
 if (!c || LEGACY_YELLOW.test(c) || c === "chart") return `rgb(${cssVar("--c-chart")})`;
 if (c === "chart-muted") return `rgb(${cssVar("--c-chart-muted")})`;
 return c;
};

// Redibuja el canvas al cambiar de tema (la clase .dark del <html>): los colores se leen al
// dibujar, y sin esto el gráfico se quedaba con los del tema anterior.
function useThemeKey() {
 const [k, setK] = useState(0);
 useEffect(() => {
 const o = new MutationObserver(() => setK(x => x + 1));
 o.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
 return () => o.disconnect();
 }, []);
 return k;
}

// Animación de entrada de los gráficos: devuelve el avance de 0 a 1 y vuelve a empezar cada
// vez que cambia `key` (los datos de otro período). Con "reducir movimiento" del sistema
// arranca en 1 y no anima.
const reduceMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
export const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
function useEntrance(key, ms = 700) {
 const [t, setT] = useState(() => (reduceMotion() ? 1 : 0));
 useEffect(() => {
  if (reduceMotion()) { setT(1); return; }
  let raf, start = null;
  setT(0);
  const step = (now) => {
   if (start === null) start = now;
   const x = Math.min(1, (now - start) / ms);
   setT(x);
   if (x < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [key]);
 return t;
}

// Paso "redondo" del eje (1, 2, 2.5, 5 × 10^n): la escala decía 127 / 95 / 64 / 32.
const niceStep = (v) => {
 if (!(v > 0)) return 1;
 const p = Math.pow(10, Math.floor(Math.log10(v)));
 const f = v / p;
 return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
};
const tickLabel = (v) => v >= 1000
 ? `${+(v / 1000).toFixed(1)}k`
 : String(+v.toFixed(Number.isInteger(v) ? 0 : 1));
// "2026-10-14" → "14/10"; lo que no es una fecha completa se recorta como antes.
const xLabel = (s) => {
 const m = String(s).match(/^\d{4}-(\d{2})-(\d{2})/);
 return m ? `${m[2]}/${m[1]}` : String(s).slice(5);
};

// `series` dibuja varios tramos apilados por barra ([{ key, color, label }], de abajo
// hacia arriba); `yKey` + `color` siguen sirviendo para el caso de una sola serie.
// `format` da el texto de la etiqueta flotante (por defecto, monto en Ref.).
// `fill`: en vez de un alto fijo, ocupa todo el alto que le dé su contenedor (que debe ser
// flex en columna). Sin esto, en una tarjeta estirada por la de al lado quedaba un hueco.
export function BarChart({ data, xKey, yKey, series, color = "chart", height = 160, fill = false, format = fmt$ }) {
 const ref = useRef(null);
 const wrapRef = useRef(null);
 const geo = useRef(null);
 const [hover, setHover] = useState(null);
 const [size, setSize] = useState({ w: 0, h: 0 });
 const themeKey = useThemeKey();
 const tramos = useMemo(
 () => (series?.length ? series : [{ key: yKey, color }]),
 [series, yKey, color]
 );
 // Entrada: cada barra crece desde la base, una tras otra. El escalón se acorta con muchas
 // barras para que 30 días no tarden más que 5.
 const n = data?.length || 0;
 const BAR_MS = 550;
 const stagger = n > 1 ? Math.min(45, 420 / n) : 0;
 const t = useEntrance(data, BAR_MS + stagger * Math.max(0, n - 1));

 // Redibujo al cambiar el tamaño (sidebar, ventana): antes quedaba estirado o cortado.
 useEffect(() => {
 if (!wrapRef.current) return;
 const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
 ro.observe(wrapRef.current);
 return () => ro.disconnect();
 }, []);

 useEffect(() => {
 if (!data?.length || !ref.current) return;
 const canvas = ref.current;
 const ctx = canvas.getContext("2d");
 const W = canvas.offsetWidth; const H = canvas.offsetHeight || height;
 if (!W || !H) return;
 // Sin esto el canvas se rasteriza a 1x y las barras salen borrosas en pantallas retina.
 const dpr = window.devicePixelRatio || 1;
 canvas.width = W * dpr; canvas.height = H * dpr;
 ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
 const totalDe = d => tramos.reduce((s, x) => s + (parseFloat(d[x.key]) || 0), 0);
 const paso = niceStep(Math.max(...data.map(totalDe), 1) / 4);
 const maxY = paso * 4;
 const pad = { top: 12, right: 8, bottom: 26, left: 44 };
 const cW = W - pad.left - pad.right;
 const cH = H - pad.top - pad.bottom;
 const slotW = cW / data.length;
 // Llenan el slot menos una holgura, con tope: con 5 días salían bloques de 72px.
 const barW = Math.max(3, Math.min(slotW - Math.min(12, slotW * 0.3), 40));
 geo.current = { pad, slotW, cH, maxY, H };
 const sub = cssVar("--c-content-subtle");
 const axis = `rgb(${sub} / 0.85)`;
 const colores = tramos.map(s => resolveColor(s.color));
 ctx.clearRect(0, 0, W, H);

 // Rejilla y eje: recesivos. Cuatro guías, solo la base con más peso.
 for (let i = 0; i <= 4; i++) {
 const y = Math.round(pad.top + (cH / 4) * i) + 0.5;
 ctx.strokeStyle = i === 4 ? `rgb(${sub} / 0.35)` : `rgb(${sub} / 0.12)`;
 ctx.lineWidth = 1;
 ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
 ctx.fillStyle = axis; ctx.font = "500 10px Inter,sans-serif"; ctx.textAlign = "right";
 ctx.fillText(tickLabel(maxY * (1 - i / 4)), pad.left - 8, y + 3);
 }

 const totalMs = BAR_MS + stagger * Math.max(0, n - 1);
 data.forEach((d, i) => {
 const x = pad.left + i * slotW + (slotW - barW) / 2;
 const k = easeOut((t * totalMs - i * stagger) / BAR_MS);
 let base = pad.top + cH;   // se apila de abajo hacia arriba
 // Con el cursor encima de una barra, las demás se atenúan: se ve cuál describe la etiqueta.
 ctx.globalAlpha = hover === null || hover === i ? 1 : 0.4;
 const vivos = tramos.filter(s => (parseFloat(d[s.key]) || 0) > 0);
 tramos.forEach((s, si) => {
 const alto = ((parseFloat(d[s.key]) || 0) / maxY) * cH * k;
 if (alto <= 0.5) return;
 const esTope = s === vivos[vivos.length - 1];
 // 2px de fondo entre tramos apilados, para que se lean como dos partes y no una mancha.
 const hueco = !esTope && alto > 4 ? 2 : 0;
 const y = base - alto;
 ctx.fillStyle = colores[si];
 ctx.beginPath(); ctx.roundRect(x, y + hueco, barW, alto - hueco, esTope ? [Math.min(4, alto), Math.min(4, alto), 0, 0] : 0); ctx.fill();
 base = y;
 });
 ctx.globalAlpha = 1;
 const step = Math.ceil(data.length / 10);
 if (i % step === 0) {
 ctx.fillStyle = hover === i ? `rgb(${cssVar("--c-content-muted")})` : axis;
 ctx.font = "500 10px Inter,sans-serif"; ctx.textAlign = "center";
 ctx.fillText(xLabel(d[xKey]), x + barW / 2, H - 8);
 }
 });
 }, [data, tramos, xKey, height, hover, size, themeKey, t, stagger, n]);

 const onMove = (e) => {
 const g = geo.current;
 if (!g || !data?.length) return;
 const r = ref.current.getBoundingClientRect();
 const i = Math.floor((e.clientX - r.left - g.pad.left) / g.slotW);
 setHover(i >= 0 && i < data.length ? i : null);
 };

 const punto = hover !== null && data?.[hover] ? data[hover] : null;
 const g = geo.current;

 return (
 <div className={fill ? "flex flex-col flex-1 min-h-0" : ""}>
  <div ref={wrapRef} className={`relative ${fill ? "flex-1 min-h-[200px]" : ""}`} style={fill ? undefined : { height }}>
  <canvas ref={ref} className="absolute inset-0 w-full h-full cursor-crosshair" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
  {punto && g && (
  <div
   className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full px-2.5 py-2 rounded-lg bg-white dark:bg-surface-dark-3 border border-black/[0.08] dark:border-white/10 shadow-[0_8px_24px_-6px_rgb(0_0_0/0.2)] whitespace-nowrap transition-[left] duration-150 ease-out"
   style={{ left: g.pad.left + hover * g.slotW + g.slotW / 2, top: g.pad.top + g.cH * (1 - tramos.reduce((s, x) => s + (parseFloat(punto[x.key]) || 0), 0) / g.maxY) - 6 }}
  >
   <div className="text-[11px] text-content-subtle mb-0.5 tabular-nums">{String(punto[xKey])}</div>
   {tramos.map(s => (
   <div key={s.key} className="flex items-center gap-2 text-[12px] tabular-nums">
    {tramos.length > 1 && <span className="w-2 h-2 rounded-sm" style={{ background: resolveColor(s.color) }} />}
    {tramos.length > 1 && <span className="text-content-subtle">{s.label || s.key}</span>}
    <span className="font-semibold text-content dark:text-white ml-auto">{format(parseFloat(punto[s.key]) || 0)}</span>
   </div>
   ))}
  </div>
  )}
  </div>
  {tramos.length > 1 && (
  <div className="flex items-center justify-center gap-4 mt-2">
   {tramos.map(s => (
   <span key={s.key} className="flex items-center gap-1.5 text-[12px] font-medium text-content-subtle">
    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: resolveColor(s.color) }} />
    {s.label || s.key}
   </span>
   ))}
  </div>
  )}
 </div>
 );
}

export function usePagination(items = [], pageSize = 25) {
 const [page, setPage] = useState(1);
 const total = items.length;
 const totalPages = Math.max(1, Math.ceil(total / pageSize));
 const safePage = Math.min(page, totalPages);
 const paginated = items.slice((safePage - 1) * pageSize, safePage * pageSize);
 return { page: safePage, setPage, totalPages, total, paginated };
}

export function Pagination({ page, totalPages, total, onPage }) {
 if (totalPages <= 1) return null;
 return (
  // Mismo aspecto que ui/Pagination: flechas grises y "Página N de M".
  <div className="shrink-0 px-4 h-12 border-t border-border/70 dark:border-white/[0.06] bg-surface-2/60 dark:bg-white/[0.02] flex items-center justify-between rounded-b-xl">
   <div className="text-[12px] text-content-subtle tabular-nums">
    <span className="font-semibold text-content dark:text-white">{total}</span> registros
   </div>
   <div className="flex items-center gap-0.5">
    {[
     { to: 1, dis: page === 1, d: "M11 19l-7-7 7-7m8 14l-7-7 7-7", t: "Primera página" },
     { to: page - 1, dis: page === 1, d: "M15 19l-7-7 7-7", t: "Anterior" },
    ].map(b => (
     <button key={b.t} disabled={b.dis} onClick={() => onPage(b.to)} title={b.t} aria-label={b.t} className="row-icon disabled:opacity-30">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={b.d} /></svg>
     </button>
    ))}
    <span className="px-2 text-[12px] text-content-subtle tabular-nums whitespace-nowrap">
     Página <span className="font-semibold text-content dark:text-white">{page}</span> de {totalPages}
    </span>
    {[
     { to: page + 1, dis: page === totalPages, d: "M9 5l7 7-7 7", t: "Siguiente" },
     { to: totalPages, dis: page === totalPages, d: "M13 5l7 7-7 7M5 5l7 7-7 7", t: "Última página" },
    ].map(b => (
     <button key={b.t} disabled={b.dis} onClick={() => onPage(b.to)} title={b.t} aria-label={b.t} className="row-icon disabled:opacity-30">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={b.d} /></svg>
     </button>
    ))}
   </div>
  </div>
 );
}

// ── Torta (dona) de parte del todo ────────────────────────────
// Cuatro tonos fijos y "Otros" en gris. Validado para daltonismo en el orden azul, naranja,
// aguamarina, ámbar, gris (y el gris vuelve a tocar el azul al cerrar el anillo): con un
// quinto tono el magenta quedaba pegado al gris y no se distinguían. Tonos propios del modo
// oscuro, no los mismos aclarados.
const DONUT_SLOTS = {
 light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"],
 dark:  ["#3987e5", "#d95926", "#199e70", "#c98500"],
};
const DONUT_OTROS = { light: "#8a8a86", dark: "#6b6b68" };
export const DONUT_MAX_SLOTS = DONUT_SLOTS.light.length;

// Punto del anillo a un ángulo, con 0 arriba y en sentido horario.
const polar = (c, r, a) => [c + r * Math.sin(a), c - r * Math.cos(a)];
const ringPath = (c, ro, ri, a0, a1) => {
 const large = a1 - a0 > Math.PI ? 1 : 0;
 const [x0, y0] = polar(c, ro, a0), [x1, y1] = polar(c, ro, a1);
 const [x2, y2] = polar(c, ri, a1), [x3, y3] = polar(c, ri, a0);
 return `M${x0} ${y0}A${ro} ${ro} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${ri} ${ri} 0 ${large} 0 ${x3} ${y3}Z`;
};

// `slices`: [{ key, label, value, slot }] con `slot` 0..3 u "otros". El tono lo decide quien
// llama según el peso de la entidad en el total, para que el mismo diario salga del mismo
// color en todas las tortas de la pantalla aunque en una sea el más chico.
export function DonutChart({ slices, size = 140, thickness = 18, format = fmt$, emptyTitle = "Sin cobros", emptyText }) {
 useThemeKey();
 const [active, setActive] = useState(null);
 const modo = typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light";
 const colorDe = (slot) => slot === "otros" ? DONUT_OTROS[modo] : DONUT_SLOTS[modo][slot];
 const vivos = (slices || []).filter(s => s.value > 0);
 const total = vivos.reduce((t, s) => t + s.value, 0);
 // Entrada: el anillo se dibuja en barrido desde arriba y el total sube contando. La clave
 // son los valores, no el arreglo, que quien llama arma de nuevo en cada render.
 const t0 = useEntrance(vivos.map(s => `${s.key}:${s.value}`).join("|"), 900);
 const e = easeOut(t0);

 if (total <= 0) {
  return (
   <div className="flex flex-col items-center justify-center text-center py-8">
    <div className="w-10 h-10 rounded-xl bg-surface-2 dark:bg-white/[0.05] flex items-center justify-center text-content-subtle mb-2">
     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
    </div>
    <div className="text-[13px] font-semibold text-content dark:text-white">{emptyTitle}</div>
    {emptyText && <div className="text-[12px] text-content-subtle mt-0.5">{emptyText}</div>}
   </div>
  );
 }

 const c = size / 2, ro = c, ri = c - thickness;
 // 2px de aire entre tramos, medido a mitad del anillo.
 const gap = vivos.length > 1 ? 2 / (ro - thickness / 2) : 0;
 let a = 0;
 const tramos = vivos.map(s => {
  const span = (s.value / total) * Math.PI * 2;
  const a0 = a + gap / 2, a1 = Math.max(a0 + 0.01, a + span - gap / 2);
  a += span;
  return { ...s, a0: a0 * e, a1: a1 * e, pct: (s.value / total) * 100 };
 });
 const circ = 2 * Math.PI * (ro - thickness / 2);
 const sel = tramos.find(t => t.key === active);
 const [pre, cifra] = (() => { const t = format(sel ? sel.value : total * e); const m = t.match(/^(\S+\.)\s(.*)$/); return m ? [m[1], m[2]] : ["", t]; })();
 const toggle = (k) => setActive(x => x === k ? null : k);

 return (
  // En el teléfono la leyenda va debajo: al lado, los nombres de los diarios se cortaban.
  <div className="flex flex-col sm:flex-row items-center gap-4 min-w-0" onMouseLeave={() => setActive(null)}>
   <div className="relative shrink-0" style={{ width: size, height: size }}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={tramos.map(t => `${t.label}: ${t.pct.toFixed(1)}%`).join(", ")}>
     {tramos.length === 1 ? (
      <circle cx={c} cy={c} r={ro - thickness / 2} fill="none" strokeWidth={thickness} stroke={colorDe(tramos[0].slot)}
       strokeDasharray={`${circ * e} ${circ}`} transform={`rotate(-90 ${c} ${c})`}
       onMouseEnter={() => setActive(tramos[0].key)} onClick={() => toggle(tramos[0].key)} className="cursor-pointer" />
     ) : tramos.filter(t => t.a1 - t.a0 > 0.001).map(t => (
      <path key={t.key} d={ringPath(c, ro, ri, t.a0, t.a1)} fill={colorDe(t.slot)}
       opacity={active && active !== t.key ? 0.3 : 1}
       onMouseEnter={() => setActive(t.key)} onClick={() => toggle(t.key)}
       className="cursor-pointer transition-opacity duration-150" />
     ))}
    </svg>
    {/* Al centro, el total; con un tramo señalado, su porcentaje y su monto. */}
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6">
     <div className="text-[12px] text-content-subtle leading-tight tabular-nums">{sel ? `${sel.pct.toFixed(1)}%` : "Total"}</div>
     <div className="mt-0.5 flex items-baseline gap-1 tabular-nums whitespace-nowrap">
      {pre && <span className="text-[10px] text-content-subtle">{pre}</span>}
      <span className="text-[15px] font-semibold text-content dark:text-white tracking-tight">{cifra}</span>
     </div>
    </div>
   </div>
   <ul className="w-full sm:w-auto sm:flex-1 min-w-0 space-y-0.5">
    {tramos.map((t, i) => {
     // La leyenda entra a la par del anillo, una fila tras otra.
     const k = easeOut(t0 * 1.6 - i * 0.12);
     return (
     <li key={t.key} style={{ opacity: k, transform: `translateX(${(1 - k) * 8}px)` }}>
      <button type="button" onMouseEnter={() => setActive(t.key)} onClick={() => toggle(t.key)}
       title={t.label}
       className={`w-full flex items-start gap-2 px-2 py-1 rounded-md text-left transition-colors ${active === t.key ? "bg-surface-2 dark:bg-white/[0.05]" : ""}`}>
       <span className="w-2.5 h-2.5 mt-[3px] rounded-sm shrink-0" style={{ background: colorDe(t.slot) }} />
       <span className="flex-1 min-w-0">
        <span className="block text-[12px] font-medium text-content dark:text-white truncate">{t.label}</span>
        <span className="block text-[12px] text-content-subtle tabular-nums truncate">{t.pct.toFixed(1)}% · {format(t.value)}</span>
       </span>
      </button>
     </li>
     );
    })}
   </ul>
  </div>
 );
}

export function HeatmapHours({ data }) {
 // Las 24 columnas suben de izquierda a derecha, como si el día transcurriera.
 const t = useEntrance(data, 600 + 23 * 18);
 if (!data?.length) return null;
 const maxRev = Math.max(...data.map(d => d.revenue), 1);
 return (
 <div>
 <div className="flex gap-1 items-end mb-1 h-[52px]">
 {Array.from({ length: 24 }, (_, h) => {
 const row = data.find(d => parseInt(d.hour) === h);
 const rev = parseFloat(row?.revenue || 0);
 const intensity = rev / maxRev;
 return (
 <div key={h} className="flex-1 flex flex-col items-center" title={`${h}:00 — ${fmt$(rev)}`}>
 {/* Escala secuencial de un solo tono: más venta, cian más lleno. Las horas sin venta
     quedan como una raya gris, no como un amarillo desteñido. */}
 <div
 className={`w-full rounded-[3px] ${rev > 0 ? "" : "bg-surface-3 dark:bg-white/[0.06]"}`}
 style={rev > 0
 ? { height: `${Math.max(2, Math.max(6, intensity * 52) * easeOut((t * (600 + 23 * 18) - h * 18) / 600))}px`, background: `rgb(var(--c-chart) / ${0.25 + intensity * 0.75})` }
 : { height: "4px" }}
 />
 </div>
 );
 })}
 </div>
 <div className="flex gap-1 items-end">
 {Array.from({ length: 24 }, (_, h) => (
 <div key={h} className="flex-1 text-center">
 {h % 6 === 0 && <span className="text-[11px] text-content-subtle dark:text-content-dark-muted">{h}h</span>}
 </div>
 ))}
 </div>
 </div>
 );
}
