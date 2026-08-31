import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import CustomSelect from "../ui/CustomSelect";

// Interruptor con el mismo trato que los de ProductModal: tarjeta con título, explicación y
// el switch a la derecha. Antes "Activo" era una casilla suelta al lado de una tarjeta, y la
// diferencia de peso visual hacía parecer que una opción importaba y la otra no.
function Toggle({ checked, onChange, title, description, tone = "brand" }) {
    const activo = {
        brand: "bg-brand-50/50 border-brand-200 dark:bg-brand-500/10 dark:border-brand-500/20",
        warning: "bg-warning/5 border-warning/25",
    }[tone];
    const titulo = {
        brand: "text-brand-600 dark:text-brand-400",
        warning: "text-warning",
    }[tone];

    return (
        <label
            className={`p-3 rounded-lg border transition-all flex items-center justify-between gap-3 cursor-pointer ${checked ? activo : "bg-surface-2 dark:bg-white/5 border-border/40 dark:border-white/5"
                }`}
        >
            <div className="min-w-0">
                <div className={`text-xs font-bold ${checked ? titulo : "text-content dark:text-content-dark"}`}>
                    {title}
                </div>
                <div className="text-[10px] text-content-subtle dark:text-content-dark-muted mt-0.5 leading-relaxed">
                    {description}
                </div>
            </div>
            <div className="relative inline-flex items-center shrink-0">
                <input type="checkbox" className="sr-only peer" checked={checked} onChange={e => onChange(e.target.checked)} />
                <div className={`w-9 h-5 bg-border/50 dark:bg-white/10 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white ${tone === "warning" ? "peer-checked:bg-warning" : "peer-checked:bg-brand-500"
                    }`} />
            </div>
        </label>
    );
}

export default function WarehouseModal({ open, onClose, form, setForm, editId, loading, onSave, parentOptions = [] }) {
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

            <div className="space-y-2 mb-4">
                {/* Tienda o depósito. Un depósito guarda mercancía, se transfiere y entra en
                    los reportes, pero no atiende público: no aparece en la caja, no factura y
                    no admite series ni cajas propias. */}
                <Toggle
                    tone="warning"
                    checked={form.sells === false}
                    onChange={v => setForm(p => ({ ...p, sells: !v, ...(v ? {} : { parent_warehouse_id: null }) }))}
                    title="Solo depósito"
                    description={form.sells === false
                        ? "No aparece en la caja ni emite facturas. Sigue recibiendo compras y transferencias."
                        : "Márcalo si este almacén no atiende público: dejará de aparecer en la caja y no podrá facturar."}
                />

                {/* Selector de almacén padre: solo visible cuando es depósito. */}
                {form.sells === false && parentOptions.length > 0 && (
                    <div className="p-3 rounded-lg border bg-surface-2 dark:bg-white/5 border-border/40 dark:border-white/5">
                        <div className="text-xs font-bold text-content dark:text-content-dark mb-1.5">
                            Almacén principal
                        </div>
                        <div className="text-[10px] text-content-subtle dark:text-content-dark-muted mb-2 leading-relaxed">
                            Vincula este depósito con la tienda o sucursal a la que pertenece.
                        </div>
                        <CustomSelect
                            value={form.parent_warehouse_id ?? ""}
                            onChange={v => setForm(p => ({ ...p, parent_warehouse_id: v ? parseInt(v) : null }))}
                            options={[
                                { value: "", label: "Sin asignar" },
                                ...parentOptions.filter(w => w.id !== editId).map(w => ({ value: w.id, label: w.name })),
                            ]}
                            placeholder="Sin asignar"
                            className="w-full"
                        />
                    </div>
                )}

                {editId && (
                    <Toggle
                        checked={form.active ?? true}
                        onChange={v => setForm(p => ({ ...p, active: v }))}
                        title={(form.active ?? true) ? "Almacén activo" : "Almacén inactivo"}
                        description={(form.active ?? true)
                            ? "Disponible para operar en todo el sistema."
                            : "Queda archivado: no aparece en ningún selector, pero conserva su historial."}
                    />
                )}
            </div>

            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border/10">
                <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                <Button variant="primary" onClick={onSave} disabled={loading}>
                    {loading ? "Guardando..." : editId ? "Guardar cambios" : "Crear almacén"}
                </Button>
            </div>
        </Modal>
    );
}