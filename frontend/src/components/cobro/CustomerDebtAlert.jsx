import Modal from "../ui/Modal";

/**
 * Aviso al elegir un cliente que arrastra facturas sin cobrar.
 * Es informativo a propósito: la caja debe poder venderle igual, solo que sabiéndolo.
 */
export default function CustomerDebtAlert({ alert, onClose, fmt, convertToDisplay, currSym, baseCurrency }) {
  if (!alert) return null;

  const baseSym = baseCurrency?.symbol || "Ref.";
  const display = fmt(convertToDisplay(alert.debt), currSym);
  // Con la caja en divisas el importe convertido y el de la deuda coinciden; repetirlo
  // debajo solo ensucia el aviso.
  const showBase = display !== fmt(alert.debt, baseSym);

  return (
    <Modal open={!!alert} onClose={onClose} title="Cuentas pendientes" width={400}>
      <div className="flex flex-col items-center text-center gap-5">
        <div className="w-16 h-16 rounded-3xl bg-danger/10 text-danger flex items-center justify-center">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>

        <div className="flex flex-col gap-1">
          <div className="text-[13px] font-black uppercase tracking-widest text-danger">Tiene cuentas pendientes</div>
          <div className="text-sm font-bold text-content dark:text-white truncate max-w-[300px]">{alert.name}</div>
        </div>

        <div className="w-full rounded-2xl bg-surface-2 dark:bg-white/5 border border-black/5 dark:border-white/5 py-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-1">Saldo por cobrar</div>
          <div className="text-2xl font-black text-danger tabular-nums">{display}</div>
          {showBase && (
            <div className="text-[11px] font-bold text-content-subtle tabular-nums mt-0.5">{fmt(alert.debt, baseSym)}</div>
          )}
        </div>

        <p className="text-[12px] text-content-subtle dark:text-white/50 leading-relaxed">
          Puedes continuar con la venta normalmente. El saldo anterior no se cobra aquí.
        </p>

        <button
          autoFocus
          onClick={onClose}
          className="w-full h-11 rounded-xl bg-brand-500 text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 transition-all active:scale-95"
        >
          Continuar con la venta
        </button>
      </div>
    </Modal>
  );
}
