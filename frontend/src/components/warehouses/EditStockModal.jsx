import { useRef, useEffect, useState } from "react";
import { Spinner } from "../ui/Spinner";
import Modal from "../ui/Modal";
import { resolveImageUrl, imgRetryOnError, toNameCase } from "../../helpers";
import { isIntegerUnit, fmtQtyUnit } from "../../helpers/unitFormatter";

// Ajuste de existencia de un producto. Lo que importa al cuadrar inventario no es el número
// nuevo sino la diferencia contra lo registrado: cuánto entra o sale con este ajuste.
//
// Color = señal: la existencia actual va en tinta (antes era un semáforo rojo/naranja/verde
// que gritaba aunque no hubiera nada que hacer), y solo la diferencia lleva tono — ámbar si
// salen unidades, que es una pérdida a explicar.

const FORM_ID = "form-ajuste-existencia";
const MENOS = "M20 12H4";
const MAS = "M12 4v16m8-8H4";

export default function EditStockModal({ editStockModal, onClose, editStockValue, setEditStockValue, submitEditStock }) {
    const inputRef = useRef(null);
    // Bloquea el botón mientras guarda: un segundo toque mandaba el mismo ajuste dos veces.
    const [saving, setSaving] = useState(false);
    const intUnit = isIntegerUnit(editStockModal?.unit);

    useEffect(() => {
        if (editStockModal) {
            requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            });
        }
    }, [editStockModal]);

    if (!editStockModal) return null;

    const current = parseFloat(editStockModal.qty) || 0;
    const parsed = parseFloat(String(editStockValue).replace(",", "."));
    const next = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    const diff = parseFloat((next - current).toFixed(3));
    const qty = (n) => fmtQtyUnit(n, editStockModal.unit).toLowerCase();
    const unidad = qty(next).replace(/^[\d.,\s]+/, "") || "unidades";

    // La coma se normaliza a punto al guardar el valor: submitEditStock hace parseFloat
    // directo, y "6,5" se habría truncado a 6. En unidades contables no hay decimales.
    const handleChange = (val) => {
        let v = String(val).replace(/[^0-9.,]/g, "").replace(",", ".");
        if (intUnit) v = v.replace(/\..*$/, "");
        else {
            const parts = v.split(".");
            if (parts.length > 2) return;
            if (parts[1]?.length > 3) v = `${parts[0]}.${parts[1].slice(0, 3)}`;
        }
        setEditStockValue(v);
    };

    const enviar = async (e) => {
        e.preventDefault();
        if (saving || diff === 0) return;
        setSaving(true);
        try { await submitEditStock(e); } finally { setSaving(false); }
    };

    const adjust = (amount) => {
        let n = Math.max(0, next + amount);
        if (intUnit) n = Math.floor(n);
        setEditStockValue(String(parseFloat(n.toFixed(3))));
    };

    // Acciones al pie, fuera de la zona que se desplaza. El botón envía el formulario por su
    // id: el pie del Modal vive fuera del <form>.
    const pie = (
        <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-outline h-11 px-5 rounded-lg text-[13px] font-medium">
                Cancelar
            </button>
            <button type="submit" form={FORM_ID} disabled={diff === 0 || saving}
                className="btn-accent flex-1 h-11 rounded-lg text-[14px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition">
                {saving && <Spinner />}
                {diff === 0 ? "Sin cambios" : saving ? "Guardando…" : "Guardar existencia"}
            </button>
        </div>
    );

    const btnPaso = "w-12 h-12 shrink-0 rounded-xl border border-border dark:border-white/15 bg-white dark:bg-white/[0.04] text-content dark:text-white flex items-center justify-center hover:bg-surface-2 dark:hover:bg-white/[0.08] active:scale-95 transition disabled:opacity-40";

    return (
        <Modal open={!!editStockModal} onClose={onClose} title="Ajustar existencia" width={440} footer={pie}>
            <form id={FORM_ID} onSubmit={enviar} className="space-y-5">

                {/* Producto */}
                <div className="flex gap-3.5 items-center">
                    <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-surface-2 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.06] relative">
                        {editStockModal.image_url ? (
                            <img src={resolveImageUrl(editStockModal.image_url)} alt="" onError={imgRetryOnError}
                                className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-[18px] font-semibold text-content-subtle/50">
                                {editStockModal.product_name?.charAt(0)}
                            </div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-content dark:text-white leading-snug line-clamp-2">
                            {toNameCase(editStockModal.product_name)}
                        </p>
                        <p className="text-[12px] text-content-subtle truncate">
                            {[toNameCase(editStockModal.category_name), `Hay ${qty(current)}`].filter(Boolean).join(" · ")}
                        </p>
                    </div>
                </div>

                {/* Existencia nueva */}
                <div>
                    <label htmlFor="ajuste-cantidad" className="block text-[12px] font-medium text-content-subtle mb-1.5">
                        Existencia real (lo que contaste)
                    </label>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={() => adjust(-1)} disabled={next <= 0} aria-label="Restar uno" className={btnPaso}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={MENOS} /></svg>
                        </button>
                        <div className="flex-1 relative">
                            <input
                                id="ajuste-cantidad"
                                ref={inputRef}
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                value={editStockValue}
                                onChange={e => handleChange(e.target.value)}
                                onFocus={e => e.target.select()}
                                placeholder="0"
                                className="w-full h-12 rounded-xl border border-border dark:border-white/15 bg-white dark:bg-white/[0.04] text-center text-[24px] font-bold tracking-tight tabular-nums text-content dark:text-white placeholder:text-content-subtle/40 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition-colors"
                            />
                        </div>
                        <button type="button" onClick={() => adjust(1)} aria-label="Sumar uno" className={btnPaso}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={MAS} /></svg>
                        </button>
                    </div>
                    <p className="mt-1.5 text-center text-[12px] text-content-subtle">
                        En {unidad}{intUnit ? "" : " · hasta 3 decimales"}
                    </p>
                </div>

                {/* Diferencia contra lo registrado: evita restar de cabeza para saber cuánto
                    sobra o falta respecto al conteo físico. */}
                <div className="rounded-xl bg-surface-2 dark:bg-white/[0.04] px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[12px] text-content-subtle">
                            {diff === 0 ? "Sin diferencia" : diff > 0 ? "Entran al inventario" : "Salen del inventario"}
                        </p>
                        <p className="text-[13px] font-medium text-content-muted dark:text-white/70 tabular-nums">
                            {qty(current)} <span className="text-content-subtle/60">→</span> {qty(next)}
                        </p>
                    </div>
                    <span className={`text-[22px] font-bold tracking-tight tabular-nums ${
                        diff === 0 ? "text-content-subtle" : diff > 0 ? "text-content dark:text-white" : "text-amber-700 dark:text-amber-400"}`}>
                        {diff === 0 ? "0" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)}`}
                    </span>
                </div>
            </form>
        </Modal>
    );
}
