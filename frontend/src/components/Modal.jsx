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
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <div onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-surface-dark-2 border border-border dark:border-white/5 rounded-[32px] shadow-2xl w-full overflow-y-auto animate-in zoom-in-95 slide-in-from-bottom-4 duration-400 ease-out"
        style={{ maxWidth: width, maxHeight: "92vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-border/40 dark:border-white/5 sticky top-0 bg-white/80 dark:bg-surface-dark-2/80 backdrop-blur-xl z-20">
          <h2 className="text-xl font-black text-content dark:text-content-dark tracking-tight uppercase font-display">
            {title}
          </h2>
          <button onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full text-content-subtle hover:text-danger hover:bg-danger/10 transition-all active:scale-90">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
