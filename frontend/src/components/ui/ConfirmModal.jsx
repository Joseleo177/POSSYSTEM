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

  // Rojo solo si la acción destruye algo; el resto confirma en tinta, como cualquier botón
  // principal. El ámbar pasa a texto negro: el blanco sobre ámbar no se leía.
  const cfg = {
    danger:  { btn: "bg-red-600 text-white hover:bg-red-700" },
    warning: { btn: "bg-amber-500 text-black hover:bg-amber-400" },
    primary: { btn: "btn-accent" },
    info:    { btn: "btn-accent" },
  };
  const c = cfg[type] || cfg.danger;

  return (
    <Modal open={isOpen} onClose={busy ? () => {} : onCancel} title={title} width={420}>
      <div className="flex flex-col gap-6">
        <p className="text-[14px] text-content-muted dark:text-white/65 leading-relaxed">
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="h-9 px-4 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-transparent text-[13px] font-semibold text-content dark:text-white/80 hover:bg-surface-2 dark:hover:bg-white/5 transition-colors active:scale-[0.98] disabled:opacity-40"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            aria-busy={busy || undefined}
            className={`h-9 px-4 rounded-lg text-[13px] font-semibold transition-colors active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2 ${c.btn}`}
          >
            {busy && <Spinner />}
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
