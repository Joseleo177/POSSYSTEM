import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Segmented from "../ui/Segmented";
import CustomSelect from "../ui/CustomSelect";
import Check from "../ui/Check";
import { Button } from "../ui/Button";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase } from "../../helpers";
import { printPieceLabels } from "../../helpers/printPieceLabels";
import {
    INPUT, Field, Prefijo, DimsInput, UnitSwitch, useMeasureUnit, toMm, fromMm, parseNum, fmtSize, errMsg,
} from "./shared";

// Tamaño de una pieza en la unidad del material, con los tres decimales de la existencia.
const sizeOf = (mode, w, l) => (mode === "length"
    ? (l > 0 ? Math.round(l) / 1000 : 0)
    : (w > 0 && l > 0 ? Math.round((w * l) / 1000) / 1000 : 0));

/**
 * Numerar piezas que NO llegan por una compra. Lo que se compra se numera solo al recibirse
 * en Compras; esto es para lo que ya estaba:
 *
 *   Carga inicial  piezas que había antes del sistema: se numeran y entran a la existencia.
 *                  Quien ya las numeraba a mano escribe su número (la #51 sigue siendo la #51).
 *   Existencia     material que ya está en el inventario sin número (una compra vieja, un
 *                  ajuste): solo se numera, si alcanza lo que hay sin numerar.
 */
export default function RegisterPiecesModal({ open, warehouses, materials, onClose, onSaved, onNewMaterial }) {
    const { notify, baseCurrency, printerWidth } = useApp();
    const [unit, setUnit] = useMeasureUnit();
    const [form, setForm] = useState({});
    const [free, setFree] = useState(null);
    const [print, setPrint] = useState(true);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const material = materials.find(m => String(m.id) === form.product_id);
    const mode = material?.piece_mode || "area";

    useEffect(() => {
        if (!open) return;
        const m = materials.length === 1 ? materials[0] : null;
        setForm({
            product_id: m ? String(m.id) : "",
            warehouse_id: warehouses.length === 1 ? String(warehouses[0].id) : "",
            origin: "carga_inicial",
            count: "1",
            w: m?.piece_width_mm ? fromMm(m.piece_width_mm, unit) : "",
            l: m ? fromMm(m.piece_length_mm, unit) : "",
            cost: "",
            first: "",
            reference: "",
        });
    }, [open]);

    // Al cambiar de material se toma su formato habitual.
    const pickMaterial = (id) => {
        const m = materials.find(x => String(x.id) === id);
        setForm(f => ({ ...f, product_id: id, w: m?.piece_width_mm ? fromMm(m.piece_width_mm, unit) : "", l: m ? fromMm(m.piece_length_mm, unit) : f.l }));
    };
    // Al cambiar la unidad, lo escrito se convierte en vez de reinterpretarse.
    const changeUnit = (u) => {
        const wm = toMm(form.w, unit), lm = toMm(form.l, unit);
        setForm(f => ({ ...f, w: wm > 0 ? fromMm(wm, u) : f.w, l: lm > 0 ? fromMm(lm, u) : f.l }));
        setUnit(u);
    };

    // Lo que hay sin numerar en ese almacén, para avisar antes de chocar con el servidor.
    useEffect(() => {
        if (!open || !form.product_id || !form.warehouse_id) { setFree(null); return; }
        api.factory.materials({ warehouse_id: form.warehouse_id })
            .then(r => setFree((r.data || []).find(m => String(m.id) === form.product_id)?.unnumbered ?? 0))
            .catch(() => setFree(null));
    }, [open, form.product_id, form.warehouse_id]);

    const wMm = toMm(form.w, unit), lMm = toMm(form.l, unit);
    const count = parseInt(form.count) || 0;
    const size = sizeOf(mode, wMm, lMm);
    const total = Math.round(size * count * 1000) / 1000;
    const falta = form.origin === "existencia" && free != null && total > free + 0.005;
    const inicial = form.origin === "carga_inicial";
    const first = inicial ? parseInt(form.first) || null : null;

    const save = async () => {
        if (!form.product_id) return notify("Elige el material", "err");
        if (!form.warehouse_id) return notify("Elige el almacén", "err");
        if (!(count >= 1)) return notify("Indica cuántas piezas son", "err");
        if (!(lMm > 0) || (mode === "area" && !(wMm > 0))) return notify(mode === "area" ? "Escribe el ancho y el largo" : "Escribe el largo", "err");
        const cost = form.cost.trim() === "" ? null : parseNum(form.cost);
        if (cost != null && !(cost >= 0)) return notify("El costo no es válido", "err");
        try {
            const r = await api.factory.registerPieces({
                product_id: parseInt(form.product_id),
                warehouse_id: parseInt(form.warehouse_id),
                origin: form.origin,
                count,
                width_mm: mode === "area" ? wMm : null,
                length_mm: lMm,
                cost_per_piece: cost,
                first_number: first,
                reference: form.reference.trim() || null,
            });
            notify(r.first === r.last ? `Pieza #${r.first} registrada` : `Piezas #${r.first} a #${r.last} registradas`);
            if (print) printPieceLabels(r.data.map(p => ({ ...p, size: parseFloat(p.size), product_name: material?.name, unit: material?.unit })), printerWidth);
            onSaved?.();
        } catch (e) { notify(errMsg(e), "err"); }
    };

    if (open && materials.length === 0) {
        return (
            <Modal open={open} onClose={onClose} title="Registrar piezas" width={440}>
                <div className="py-4 text-center">
                    <div className="text-[14px] font-semibold text-content dark:text-white">Primero crea un material</div>
                    <div className="text-[13px] text-content-subtle mt-1">Un producto del catálogo con control por piezas: la lámina, el tubo o el perfil que se corta.</div>
                    {onNewMaterial && <button onClick={onNewMaterial} className="btn-accent h-10 px-4 rounded-lg text-[13px] font-semibold mt-4">Crear material</button>}
                </div>
            </Modal>
        );
    }

    return (
        <Modal open={open} onClose={onClose} title="Registrar piezas" width={560}
            footer={
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none sm:mr-auto" onClick={() => setPrint(p => !p)}>
                        <Check checked={print} onChange={setPrint} title="Imprimir etiquetas" />
                        <span className="text-[13px] text-content dark:text-white">Imprimir etiquetas</span>
                    </label>
                    <div className="flex flex-col-reverse sm:flex-row gap-2">
                        <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                        <Button onClick={save} disabled={falta} className="h-12 sm:h-10 px-5">
                            {count > 1 ? `Registrar ${count} piezas` : "Registrar pieza"}
                        </Button>
                    </div>
                </div>
            }>
            <div className="space-y-4">
                <p className="text-[12px] text-content-subtle leading-relaxed">
                    Lo que compras se numera solo al recibirlo en Compras. Usa esto para las piezas que ya tenías.
                </p>
                <Field label="Qué vas a numerar">
                    <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={form.origin} onChange={v => set("origin", v)}
                        options={[{ key: "carga_inicial", label: "Carga inicial" }, { key: "existencia", label: "Existencia sin número" }]} />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Material">
                        <CustomSelect value={form.product_id} onChange={pickMaterial} placeholder="Elegir…"
                            options={materials.map(m => ({ value: String(m.id), label: toNameCase(m.name) }))} />
                    </Field>
                    <Field label="Almacén">
                        <CustomSelect value={form.warehouse_id} onChange={v => set("warehouse_id", v)} placeholder="Elegir…"
                            options={warehouses.map(x => ({ value: String(x.id), label: toNameCase(x.name) }))} />
                    </Field>
                </div>

                <Field label="Medidas de cada pieza" hint={size ? fmtSize(size, material?.unit) : null}>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="flex-1 min-w-0"><DimsInput mode={mode} w={form.w || ""} l={form.l || ""} onW={v => set("w", v)} onL={v => set("l", v)} unit={unit} /></div>
                        <UnitSwitch unit={unit} setUnit={changeUnit} className="self-start" />
                    </div>
                </Field>

                <div className={`grid grid-cols-2 gap-3 ${inicial ? "sm:grid-cols-3" : ""}`}>
                    <Field label="Cantidad de piezas">
                        <input value={form.count || ""} onChange={e => set("count", e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric"
                            className={`${INPUT} tabular-nums`} />
                    </Field>
                    {inicial && (
                        <Field label={count > 1 ? "Desde el número" : "Número"} hint="Opcional">
                            <div className="relative">
                                <Prefijo>#</Prefijo>
                                <input value={form.first || ""} onChange={e => set("first", e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric"
                                    placeholder="Siguiente" className={`${INPUT} pl-11 tabular-nums`} />
                            </div>
                        </Field>
                    )}
                    <Field label="Costo por pieza" hint="Opcional">
                        <div className="relative">
                            <Prefijo>{baseCurrency?.symbol || "Ref."}</Prefijo>
                            <input value={form.cost || ""} onChange={e => set("cost", e.target.value)} inputMode="decimal"
                                placeholder="Último costo" className={`${INPUT} pl-11 tabular-nums`} />
                        </div>
                    </Field>
                </div>

                <Field label="Referencia" hint="Opcional">
                    <input value={form.reference || ""} onChange={e => set("reference", e.target.value)} maxLength={80}
                        placeholder="Inventario inicial, guía…" className={INPUT} />
                </Field>

                {form.origin === "existencia" && free != null && (
                    <p className={`text-[12px] ${falta ? "text-red-600 dark:text-red-400" : "text-content-subtle"}`}>
                        {falta
                            ? `En ese almacén hay ${fmtSize(free, material?.unit)} sin numerar y estas piezas suman ${fmtSize(total, material?.unit)}.`
                            : `Sin numerar en ese almacén: ${fmtSize(free, material?.unit)}. Estas piezas suman ${fmtSize(total, material?.unit)}.`}
                    </p>
                )}
                {inicial && total > 0 && (
                    <p className="text-[12px] text-content-subtle">
                        {first ? (count > 1 ? `Se numeran del #${first} al #${first + count - 1}. ` : `Queda como la #${first}. `) : ""}
                        Entran {fmtSize(total, material?.unit)} al inventario de {toNameCase(material?.name || "este material")}.
                    </p>
                )}
            </div>
        </Modal>
    );
}
