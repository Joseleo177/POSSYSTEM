import { useEffect } from "react";
import { createPortal } from "react-dom";
import ProductKardex from "./ProductKardex";
import { ICON } from "./movementMeta";

// Historial de un producto sin salir de la pantalla en la que se está: se abre desde Stock y
// desde Movimiento manual. Ir a la pestaña Movimientos obligaría a dejar la sesión de ajustes
// a medias. En el teléfono ocupa la pantalla entera; en escritorio es una ventana ancha.
export default function ProductMovementsModal({ productId, warehouseId = "", onClose }) {
    useEffect(() => {
        if (!productId) return;
        const onKey = e => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [productId, onClose]);

    if (!productId) return null;

    return createPortal(
        <>
            <div className="fixed inset-0 z-[900] bg-black/40 dark:bg-black/60 backdrop-blur-[2px] overlay-in" onClick={onClose} />
            <div className="fixed inset-0 z-[910] flex items-stretch lg:items-center justify-center lg:p-6 pointer-events-none">
                <div
                    role="dialog"
                    aria-modal="true"
                    className="pointer-events-auto w-full lg:max-w-5xl h-full lg:h-[88vh] bg-white dark:bg-surface-dark-2 lg:border border-black/[0.06] dark:border-white/[0.08] lg:rounded-xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.25)] flex flex-col overflow-hidden modal-in safe-area-bottom"
                    onClick={e => e.stopPropagation()}
                >
                    <ProductKardex
                        productId={productId}
                        warehouseId={warehouseId}
                        actions={
                            <button onClick={onClose} className="row-icon -mr-2 -mt-1" title="Cerrar" aria-label="Cerrar">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICON.close} /></svg>
                            </button>
                        }
                    />
                </div>
            </div>
        </>,
        document.body
    );
}
