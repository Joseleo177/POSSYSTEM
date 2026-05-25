import Modal from "./Modal";

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  type = "danger",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
}) {
  const cfg = {
    danger:  { btn: "bg-danger text-white hover:brightness-110 shadow-lg shadow-danger/20" },
    warning: { btn: "bg-warning text-white hover:brightness-110 shadow-lg shadow-warning/20" },
    primary: { btn: "bg-brand-500 text-black hover:brightness-110 shadow-lg shadow-brand-500/20" },
    info:    { btn: "bg-info text-white hover:brightness-110 shadow-lg shadow-info/20" },
  };
  const c = cfg[type] || cfg.danger;

  return (
    <Modal open={isOpen} onClose={onCancel} title={title} width={380}>
      <div className="flex flex-col gap-5">
        <p className="text-[13px] text-content-subtle dark:text-white/50 leading-relaxed">
          {message}
        </p>
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 h-10 rounded-xl border border-border/30 dark:border-white/10 text-[11px] font-black uppercase tracking-widest text-content-subtle dark:text-white/40 hover:border-border dark:hover:border-white/20 hover:text-content dark:hover:text-white transition-all active:scale-95"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-[2] h-10 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 ${c.btn}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
