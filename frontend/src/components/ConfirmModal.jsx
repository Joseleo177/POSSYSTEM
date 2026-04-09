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
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
 </svg>
 ),
 btnClass: "bg-danger text-white hover:bg-danger/90 border-transparent shadow-lg shadow-danger/20",
 iconContainer: "bg-danger/10 border border-danger/20",
 titleClass: "text-content dark:text-white",
 },
 warning: {
 icon: (
 <svg className="w-8 h-8 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
 </svg>
 ),
 btnClass: "bg-warning text-white hover:bg-warning/90 border-transparent shadow-lg shadow-warning/20",
 iconContainer: "bg-warning/10 border border-warning/20",
 titleClass: "text-content dark:text-white",
 },
 primary: {
 icon: (
 <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
 </svg>
 ),
 btnClass: "bg-brand-500 text-brand-900 border-transparent hover:bg-brand-600 shadow-xl shadow-brand-500/20",
 iconContainer: "bg-brand-500/10 border border-brand-500/20",
 titleClass: "text-content dark:text-white",
 },
 info: {
 icon: (
 <svg className="w-8 h-8 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
 </svg>
 ),
 btnClass: "bg-blue-500 text-white hover:bg-blue-600 border-transparent shadow-lg shadow-blue-500/20",
 iconContainer: "bg-blue-500/10 border border-blue-500/20",
 titleClass: "text-content dark:text-white",
 }
 };

 const config = typeConfig[type] || typeConfig.danger;

 return (
 <div className="fixed inset-0 z-[1050] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
 <div className="w-full max-w-[400px] bg-white dark:bg-surface-dark-2 border border-border dark:border-white/5 rounded-[32px] p-5 shadow-2xl relative overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ease-out">
 {/* Glow de fondo */}
 <div className="absolute -top-20 -right-20 w-48 h-48 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />
 
 <div className="flex flex-col items-center text-center relative z-10">
 <div className={`mb-4 w-16 h-16 rounded-[24px] flex items-center justify-center shadow-inner ${config.iconContainer}`}>
 {config.icon}
 </div>

 <h3 className={`text-xl font-black tracking-wide mb-2 uppercase font-display ${config.titleClass}`}>
 {title}
 </h3>

 <p className="text-sm text-content-muted dark:text-content-dark-muted leading-relaxed mb-5 font-medium">
 {message}
 </p>

 <div className="grid grid-cols-2 w-full gap-3">
 <button
 onClick={onCancel}
 className=" bg-surface-2 dark:bg-white/5 text-content-subtle dark:text-content-dark-muted rounded-2xl w-full font-black text-[11px] uppercase tracking-wide hover:bg-surface-3 dark:hover:bg-white/10 transition-all active:scale-95 border-none"
 >
 {cancelText}
 </button>
 <button
 onClick={onConfirm}
 className={` rounded-2xl w-full text-[11px] font-black uppercase tracking-wide transition-all active:scale-95 ${config.btnClass}`}
 >
 {confirmText}
 </button>
 </div>
 </div>
 </div>
 </div>
 );
}
