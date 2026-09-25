import { useState, useRef, useEffect } from "react";
import Modal from "./Modal";
import { Spinner } from "./Spinner";

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  type = "danger",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  loading = false,
}) {
  // Igual que el Button: si onConfirm es async (eliminar, anular…), se bloquean los dos
  // botones y el de confirmar muestra el spinner hasta que el servidor responde. Un segundo
  // clic sobre "Eliminar" ya no manda otra petición.
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const handleConfirm = (e) => {
    if (runningRef.current || !onConfirm) return;
    const result = onConfirm(e);
    if (!result || typeof result.then !== "function") return;
    runningRef.current = true;
    setRunning(true);
    Promise.resolve(result)
      .catch(err => console.error(err))
      .finally(() => {
        runningRef.current = false;
        if (mounted.current) setRunning(false);
      });
  };
  const busy = loading || running;

  const cfg = {
    danger:  { btn: "bg-danger text-white hover:brightness-110 shadow-lg shadow-danger/20" },
    warning: { btn: "bg-warning text-white hover:brightness-110 shadow-lg shadow-warning/20" },
    primary: { btn: "bg-brand-500 text-black hover:brightness-110 shadow-lg shadow-brand-500/20" },
    info:    { btn: "bg-info text-white hover:brightness-110 shadow-lg shadow-info/20" },
  };
  const c = cfg[type] || cfg.danger;

  return (
    <Modal open={isOpen} onClose={busy ? () => {} : onCancel} title={title} width={380}>
      <div className="flex flex-col gap-5">
        <p className="text-[13px] text-content-subtle dark:text-white/50 leading-relaxed">
          {message}
        </p>
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 h-10 rounded-xl border border-border/30 dark:border-white/10 text-[11px] font-black uppercase tracking-widest text-content-subtle dark:text-white/40 hover:border-border dark:hover:border-white/20 hover:text-content dark:hover:text-white transition-all active:scale-95 disabled:opacity-40"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            aria-busy={busy || undefined}
            className={`flex-[2] h-10 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2 ${c.btn}`}
          >
            {busy && <Spinner />}
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
