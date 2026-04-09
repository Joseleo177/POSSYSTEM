import { useEffect } from "react";

export default function Modal({ open, onClose, title, children, width = 560 }) {
 useEffect(() => {
 if (!open) return;
 const onKey = (e) => { if (e.key === "Escape") onClose(); };
 window.addEventListener("keydown", onKey);
 return () => window.removeEventListener("keydown", onKey);
 }, [open, onClose]);

 if (!open) return null;

 return (
  <div onClick={onClose}
  className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-5 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
  <div onClick={e => e.stopPropagation()}
  className="bg-white dark:bg-surface-dark-2 border border-border dark:border-white/5 rounded-[24px] shadow-2xl w-full relative animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ease-out flex flex-col max-h-[90vh]"
  style={{ maxWidth: width }}>

  {/* Header */}
  <div className="flex shrink-0 items-center justify-between px-5 py-4 border-b border-border/40 dark:border-white/5 bg-white/80 dark:bg-surface-dark-2/80 backdrop-blur-xl z-20 rounded-t-[24px]">
 <h2 className="text-sm font-black text-content dark:text-content-dark tracking-wide uppercase">
 {title}
 </h2>
 <button onClick={onClose}
 className="w-8 h-8 flex items-center justify-center rounded-lg text-content-subtle hover:text-danger hover:bg-danger/10 transition-all active:scale-90">
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
 </svg>
 </button>
 </div>

  {/* Body */}
  <div className="p-5 flex-1 min-h-0 overflow-y-auto">
  {children}
  </div>
  </div>
  </div>
 );
}
