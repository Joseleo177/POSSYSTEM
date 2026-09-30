import React, { useState, useRef, useEffect, useMemo, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { toLocalISO } from "../../helpers";

/**
 * Premium Single DatePicker Component
 * Custom calendar interface with Dark/Light mode support and quick shortcuts.
 * Uses React Portal to float above modals and avoid clipping/scrolling issues.
 */
export default function DatePicker({ value, onChange, placeholder = "dd/mm/aaaa", className = "", clearable = true }) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const [y, m] = value.split("-");
      return new Date(parseInt(y), parseInt(m) - 1, 1);
    }
    return new Date();
  });
  const [mode, setMode] = useState("days"); // days, months, years
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);

  // Sync viewDate when value changes externally
  useEffect(() => {
    if (value) {
      const [y, m] = value.split("-");
      setViewDate(new Date(parseInt(y), parseInt(m) - 1, 1));
    }
  }, [value]);

  // Position calculation for Portal
  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const dropdownHeight = 280; // approximate
      const dropdownWidth = 260; // approximate
      
      let top = rect.bottom + window.scrollY + 4;
      let left = rect.left + window.scrollX;

      // Flip upwards if not enough space below
      if (rect.bottom + dropdownHeight > window.innerHeight) {
        top = rect.top + window.scrollY - dropdownHeight - 4;
      }
      
      // Prevent overflow on right
      if (left + dropdownWidth > window.innerWidth) {
        left = window.innerWidth - dropdownWidth - 10;
      }

      setCoords({ top, left });
    }
  };

  useLayoutEffect(() => {
    if (isOpen) updateCoords();
  }, [isOpen]);

  // Close when clicking outside
  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target) && 
          dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setMode("days");
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClick);
      window.addEventListener("scroll", updateCoords, true);
      window.addEventListener("resize", updateCoords);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [isOpen]);

  // Calendar Logic
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const startDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const days = [];

    const prevMonthDays = daysInMonth(year, month - 1);
    const startDay = startDayOfMonth(year, month);
    const offset = startDay === 0 ? 6 : startDay - 1;

    for (let i = offset - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevMonthDays - i), currentMonth: false });
    }

    const totalDays = daysInMonth(year, month);
    for (let i = 1; i <= totalDays; i++) {
      days.push({ date: new Date(year, month, i), currentMonth: true });
    }

    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), currentMonth: false });
    }

    return days;
  }, [viewDate]);

  const monthName = viewDate.toLocaleString("es-ES", { month: "long" });
  const yearTitle = viewDate.getFullYear();

  const handleDateClick = (date) => {
    const dateStr = toLocalISO(date);
    onChange?.(dateStr);
    setIsOpen(false);
    setMode("days");
  };

  const isSelected = (date) => {
    const d = toLocalISO(date);
    return value && d === value;
  };

  const isToday = (date) => {
    return date.toDateString() === new Date().toDateString();
  };

  const changeMonth = (offset) => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1));
  };

  const jumpToYear = (y) => {
    setViewDate(new Date(y, viewDate.getMonth(), 1));
    setMode("days");
  };

  const jumpToMonth = (m) => {
    setViewDate(new Date(viewDate.getFullYear(), m, 1));
    setMode("days");
  };

  // Shortcuts logic
  const setShortcut = (type) => {
    const now = new Date();
    const todayStr = toLocalISO(now);
    
    if (type === "today") {
      onChange?.(todayStr);
    } else if (type === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      onChange?.(toLocalISO(yesterday));
    } else if (type === "tomorrow") {
      const tomorrow = new Date();
      tomorrow.setDate(now.getDate() + 1);
      onChange?.(toLocalISO(tomorrow));
    } else if (type === "none") {
      onChange?.("");
    }
    setIsOpen(false);
    setMode("days");
  };

  // Formatting display
  const fmt = (d) => {
    if (!d) return placeholder;
    const [y, m, day] = d.split("-");
    const monthsShort = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${day} ${monthsShort[parseInt(m)-1]} ${y}`;
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button - Mimics .input class for perfect alignment */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center w-full gap-2 px-3.5 h-10 rounded-xl border border-border/20 dark:border-white/[0.08] bg-white/[0.02] dark:bg-white/[0.04] text-content dark:text-white transition-all cursor-pointer group select-none hover:border-brand-500/40 dark:hover:border-brand-500/40"
      >
        <svg className="w-3.5 h-3.5 text-content-subtle opacity-50 group-hover:text-brand-500 group-hover:opacity-100 transition-all shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        
        <span className={`text-[12px] font-medium tracking-tight whitespace-nowrap truncate ${value ? "" : "opacity-30"}`}>
          {fmt(value)}
        </span>

        {value && clearable && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange?.(""); }}
            aria-label="Quitar fecha"
            className="ml-auto -mr-1.5 w-6 h-6 shrink-0 rounded-md flex items-center justify-center hover:bg-danger/10 text-content-subtle/60 hover:text-danger transition-all"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {/* Calendar Dropdown - Rendered via Portal to escape modal overflow */}
      {isOpen && createPortal(
        <div 
          ref={dropdownRef}
          style={{ 
            position: 'absolute', 
            top: coords.top, 
            left: coords.left,
            zIndex: 9999
          }}
          className="bg-white dark:bg-surface-dark-2 border border-black/[0.06] dark:border-white/[0.08] rounded-xl shadow-[0_12px_40px_-8px_rgb(0_0_0/0.22)] overflow-hidden popover-in"
        >
          <div className="flex bg-white dark:bg-surface-dark-2">
            {/* Sidebar Shortcuts - Consistently Compact */}
            <div className="w-16 border-r border-border/10 dark:border-white/5 py-2 flex flex-col gap-1 px-1 shrink-0 bg-surface-2/30 dark:bg-white/[0.02]">
              <div className="text-[8px] font-bold text-content-subtle mb-1 px-1.5">Atajos</div>
              {[
                { id: "today", label: "Hoy" },
                { id: "yesterday", label: "Ayer" },
                { id: "tomorrow", label: "Mañ." },
                { id: "none", label: "Nulo" },
              ].map(s => (
                <button 
                  key={s.id} 
                  onClick={() => setShortcut(s.id)}
                  className="w-full py-1 px-0.5 text-[9px] font-bold text-center text-content-subtle hover:text-brand-500 hover:bg-brand-500/10 rounded-md transition-all"
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Main Area */}
            <div className="p-2 w-[190px] min-h-[230px]">
              {/* Header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-1 group/header">
                  <button
                    onClick={() => setMode(mode === "months" ? "days" : "months")}
                    className={`text-[12px] font-bold px-1.5 py-0.5 rounded transition-all ${mode === "months" ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-500/40 px-2 shadow-sm" : "text-content dark:text-white hover:bg-surface-2 dark:hover:bg-white/5"}`}
                  >
                    {monthName}
                  </button>
                  <button
                    onClick={() => setMode(mode === "years" ? "days" : "years")}
                    className={`text-[12px] font-bold px-1.5 py-0.5 rounded transition-all ${mode === "years" ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 ring-1 ring-inset ring-brand-500/40 px-2 shadow-sm" : "text-content-subtle opacity-40 hover:opacity-100 hover:bg-surface-2 dark:hover:bg-white/5"}`}
                  >
                    {yearTitle}
                  </button>
                </div>

                {mode === "days" && (
                  <div className="flex gap-0.5">
                    <button onClick={() => changeMonth(-1)} className="p-1 rounded-md hover:bg-surface-2 dark:hover:bg-white/5 transition-colors">
                      <svg className="w-3.5 h-3.5 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button onClick={() => changeMonth(1)} className="p-1 rounded-md hover:bg-surface-2 dark:hover:bg-white/5 transition-colors">
                      <svg className="w-3.5 h-3.5 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Content Area */}
              {mode === "days" && (
                <>
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {["L", "M", "X", "J", "V", "S", "D"].map(d => (
                      <div key={d} className="h-6 flex items-center justify-center text-[10px] font-bold text-content-subtle">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5">
                    {calendarDays.map((d, i) => {
                      const selected = isSelected(d.date);
                      const today = isToday(d.date);

                      return (
                        <div
                          key={i}
                          onClick={() => handleDateClick(d.date)}
                          className={`
 h-8 flex flex-col items-center justify-center text-[11px] font-bold cursor-pointer rounded-md transition-all relative
 ${!d.currentMonth ? "opacity-10 text-content-subtle" : "text-content dark:text-white/80 hover:bg-brand-500/10 hover:text-brand-500"}
                            ${selected ? "!bg-brand-500 !text-black shadow-sm" : ""}
                          `}
                        >
                          {d.date.getDate()}
                          {today && !selected && (
                            <div className="w-1 h-1 bg-brand-500 rounded-full absolute bottom-1" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {mode === "months" && (
                <div className="grid grid-cols-3 gap-2">
                  {months.map((m, i) => (
                    <button
                      key={m}
                      onClick={() => jumpToMonth(i)}
                      className={`py-3 text-[11px] font-bold rounded-lg border transition-all
 ${viewDate.getMonth() === i ? "btn-accent border-brand-500" : "bg-surface-2 dark:bg-white/5 border-border/10 dark:border-white/5 text-content-subtle hover:text-brand-500 hover:border-brand-500/30"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}

              {mode === "years" && (
                <div className="grid grid-cols-3 gap-2 h-44 overflow-y-auto scrollbar-thin pr-1 custom-scrollbar">
                  {(() => {
                    const currentYear = new Date().getFullYear();
                    const years = [];
                    for (let y = 1980; y <= currentYear + 20; y++) years.push(y);
                    return years.map(y => (
                      <button
                        key={y}
                        onClick={() => jumpToYear(y)}
                        className={`py-2 text-[11px] font-bold rounded-lg border transition-all
 ${viewDate.getFullYear() === y ? "selected-year btn-accent border-brand-500 font-bold" : "bg-surface-2 dark:bg-white/5 border-border/10 dark:border-white/5 text-content-subtle hover:text-brand-500 hover:border-brand-500/30 font-semibold"}`}
                      >
                        {y}
                      </button>
                    ));
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
