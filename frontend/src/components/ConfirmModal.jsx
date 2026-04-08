import React from "react";

/**
 * ConfirmModal - Un componente de confirmación premium y reutilizable.
 * 
 * @param {boolean} isOpen - Controla la visibilidad del modal.
 * @param {string} title - El título del modal.
 * @param {string} message - El mensaje descriptivo.
 * @param {function} onConfirm - Función a ejecutar al confirmar.
 * @param {function} onCancel - Función a ejecutar al cancelar.
 * @param {string} type - Tipo de modal: 'danger' (rojo), 'warning' (amarillo), 'info' (azul).
 * @param {string} confirmText - Texto del botón de confirmación.
 * @param {string} cancelText - Texto del botón de cancelación.
 */
export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  type = "danger",
  confirmText = "Confirmar",
  cancelText = "Cancelar"
}) {
  if (!isOpen) return null;

  const typeConfig = {
    danger: {
      icon: (
        <svg className="w-8 h-8 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      btnClass: "btn-danger",
      titleClass: "text-content dark:text-content-dark",
    },
    warning: {
      icon: (
        <svg className="w-8 h-8 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      btnClass: "btn-warning",
      titleClass: "text-content dark:text-content-dark",
    },
    info: {
      icon: (
        <svg className="w-8 h-8 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      btnClass: "btn-primary",
      titleClass: "text-content dark:text-content-dark",
    }
  };

  const config = typeConfig[type] || typeConfig.danger;

  return (
    <div className="fixed inset-0 z-[1050] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-[360px] bg-white dark:bg-surface-dark-2 border border-border dark:border-white/5 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ease-out">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 p-3 rounded-xl bg-surface-2 dark:bg-white/5 shadow-inner">
            {config.icon}
          </div>

          <h3 className={`text-base font-black tracking-tight mb-2 uppercase ${config.titleClass}`}>
            {title}
          </h3>

          <p className="text-sm text-content-muted dark:text-content-dark-muted leading-relaxed mb-5 font-medium opacity-80">
            {message}
          </p>

          <div className="flex flex-col w-full gap-2">
            <button
              onClick={onConfirm}
              className={`btn-md !rounded-xl w-full text-[11px] font-black uppercase tracking-[3px] shadow transition-all active:scale-95 ${config.btnClass}`}
            >
              {confirmText}
            </button>
            <button
              onClick={onCancel}
              className="btn-secondary !bg-surface-2 dark:!bg-white/5 text-content dark:text-content-dark-muted !rounded-xl w-full font-black text-[11px] uppercase tracking-[3px] hover:!bg-surface-3 dark:hover:!bg-white/10 transition-all active:scale-95 border-none"
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
