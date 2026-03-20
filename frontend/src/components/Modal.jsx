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
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-xl shadow-card-lg w-full overflow-y-auto"
        style={{ maxWidth: width, maxHeight: "90vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border dark:border-border-dark sticky top-0 bg-white dark:bg-surface-dark-2 z-10">
          <h2 className="text-base font-semibold text-content dark:text-content-dark tracking-tight">
            {title}
          </h2>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-content-muted dark:text-content-dark-muted hover:text-danger hover:bg-danger/10 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
