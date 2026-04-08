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
      className="fixed inset-0 z-[1000] overflow-y-auto bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="flex min-h-[100vh] items-center justify-center p-4 sm:p-6 lg:p-8">
        <div onClick={e => e.stopPropagation()}
          className="bg-white dark:bg-surface-dark-2 border border-border dark:border-white/5 rounded-[24px] shadow-2xl w-full relative animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ease-out my-4 sm:my-8"
          style={{ maxWidth: width }}>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-border/40 dark:border-white/5 sticky top-0 bg-white/80 dark:bg-surface-dark-2/80 backdrop-blur-xl z-20 rounded-t-[24px]">
            <h2 className="text-sm font-black text-content dark:text-content-dark tracking-widest uppercase">
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
          <div className="p-5 sm:p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
