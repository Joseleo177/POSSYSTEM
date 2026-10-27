import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { resolveImageUrl, imgRetryOnError } from "../../helpers";
import AddonPicker, { faltante, precioExtras } from "../mesas/AddonPicker";

// Adicionales de un plato en la caja: se abre al agregar un plato que los tiene (desde la
// grilla, el lector o el modal de cantidad, ver addToCart). Mismo selector que el mesonero y
// el catálogo; los precios en la moneda que la caja tiene en pantalla. El plato no entra al
// carrito sin lo obligatorio (el término, el contorno).
export default function PosAddonModal({ pick, warehouseId, onClose, onConfirm, fmtDisplay, notify }) {
    const product = pick?.product;
    const [groups, setGroups] = useState(null);
    const [opciones, setOpciones] = useState([]);
    const [nota, setNota] = useState("");
    const [qty, setQty] = useState(1);

    useEffect(() => {
        if (!product) return;
        let vivo = true;
        setGroups(null); setOpciones([]); setNota("");
        setQty(Math.max(1, Math.floor(parseFloat(pick.qty) || 1)));
        api.addons.forProduct(product.id, { warehouse_id: warehouseId || "" })
            .then(r => { if (vivo) setGroups(r.data || []); })
            .catch(e => { if (vivo) { notify?.(e.message || "No se pudieron cargar los adicionales", "err"); onClose(); } });
        return () => { vivo = false; };
    }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!product) return null;

    const falta = faltante(groups, opciones);
    // Un grupo obligatorio con todo agotado: el plato no se puede vender ahora.
    const imposible = (groups || []).find(g => g.min_select > 0 && g.options.filter(o => !o.agotado).length < g.min_select);
    const unidad = (Math.round((parseFloat(product.price) || 0) * 100) / 100) + precioExtras(opciones);

    const confirmar = () => {
        if (falta || imposible) return;
        if (onConfirm(product, qty, nota, opciones) !== false) onClose();
    };

    // Cantidad y botón en el pie fijo del modal: con varios grupos la lista se desplaza, y el
    // cajero no tiene que ir a buscar el botón al fondo.
    const pie = (
        <div className="flex items-center gap-3 w-full">
            <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Quitar uno"
                    className="w-11 h-11 rounded-lg btn-outline text-[18px] font-semibold disabled:opacity-40">−</button>
                <span className="w-9 text-center text-[16px] font-bold text-content dark:text-white tabular-nums">{qty}</span>
                <button type="button" onClick={() => setQty(q => q + 1)} aria-label="Sumar uno"
                    className="w-11 h-11 rounded-lg btn-outline text-[18px] font-semibold">+</button>
            </div>
            <button type="button" onClick={confirmar} disabled={!groups || !!falta || !!imposible}
                className="btn-accent flex-1 h-11 rounded-lg text-[14px] font-semibold disabled:opacity-60 truncate px-3">
                {imposible ? "No disponible" : falta ? `Elige ${falta.name.toLowerCase()}` : `Agregar · ${fmtDisplay(unidad * qty)}`}
            </button>
        </div>
    );

    return (
        <Modal open onClose={onClose} title={product.name} width={540} footer={pie}>
            <div className="space-y-5">
                <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-surface-2 dark:bg-white/[0.05] shrink-0">
                        {product.image_url && <img src={resolveImageUrl(product.image_url)} alt="" onError={imgRetryOnError} className="w-full h-full object-cover" />}
                    </div>
                    <div className="min-w-0">
                        {product.short_description && <p className="text-[13px] text-content-subtle leading-snug">{product.short_description}</p>}
                        <div className="text-[18px] font-bold tracking-tight text-content dark:text-white tabular-nums mt-0.5">{fmtDisplay(product.price)}</div>
                    </div>
                </div>

                {!groups ? (
                    <div className="py-6 flex justify-center"><Spinner /></div>
                ) : (
                    <AddonPicker groups={groups} value={opciones} onChange={setOpciones} fmtPrice={fmtDisplay} />
                )}

                {imposible && (
                    <p className="text-[13px] text-red-600 dark:text-red-400" style={{ boxShadow: "inset 3px 0 0 #ef4444", paddingLeft: 10 }}>
                        No queda ninguna opción de «{imposible.name}»: este plato no se puede vender ahora.
                    </p>
                )}

                <label className="block space-y-1">
                    <span className="text-[12px] font-medium text-content-subtle">Nota para la cocina <span className="font-normal">· opcional</span></span>
                    <input value={nota} onChange={e => setNota(e.target.value)} maxLength={200} autoComplete="off" placeholder="Bien caliente, para llevar…"
                        onKeyDown={e => { if (e.key === "Enter") confirmar(); }}
                        className="w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white placeholder:text-content-subtle/60 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                </label>
            </div>
        </Modal>
    );
}
