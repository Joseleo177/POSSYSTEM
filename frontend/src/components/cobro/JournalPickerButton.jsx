import { useState } from "react";
import { useApp } from "../../context/AppContext";
import ImmediatePayPicker from "./ImmediatePayPicker";
import MethodBankLogo from "./MethodBankLogo";

// Caja/diario elegido como botón que abre la botonera `ImmediatePayPicker` (método → banco →
// caja), en vez de un desplegable. Reemplaza a `CustomSelect` en cobro, ingresos, egresos,
// devoluciones, cobro conjunto y pagos a proveedores.
//
//   value        id del diario elegido (número o string), o "" si ninguno
//   journals     lista ya filtrada por el que lo usa (sucursal, compartidos…)
//   onSelect     (journal) => void   — objeto de diario elegido
//   onClear      () => void          — si viene, muestra "Sin diario" para desasignar
//   outflowOnly  recorta a métodos que permiten sacar dinero (egresos, vuelto, proveedores)
export default function JournalPickerButton({
    value,
    journals = [],
    onSelect,
    onClear = null,
    outflowOnly = false,
    methodPrompt,
    placeholder = "Seleccionar diario...",
    disabled = false,
    height = "h-10",
    boxClassName = "",
}) {
    const { activePaymentMethods } = useApp();
    const [open, setOpen] = useState(false);

    const selected = journals.find(j => String(j.id) === String(value)) || null;
    const method = selected
        ? (activePaymentMethods || []).find(m => m.code === selected.type)
        : null;

    return (
        <>
            <div className="flex flex-col gap-1">
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setOpen(true)}
                    className={`${height} w-full text-[11px] flex items-center justify-between gap-2 border px-3 rounded-md transition-all duration-200 bg-white dark:bg-[#12141a] border-border/80 dark:border-white/5 hover:border-brand-500/40 disabled:opacity-40 disabled:pointer-events-none ${boxClassName}`}
                >
                    <span className="flex items-center gap-2 min-w-0 flex-1">
                        {selected && <MethodBankLogo src={method?.image_url} size={22} rounded="rounded" />}
                        <span className={`truncate ${selected
                            ? "text-content dark:text-content-dark font-bold uppercase tracking-tight"
                            : "text-content-subtle/50 dark:text-content-dark-muted/30 font-medium"}`}>
                            {selected ? selected.name : placeholder}
                        </span>
                    </span>
                    <svg className="w-3.5 h-3.5 shrink-0 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                </button>

                {onClear && selected && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="self-start text-[9px] font-black uppercase tracking-widest text-content-subtle hover:text-danger transition-colors"
                    >
                        Quitar diario
                    </button>
                )}
            </div>

            {open && (
                <ImmediatePayPicker
                    journals={journals}
                    outflowOnly={outflowOnly}
                    methodPrompt={methodPrompt}
                    onClose={() => setOpen(false)}
                    onPick={(journal) => { onSelect(journal); setOpen(false); }}
                />
            )}
        </>
    );
}
