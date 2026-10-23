import { useCallback, useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Segmented from "../ui/Segmented";
import { Button } from "../ui/Button";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase } from "../../helpers";
import { INPUT, Field, DimsInput, UnitSwitch, useMeasureUnit, toMm, fromMm, fmtSize, SearchPick, MODES, errMsg } from "./shared";

/**
 * Un material es un producto del catálogo con control por piezas: se compra en Compras, se
 * ve en Catálogo e Inventario como cualquier otro, y cada pieza se numera al entrar. Esta es
 * la vía rápida desde Fábrica; lo mismo se configura en la ficha del producto.
 *
 * `material`: null cerrado · {} nuevo · fila de Materiales para editar su nombre y formato.
 */
export default function MaterialModal({ material, onClose, onSaved }) {
    const { notify } = useApp();
    const [unit, setUnit] = useMeasureUnit();
    const [source, setSource] = useState("nuevo");
    const [mode, setMode] = useState("area");
    const [name, setName] = useState("");
    const [product, setProduct] = useState(null);
    const [w, setW] = useState("");
    const [l, setL] = useState("");
    const open = material != null;
    const editing = !!material?.id;

    useEffect(() => {
        if (!open) return;
        const m = material?.piece_mode || "area";
        setSource("nuevo");
        setMode(m);
        setProduct(null);
        setName(material?.name ? toNameCase(material.name) : "");
        setW(m === "area" ? fromMm(material?.piece_width_mm || 1220, unit) : "");
        setL(fromMm(material?.piece_length_mm || (m === "area" ? 2440 : 6000), unit));
    }, [open]);

    const changeUnit = (u) => {
        const wm = toMm(w, unit), lm = toMm(l, unit);
        if (wm > 0) setW(fromMm(wm, u));
        if (lm > 0) setL(fromMm(lm, u));
        setUnit(u);
    };
    const changeMode = (m) => {
        setMode(m);
        if (m === "area" && !w) setW(fromMm(1220, unit));
    };

    const searchProducts = useCallback(async (term) => {
        const r = await api.products.getAll({ search: term, is_combo: false, is_service: false, limit: 20 });
        return (r.data || []).filter(p => !p.piece_mode && !p.is_variant_parent);
    }, []);

    const wMm = toMm(w, unit), lMm = toMm(l, unit);
    const size = mode === "length"
        ? (lMm > 0 ? Math.round(lMm) / 1000 : 0)
        : (wMm > 0 && lMm > 0 ? Math.round((wMm * lMm) / 1000) / 1000 : 0);

    const save = async () => {
        if (!(lMm > 0) || (mode === "area" && !(wMm > 0))) return notify(mode === "area" ? "Escribe el formato: ancho y largo" : "Escribe el largo", "err");
        const body = { piece_mode: mode, piece_width_mm: mode === "area" ? wMm : null, piece_length_mm: lMm };
        if (editing) { body.product_id = material.id; body.name = name.trim(); }
        else if (source === "existente") {
            if (!product) return notify("Elige el producto del catálogo", "err");
            body.product_id = product.id;
        } else {
            if (!name.trim()) return notify("Escribe el nombre del material", "err");
            body.name = name.trim();
        }
        try {
            await api.factory.saveMaterial(body);
            notify(editing ? "Material actualizado" : "Material creado");
            onSaved?.();
        } catch (e) { notify(errMsg(e), "err"); }
    };

    return (
        <Modal open={open} onClose={onClose} title={editing ? "Editar material" : "Nuevo material"} width={520}
            footer={
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                    <Button onClick={save} className="h-12 sm:h-10 px-5">{editing ? "Guardar cambios" : "Crear material"}</Button>
                </div>
            }>
            <div className="space-y-4">
                {!editing && (
                    <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={source} onChange={setSource}
                        options={[{ key: "nuevo", label: "Material nuevo" }, { key: "existente", label: "Ya está en el catálogo" }]} />
                )}

                {editing || source === "nuevo" ? (
                    <Field label="Nombre">
                        <input value={name} onChange={e => setName(e.target.value)} maxLength={200} data-autofocus
                            placeholder="Lámina inox 304 cal. 18 brillante" className={INPUT} />
                    </Field>
                ) : (
                    <Field label="Producto">
                        <SearchPick searchFn={searchProducts} value={product} onChange={setProduct} placeholder="Buscar en el catálogo…" autoFocus
                            renderItem={p => (
                                <span className="flex items-center justify-between gap-3">
                                    <span className="truncate">{toNameCase(p.name)}</span>
                                    <span className="text-[11px] text-content-subtle shrink-0">{p.unit}</span>
                                </span>
                            )} />
                    </Field>
                )}

                <Field label="Cómo se mide" hint={MODES.find(m => m.key === mode)?.hint}>
                    <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={mode} onChange={changeMode}
                        options={MODES.map(m => ({ key: m.key, label: m.label }))} />
                </Field>

                <Field label="Formato habitual" hint={size ? fmtSize(size, mode === "area" ? "M2" : "METRO") : null}>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="flex-1 min-w-0"><DimsInput mode={mode} w={w} l={l} onW={setW} onL={setL} unit={unit} /></div>
                        <UnitSwitch unit={unit} setUnit={changeUnit} className="self-start" />
                    </div>
                </Field>

                <p className="text-[12px] text-content-subtle leading-relaxed">
                    Es un producto del catálogo: se compra en Compras y cada pieza que entra queda numerada.
                    La existencia se lleva en {mode === "area" ? "m²" : "metros"}. El formato solo prellena la compra:
                    cada pieza guarda sus propias medidas, porque según el proveedor llegan de otros tamaños.
                </p>
            </div>
        </Modal>
    );
}
