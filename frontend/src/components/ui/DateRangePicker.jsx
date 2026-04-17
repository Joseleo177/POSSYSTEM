import React, { useState, useRef, useEffect, useMemo, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Premium DateRangePicker Component
 * Custom calendar interface with Dark/Light mode support and quick shortcuts.
 * Uses React Portal to float above UI containers and avoid clipping.
 */
export default function DateRangePicker({ from, to, setFrom, setTo, onRangeChange, className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [viewDate, setViewDate] = useState(new Date()); // The month being viewed
  const [mode, setMode] = useState("days"); // days, months, years
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);

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

    // Previous month padding
    const prevMonthDays = daysInMonth(year, month - 1);
    const startDay = startDayOfMonth(year, month);
    // Adjust for Monday start (0=Sun, 1=Mon... -> 0=Mon, 6=Sun)
    const offset = startDay === 0 ? 6 : startDay - 1;

    for (let i = offset - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        currentMonth: false,
      });
    }

    // Current month
    const totalDays = daysInMonth(year, month);
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        date: new Date(year, month, i),
        currentMonth: true,
      });
    }

    // Next month padding to fill 42 cells (6 rows)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        currentMonth: false,
      });
    }

    return days;
  }, [viewDate]);

  const monthName = viewDate.toLocaleString("es-ES", { month: "long" });
  const yearTitle = viewDate.getFullYear();

  const handleDateClick = (date) => {
    const dateStr = date.toISOString().split("T")[0];
    if (!from || (from && to)) {
      if (onRangeChange) {
        onRangeChange(dateStr, "");
      } else {
        setFrom(dateStr);
        setTo("");
      }
    } else {
      let finalFrom = from;
      let finalTo = dateStr;
      
      if (dateStr < from) {
        finalFrom = dateStr;
        finalTo = from;
      }
      
      if (onRangeChange) {
        onRangeChange(finalFrom, finalTo);
      } else {
        setFrom(finalFrom);
        setTo(finalTo);
      }
      setIsOpen(false); 
      setMode("days");
    }
  };

  const isInRange = (date) => {
    const d = date.toISOString().split("T")[0];
    return from && d > from && to && d < to;
  };

  const isSelected = (date) => {
    const d = date.toISOString().split("T")[0];
    return d === from || d === to;
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

  // Auto-scroll to current year in year picker
  const yearPickerRef = useRef(null);
  useEffect(() => {
    if (mode === "years" && yearPickerRef.current) {
      const selectedYearBtn = yearPickerRef.current.querySelector(".selected-year");
      if (selectedYearBtn) {
        selectedYearBtn.scrollIntoView({ block: "center", behavior: "auto" });
      }
    }
  }, [mode]);

  // Shortcuts
  const setShortcut = (type) => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    let finalFrom = "";
    let finalTo = "";
    
    if (type === "today") {
      finalFrom = todayStr;
      finalTo = todayStr;
    } else if (type === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const yStr = yesterday.toISOString().split("T")[0];
      finalFrom = yStr;
      finalTo = yStr;
    } else if (type === "7days") {
      const past = new Date();
      past.setDate(now.getDate() - 7);
      finalFrom = past.toISOString().split("T")[0];
      finalTo = todayStr;
    } else if (type === "month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      finalFrom = startOfMonth.toISOString().split("T")[0];
      finalTo = todayStr;
    }

    if (onRangeChange) {
      onRangeChange(finalFrom, finalTo);
    } else {
      setFrom(finalFrom);
      setTo(finalTo);
    }

    setIsOpen(false);
    setMode("days");
  };

  // Formatting display
  const fmt = (d) => {
      if (!d) return "dd/mm/aaaa";
      const [y, m, day] = d.split("-");
      return `${day}/${m}/${y}`;
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button - Mimics .input for alignment & matches buttons */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center w-full gap-2 px-3 h-10 rounded-md border border-border/80 dark:border-white/5 bg-white dark:bg-[#12141a] text-content dark:text-content-dark transition-all cursor-pointer group select-none shadow-sm hover:border-brand-500/40"
      >
        <svg className="w-3.5 h-3.5 text-content-subtle opacity-50 group-hover:text-brand-500 group-hover:opacity-100 transition-all shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        
        <div className="flex items-center justify-center gap-2 flex-1">
          <span className={`text-[11px] font-medium uppercase tracking-tight ${from ? "" : "opacity-30"}`}>
            {fmt(from)}
          </span>
          <span className="text-content-subtle opacity-20 text-[10px] font-bold group-hover:opacity-40 transition-opacity">→</span>
          <span className={`text-[11px] font-medium uppercase tracking-tight ${to ? "" : "opacity-30"}`}>
            {fmt(to)}
          </span>
        </div>

        {(from || to) && (
          <button 
            onClick={(e) => { e.stopPropagation(); onRangeChange ? onRangeChange("", "") : (setFrom(""), setTo("")); }}
            className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-danger/10 text-content-subtle hover:text-danger opacity-0 group-hover:opacity-100 transition-all shrink-0"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {/* Calendar Dropdown - Rendered via Portal */}
      {isOpen && createPortal(
        <div 
          ref={dropdownRef}
          style={{ 
            position: 'absolute', 
            top: coords.top, 
            left: coords.left,
            zIndex: 9999
          }}
          className="pb-1 flex bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Sidebar Shortcuts - Ultra Tighter */}
          <div className="w-16 border-r border-border/10 dark:border-white/5 py-2 flex flex-col gap-1 px-1 shrink-0 bg-surface-2/30 dark:bg-white/[0.02]">
            <div className="text-[7px] font-black text-content-subtle opacity-30 uppercase tracking-widest mb-1 px-1.5">Atajos</div>
            {[
              { id: "today", label: "Hoy" },
              { id: "yesterday", label: "Ayer" },
              { id: "7days", label: "7D" },
              { id: "month", label: "Mes" },
            ].map(s => (
              <button 
                key={s.id} 
                onClick={() => setShortcut(s.id)}
                className="w-full py-1 px-1 text-[8px] font-bold text-center text-content-subtle hover:text-brand-500 hover:bg-brand-500/10 rounded-md transition-all uppercase"
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Main Calendar Area - Ultra Compact */}
          <div className="p-2 w-[190px] min-h-[230px]">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-1 group/header">
                <button 
                  onClick={() => setMode(mode === "months" ? "days" : "months")}
                  className={`text-[11px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded transition-all ${mode === "months" ? "bg-brand-500 text-black px-2 shadow-lg shadow-brand-500/20" : "text-content dark:text-white hover:bg-surface-2 dark:hover:bg-white/5"}`}
                >
                  {monthName}
                </button>
                <button 
                  onClick={() => setMode(mode === "years" ? "days" : "years")}
                  className={`text-[11px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded transition-all ${mode === "years" ? "bg-brand-500 text-black px-2 shadow-lg shadow-brand-500/20" : "text-content-subtle opacity-40 hover:opacity-100 hover:bg-surface-2 dark:hover:bg-white/5"}`}
                >
                  {yearTitle}
                </button>
              </div>
              
              {mode === "days" && (
                <div className="flex gap-1">
                  <button onClick={() => changeMonth(-1)} className="p-1 rounded-md hover:bg-surface-2 dark:hover:bg-white/5 transition-colors">
                    <svg className="w-3.5 h-3.5 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <button onClick={() => changeMonth(1)} className="p-1 rounded-md hover:bg-surface-2 dark:hover:bg-white/5 transition-colors">
                    <svg className="w-3.5 h-3.5 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              )}
            </div>

            {/* Content: Days Grid */}
            {mode === "days" && (
              <>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {["L", "M", "X", "J", "V", "S", "D"].map(d => (
                    <div key={d} className="h-6 flex items-center justify-center text-[9px] font-black text-content-subtle opacity-30">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {calendarDays.map((d, i) => {
                    const selected = isSelected(d.date);
                    const ranged = isInRange(d.date);
                    const today = isToday(d.date);
                    
                    return (
                      <div 
                        key={i} 
                        onClick={() => handleDateClick(d.date)}
                        className={`
                          h-8 flex flex-col items-center justify-center text-[10px] font-black cursor-pointer rounded-md transition-all relative
                          ${!d.currentMonth ? "opacity-10 text-content-subtle" : "text-content dark:text-white/80 hover:bg-brand-500/10 hover:text-brand-500"}
                          ${selected ? "!bg-brand-500 !text-black shadow-lg shadow-brand-500/20" : ""}
                          ${ranged ? "bg-brand-500/10 text-brand-500 rounded-none after:absolute after:inset-0 after:bg-brand-500/5 transition-none" : ""}
                        `}
                      >
                        {d.date.getDate()}
                        {today && !selected && !ranged && (
                          <div className="w-1 h-1 bg-brand-500 rounded-full absolute bottom-1" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Content: Months Picker */}
            {mode === "months" && (
              <div className="grid grid-cols-3 gap-2">
                {months.map((m, i) => (
                  <button 
                    key={m} 
                    onClick={() => jumpToMonth(i)}
                    className={`py-3 text-[10px] font-black uppercase tracking-widest rounded-lg border transition-all
                      ${viewDate.getMonth() === i ? "bg-brand-500 text-black border-brand-500 shadow-lg" : "bg-surface-2 dark:bg-white/5 border-border/10 dark:border-white/5 text-content-subtle hover:text-brand-500 hover:border-brand-500/30"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            {/* Content: Years Picker */}
            {mode === "years" && (
              <div ref={yearPickerRef} className="grid grid-cols-3 gap-2 h-48 overflow-y-auto scrollbar-thin pr-1 custom-scrollbar">
                {(() => {
                  const currentYear = new Date().getFullYear();
                  const years = [];
                  for (let y = 2000; y <= currentYear + 20; y++) years.push(y);
                  return years.map(y => (
                    <button 
                      key={y} 
                      onClick={() => jumpToYear(y)}
                      className={`py-2 text-[10px] font-black uppercase tracking-widest rounded-lg border transition-all
                        ${viewDate.getFullYear() === y ? "selected-year bg-brand-500 text-black border-brand-500 shadow-lg font-black" : "bg-surface-2 dark:bg-white/5 border-border/10 dark:border-white/5 text-content-subtle hover:text-brand-500 hover:border-brand-500/30 font-bold"}`}
                    >
                      {y}
                    </button>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
