import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import { isIntegerUnit } from "../../helpers/unitFormatter";

export default function EditStockModal({ editStockModal, onClose, editStockValue, setEditStockValue, submitEditStock }) {
    const intUnit = isIntegerUnit(editStockModal?.unit);

    // En unidades contables (UNIDAD) no se admiten decimales.
    const handleChange = (val) => {
        if (intUnit) val = String(val).replace(/[.,].*$/, "");
        setEditStockValue(val);
    };

    return (
        <Modal open={!!editStockModal} onClose={onClose} title="Editar Stock" width={340}>
            <form onSubmit={submitEditStock}>
                <p className="text-xs text-content-muted dark:text-content-dark-muted mb-3">
                    Producto: <b className="text-content dark:text-content-dark">{editStockModal?.product_name}</b>
                </p>
                <div className="mb-4">
                    <label className="label mb-1">
                        Nueva cantidad *
                        {editStockModal?.unit && <span className="ml-1 opacity-40 font-bold">({editStockModal.unit})</span>}
                    </label>
                    <input
                        autoFocus
                        type="number"
                        step={intUnit ? "1" : "0.001"}
                        min="0"
                        value={editStockValue}
                        onChange={e => handleChange(e.target.value)}
                        required
                        className="input w-full"
                    />
                </div>
                <div className="flex justify-end gap-2.5 mt-2">
                    <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" variant="primary">Guardar</Button>
                </div>
            </form>
        </Modal>
    );
}
