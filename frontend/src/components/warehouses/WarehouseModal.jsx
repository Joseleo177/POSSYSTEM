import Modal from "../ui/Modal";
import { Button } from "../ui/Button";

export default function WarehouseModal({ open, onClose, form, setForm, editId, loading, onSave }) {
    return (
        <Modal open={open} onClose={onClose} title={editId ? "Editar Almacén" : "Nuevo Almacén"} width={480}>
            <div className="mb-3">
                <div className="label mb-1">Nombre *</div>
                <input
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="ej. Depósito Central"
                    className="input"
                    autoFocus
                />
            </div>
            <div className="mb-3">
                <div className="label mb-1">Descripción</div>
                <input
                    value={form.description}
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="ej. Almacén principal de la tienda"
                    className="input"
                />
            </div>
            {editId && (
                <div className="mb-4">
                    <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                        <input
                            type="checkbox"
                            checked={form.active ?? true}
                            onChange={e => setForm(p => ({ ...p, active: e.target.checked }))}
                        />
                        <span className="text-content-muted dark:text-content-dark-muted">Activo</span>
                    </label>
                </div>
            )}
            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border/10">
                <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                <Button variant="primary" onClick={onSave} disabled={loading}>
                    {loading ? "Guardando..." : editId ? "Guardar cambios" : "Crear almacén"}
                </Button>
            </div>
        </Modal>
    );
}
