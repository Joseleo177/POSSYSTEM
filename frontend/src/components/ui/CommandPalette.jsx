import { useEffect, useRef, useState } from "react";
import { TAB_ICONS } from "../../constants/icons";

// ── Acciones rápidas disponibles ────────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    id: "venta:nueva",
    label: "Nueva venta",
    desc: "Limpiar carrito e iniciar venta",
    tab: "Cobro",
    action: "venta:nueva",
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        <circle cx="19" cy="5" r="4" fill="currentColor" stroke="none" className="text-success" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} stroke="white"
          d="M19 3.5v3M17.5 5h3" />
      </svg>
    ),
    color: "text-success",
  },
  {
    id: "contabilidad:Facturas",
    label: "Facturas pendientes",
    desc: "Ver ventas sin cobrar o parciales",
    tab: "Contabilidad",
    action: "contabilidad:Facturas",
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    color: "text-warning",
  },
  {
    id: "contabilidad:Cotizaciones",
    label: "Nueva cotización",
    desc: "Ir a la pestaña de Cotizaciones",
    tab: "Contabilidad",
    action: "contabilidad:Cotizaciones",
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
    color: "text-brand-500",
  },
  {
    id: "clientes:nuevo",
    label: "Nuevo cliente",
    desc: "Abrir formulario de nuevo cliente",
    tab: "Clientes",
    action: "clientes:nuevo",
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
      </svg>
    ),
    color: "text-indigo-400",
  },
  {
    id: "compras:nuevo",
    label: "Nueva compra",
    desc: "Registrar ingreso de mercancía",
    tab: "Compras",
    action: "compras:nuevo",
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9zM12 14v4m-2-2h4" />
      </svg>
    ),
    color: "text-orange-400",
  },
  {
    id: "reportes:ventas",
    label: "Reporte de ventas",
    desc: "Análisis y estadísticas de ventas",
    tab: "Reportes",
    action: "reportes:ventas",
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    color: "text-cyan-400",
  },
  {
    id: "reportes:margenes",
    label: "Márgenes y rentabilidad",
    desc: "Ver utilidad bruta por producto",
    tab: "Reportes",
    action: "reportes:margenes",
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    color: "text-emerald-400",
  },
  {
    id: "reportes:cobrar",
    label: "Cuentas por cobrar",
    desc: "Facturas vencidas o por vencer",
    tab: "Reportes",
    action: "reportes:cobrar",
    icon: (cls) => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: "text-rose-400",
  },
];

// ── Componente ───────────────────────────────────────────────────────────────
export default function CommandPalette({ open, onClose, visibleTabs, safeTab, goTab, triggerAction }) {
  const [query, setQuery]   = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef  = useRef(null);
  const listRef   = useRef(null);

  const tabKeys = new Set(visibleTabs.map(t => t.key));

  // Filtrar acciones: solo las del módulo visible + que coincidan con query
  const filteredActions = QUICK_ACTIONS.filter(a =>
    tabKeys.has(a.tab) &&
    (a.label.toLowerCase().includes(query.toLowerCase()) ||
     a.desc.toLowerCase().includes(query.toLowerCase()))
  );

  const filteredTabs = visibleTabs.filter(t =>
    t.label.toLowerCase().includes(query.toLowerCase())
  );

  // Lista plana para navegación con cursor
  const items = [
    ...filteredActions.map(a => ({ ...a, kind: "action" })),
    ...filteredTabs.map(t => ({ ...t, kind: "tab" })),
  ];

  const totalItems = items.length;

  // Reset al abrir
  useEffect(() => {
    if (open) { setQuery(""); setCursor(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  useEffect(() => { setCursor(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape")    { e.preventDefault(); onClose(); }
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(c + 1, totalItems - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = items[cursor];
        if (!item) return;
        if (item.kind === "action") { triggerAction(item.tab, item.action); onClose(); }
        else { goTab(item.key); onClose(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, cursor, goTab, triggerAction, onClose, totalItems]);

  if (!open) return null;

  const handleSelect = (item) => {
    if (item.kind === "action") { triggerAction(item.tab, item.action); onClose(); }
    else { goTab(item.key); onClose(); }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[950] flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md mx-4 rounded-2xl overflow-hidden border border-border/40 dark:border-white/10 shadow-2xl bg-surface-2 dark:bg-[#1a1a1a] animate-in zoom-in-95 fade-in duration-150"
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/20 dark:border-white/[0.06]">
          <svg className="w-4 h-4 shrink-0 text-content-subtle dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
              d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar módulo o acción..."
            className="flex-1 bg-transparent text-[14px] font-medium text-content dark:text-white outline-none placeholder:text-content-subtle/50 dark:placeholder:text-white/25"
          />
          {query && (
            <button onClick={() => setQuery("")}
              className="w-5 h-5 flex items-center justify-center rounded text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Lista */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {totalItems === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] font-bold text-content-subtle dark:text-white/25">
              Sin resultados para "{query}"
            </p>
          ) : (
            <>
              {/* Sección Acciones rápidas */}
              {filteredActions.length > 0 && (
                <>
                  <p className="px-4 pt-2.5 pb-1 text-[9px] font-black uppercase tracking-widest text-content-subtle/60 dark:text-white/20">
                    Acciones rápidas
                  </p>
                  {filteredActions.map((a, i) => {
                    const isHovered = cursor === i;
                    return (
                      <button
                        key={a.id}
                        data-idx={i}
                        onMouseEnter={() => setCursor(i)}
                        onClick={() => handleSelect({ ...a, kind: "action" })}
                        className={[
                          "w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left",
                          isHovered ? "bg-brand-500/10 dark:bg-brand-500/15" : "",
                        ].join(" ")}
                      >
                        <span className={`shrink-0 ${isHovered ? "text-brand-500" : a.color}`}>
                          {a.icon("w-4 h-4")}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-[13px] font-semibold ${isHovered ? "text-content dark:text-white" : "text-content-muted dark:text-white/70"}`}>
                            {a.label}
                          </span>
                          <span className="block text-[10px] font-medium text-content-subtle dark:text-white/30 truncate">
                            {a.desc}
                          </span>
                        </span>
                        {isHovered && (
                          <svg className="w-3.5 h-3.5 shrink-0 text-content-subtle dark:text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </>
              )}

              {/* Sección Módulos */}
              {filteredTabs.length > 0 && (
                <>
                  <p className={`px-4 pb-1 text-[9px] font-black uppercase tracking-widest text-content-subtle/60 dark:text-white/20 ${filteredActions.length > 0 ? "pt-3 mt-1 border-t border-border/10 dark:border-white/[0.05]" : "pt-2.5"}`}>
                    Módulos
                  </p>
                  {filteredTabs.map((t, ti) => {
                    const idx = filteredActions.length + ti;
                    const isActive  = safeTab === t.key;
                    const isHovered = cursor === idx;
                    return (
                      <button
                        key={t.key}
                        data-idx={idx}
                        onMouseEnter={() => setCursor(idx)}
                        onClick={() => handleSelect({ ...t, kind: "tab" })}
                        className={[
                          "w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left",
                          isHovered ? "bg-brand-500/10 dark:bg-brand-500/15" : "",
                        ].join(" ")}
                      >
                        <span className={`shrink-0 ${isHovered || isActive ? "text-brand-500" : "text-content-subtle dark:text-white/35"}`}>
                          {TAB_ICONS[t.key]?.("w-4 h-4")}
                        </span>
                        <span className={`flex-1 text-[13px] font-semibold ${isHovered ? "text-content dark:text-white" : "text-content-muted dark:text-white/60"}`}>
                          {t.label}
                        </span>
                        {isActive && (
                          <span className="text-[9px] font-black uppercase tracking-widest text-brand-500 bg-brand-500/10 px-2 py-0.5 rounded-full">
                            Aquí
                          </span>
                        )}
                        {isHovered && !isActive && (
                          <svg className="w-3.5 h-3.5 shrink-0 text-content-subtle dark:text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border/20 dark:border-white/[0.06]">
          {[["↑↓", "navegar"], ["↵", "ejecutar"], ["Esc", "cerrar"]].map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-border/20 dark:border-white/10 text-[9px] font-black text-content-subtle dark:text-white/30 leading-none">
                {key}
              </kbd>
              <span className="text-[9px] font-bold text-content-subtle/60 dark:text-white/20 uppercase tracking-wide">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
