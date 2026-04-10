import Modal from "../ui/Modal";
import { Button } from "../ui/Button";

export default function AssignEmployeesModal({ assignModal, onClose, employees, assignSelected, toggleAssign, saveAssign }) {
    return (
        <Modal open={!!assignModal} onClose={onClose} title="Asignar Empleados" width={420}>
            <p className="text-xs text-content-muted dark:text-content-dark-muted mb-3">
                Almacén: <b className="text-content dark:text-content-dark">{assignModal?.name}</b>
            </p>
            <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto mb-4">
                {employees.map(emp => (
                    <label
                        key={emp.id}
                        className={[
                            "flex items-center gap-2.5 cursor-pointer px-2.5 py-2 rounded-lg border transition-colors",
                            assignSelected.includes(emp.id)
                                ? "bg-info/10 border-info/40"
                                : "bg-transparent border-surface-3 dark:border-surface-dark-3 hover:border-content-muted dark:hover:border-content-dark-muted",
                        ].join(" ")}
                    >
                        <input
                            type="checkbox"
                            checked={assignSelected.includes(emp.id)}
                            onChange={() => toggleAssign(emp.id)}
                        />
                        <div>
                            <div className={`text-xs font-bold ${assignSelected.includes(emp.id) ? "text-info" : "text-content dark:text-content-dark"}`}>
                                {emp.full_name}
                            </div>
                            <div className="text-[11px] text-content-muted dark:text-content-dark-muted">
                                {emp.role_label || emp.role} · @{emp.username}
                            </div>
                        </div>
                    </label>
                ))}
            </div>
            <div className="flex justify-end gap-2.5 mt-2">
                <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                <Button variant="primary" onClick={saveAssign}>Guardar</Button>
            </div>
        </Modal>
    );
}
