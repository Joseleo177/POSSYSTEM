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
// eslint-disable-next-line no-unused-vars
export function KpiCard({ label, value, sub, icon, color, delta: d }) {
 return (
 <div className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-4 py-3.5 flex flex-col gap-1.5 min-w-0">
 <div className="text-[12px] font-medium text-content-subtle leading-none truncate">{label}</div>
 <div className="text-[22px] font-bold text-content dark:text-white tracking-[-0.02em] leading-none tabular-nums truncate">{value}</div>
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
export const REPORT_BTN = "btn-outline shrink-0 whitespace-nowrap flex items-center gap-2 h-10 px-3 sm:px-4 text-[13px] font-semibold rounded-lg active:scale-[0.98] disabled:opacity-60";

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
 return (
 <div className="h-1.5 bg-surface-3 dark:bg-white/[0.06] rounded-full overflow-hidden">
 <div className={`h-full rounded-full ${fill} transition-all duration-700`} style={{ width: `${w}%` }} />
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

// `series` dibuja varios tramos apilados por barra ([{ key, color, label }], de abajo
// hacia arriba); `yKey` + `color` siguen sirviendo para el caso de una sola serie.
// `format` da el texto de la etiqueta flotante (por defecto, monto en Ref.).
export function BarChart({ data, xKey, yKey, series, color = "chart", height = 160, format = fmt$ }) {
 const ref = useRef(null);
 const wrapRef = useRef(null);
 const geo = useRef(null);
 const [hover, setHover] = useState(null);
 const [width, setWidth] = useState(0);
 const themeKey = useThemeKey();
 const tramos = useMemo(
 () => (series?.length ? series : [{ key: yKey, color }]),
 [series, yKey, color]
 );

 // Redibujo al cambiar el ancho (sidebar, ventana): antes quedaba estirado o cortado.
 useEffect(() => {
 if (!wrapRef.current) return;
 const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
 ro.observe(wrapRef.current);
 return () => ro.disconnect();
 }, []);

 useEffect(() => {
 if (!data?.length || !ref.current) return;
 const canvas = ref.current;
 const ctx = canvas.getContext("2d");
 const W = canvas.offsetWidth; const H = height;
 // Sin esto el canvas se rasteriza a 1x y las barras salen borrosas en pantallas retina.
 const dpr = window.devicePixelRatio || 1;
 canvas.width = W * dpr; canvas.height = H * dpr;
 ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
 const totalDe = d => tramos.reduce((t, s) => t + (parseFloat(d[s.key]) || 0), 0);
 const maxY = Math.max(...data.map(totalDe), 1);
 const pad = { top: 10, right: 8, bottom: 26, left: 44 };
 const cW = W - pad.left - pad.right;
 const cH = H - pad.top - pad.bottom;
 const slotW = cW / data.length;
 // Llenan el slot menos una holgura, con tope para que 3 días no den barras de 300px.
 const barW = Math.max(3, Math.min(slotW - Math.min(12, slotW * 0.25), 72));
 geo.current = { pad, slotW, cH, maxY, H };
 const axis = `rgb(${cssVar("--c-content-subtle")} / 0.85)`;
 const colores = tramos.map(s => resolveColor(s.color));
 ctx.clearRect(0, 0, W, H);

 // Rejilla y eje: recesivos. Cuatro guías, solo la base con más peso.
 for (let i = 0; i <= 4; i++) {
 const y = Math.round(pad.top + (cH / 4) * i) + 0.5;
 ctx.strokeStyle = i === 4 ? `rgb(${cssVar("--c-content-subtle")} / 0.35)` : `rgb(${cssVar("--c-content-subtle")} / 0.12)`;
 ctx.lineWidth = 1;
 ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
 ctx.fillStyle = axis; ctx.font = "500 10px Inter,sans-serif"; ctx.textAlign = "right";
 const v = maxY * (1 - i / 4);
 ctx.fillText(v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0), pad.left - 8, y + 3);
 }

 data.forEach((d, i) => {
 const x = pad.left + i * slotW + (slotW - barW) / 2;
 let base = pad.top + cH;   // se apila de abajo hacia arriba
 // Con el cursor encima de una barra, las demás se atenúan: se ve cuál describe la etiqueta.
 ctx.globalAlpha = hover === null || hover === i ? 1 : 0.45;
 const vivos = tramos.filter(s => (parseFloat(d[s.key]) || 0) > 0);
 tramos.forEach((s, si) => {
 let alto = ((parseFloat(d[s.key]) || 0) / maxY) * cH;
 if (alto <= 0) return;
 const esTope = s === vivos[vivos.length - 1];
 // 2px de fondo entre tramos apilados, para que se lean como dos partes y no una mancha.
 const hueco = !esTope && alto > 4 ? 2 : 0;
 const y = base - alto;
 ctx.fillStyle = colores[si];
 ctx.beginPath(); ctx.roundRect(x, y + hueco, barW, alto - hueco, esTope ? [4, 4, 0, 0] : 0); ctx.fill();
 base = y;
 });
 ctx.globalAlpha = 1;
 const step = Math.ceil(data.length / 10);
 if (i % step === 0) {
 ctx.fillStyle = axis; ctx.font = "500 10px Inter,sans-serif"; ctx.textAlign = "center";
 ctx.fillText(String(d[xKey]).slice(5), x + barW / 2, H - 8);
 }
 });
 }, [data, tramos, xKey, height, hover, width, themeKey]);

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
 <div ref={wrapRef} className="relative">
  <canvas ref={ref} className="w-full cursor-crosshair" style={{ height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
  {punto && g && (
  <div
   className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full px-2.5 py-2 rounded-lg bg-white dark:bg-surface-dark-3 border border-black/[0.08] dark:border-white/10 shadow-[0_8px_24px_-6px_rgb(0_0_0/0.2)] whitespace-nowrap"
   style={{ left: g.pad.left + hover * g.slotW + g.slotW / 2, top: g.pad.top - 4 }}
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

export function HeatmapHours({ data }) {
 if (!data?.length) return null;
 const maxRev = Math.max(...data.map(d => d.revenue), 1);
 return (
 <div>
 <div className="flex gap-1 items-end mb-1">
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
 ? { height: `${Math.max(6, intensity * 52)}px`, background: `rgb(var(--c-chart) / ${0.25 + intensity * 0.75})` }
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
