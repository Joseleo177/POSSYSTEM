// Ficha del cliente identificado: ver y editar nombre y teléfono, o salir de la sesión para
// que el catálogo vuelva a pedir el documento. El documento no se edita — es la llave con la
// que la tienda encuentra al cliente y sus pedidos.
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { Spinner } from "../ui/Spinner";
import { toNameCase } from "../../helpers";

const INPUT = "w-full h-11 px-3.5 rounded-xl bg-surface dark:bg-white/[0.04] border border-border dark:border-white/15 text-[15px] text-content dark:text-white placeholder:text-content-subtle/60 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";

// Fila de acción del menú de la cuenta: icono, texto y flecha. Se lee como un menú y no como
// tres botones grandes iguales compitiendo entre sí.
function Accion({ d, children, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full flex items-center gap-3 px-4 h-12 text-left text-[14px] font-medium text-content dark:text-white hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors"
        >
            <svg className="w-[18px] h-[18px] shrink-0 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={d} /></svg>
            <span className="flex-1">{children}</span>
            <svg className="w-4 h-4 shrink-0 text-content-subtle/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
    );
}

export default function ProfileModal({
    identity, open, onClose,
    editing, setEditing,
    editName, setEditName, editPhone, setEditPhone,
    onSave, onForget, onOpenMyOrders,
}) {
    const [save, saving] = useAsyncAction(onSave);
    if (!open || !identity) return null;

    const nombre = toNameCase(identity.name);
    const iniciales = (identity.name || identity.document || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => onClose()} />
            <div className="relative w-full sm:max-w-md bg-surface dark:bg-surface-dark-2 rounded-t-3xl sm:rounded-2xl border-t sm:border border-border/60 dark:border-white/10 overflow-hidden shadow-2xl z-10 flex flex-col">
                <div className="sm:hidden pt-2.5 flex justify-center" aria-hidden="true">
                    <span className="w-10 h-1 rounded-full bg-border dark:bg-white/20" />
                </div>

                {/* Encabezado */}
                <div className="px-5 pt-3 sm:pt-5 pb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center text-[15px] font-semibold shrink-0">
                            {iniciales}
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-[17px] font-semibold tracking-tight text-content dark:text-white truncate">
                                {editing ? "Modificar mis datos" : (nombre || "Mi perfil")}
                            </h2>
                            <p className="text-[13px] text-content-subtle tabular-nums">{identity.document}</p>
                        </div>
                    </div>
                    <button onClick={() => onClose()} aria-label="Cerrar"
                        className="w-9 h-9 -mr-2 rounded-lg flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/[0.06] transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="px-5 pb-5 space-y-4">
                    {!editing ? (
                        <>
                            {/* Datos */}
                            <dl className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                                {[
                                    ["Nombre", nombre],
                                    ["Cédula o RIF", identity.document],
                                    ["Teléfono", identity.phone],
                                ].map(([label, value]) => (
                                    <div key={label} className="px-4 py-3 flex items-baseline justify-between gap-4">
                                        <dt className="text-[13px] text-content-subtle shrink-0">{label}</dt>
                                        <dd className={`text-[14px] text-right tabular-nums min-w-0 truncate ${value ? "font-medium text-content dark:text-white" : "text-content-subtle"}`}>
                                            {value || "Sin registrar"}
                                        </dd>
                                    </div>
                                ))}
                            </dl>

                            {/* Acciones de la cuenta */}
                            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06] overflow-hidden">
                                <Accion onClick={() => setEditing(true)}
                                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z">
                                    Modificar mis datos
                                </Accion>
                                <Accion onClick={() => { onClose(); onOpenMyOrders(); }}
                                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2">
                                    Ver mis pedidos
                                </Accion>
                            </div>

                            {/* Salir es la excepción, no una acción más: va aparte y como texto
                                rojo, lejos de las otras, para que no se toque por reflejo. */}
                            <button
                                onClick={onForget}
                                className="w-full h-11 rounded-xl inline-flex items-center justify-center gap-2 text-[14px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                Cerrar sesión
                            </button>
                        </>
                    ) : (
                        <>
                            <div>
                                <label className="block text-[13px] font-medium text-content-muted dark:text-white/70 mb-1.5">Nombre completo</label>
                                <input
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    placeholder="Ej. Juan Pérez"
                                    autoComplete="name"
                                    className={INPUT}
                                />
                            </div>

                            <div>
                                <label className="block text-[13px] font-medium text-content-muted dark:text-white/70 mb-1.5">Teléfono (WhatsApp)</label>
                                <input
                                    value={editPhone}
                                    onChange={e => setEditPhone(e.target.value.replace(/[^\d+]/g, ""))}
                                    placeholder="Ej. 04141234567"
                                    inputMode="tel"
                                    autoComplete="tel"
                                    className={`${INPUT} tabular-nums`}
                                />
                                <p className="mt-1.5 text-[12px] text-content-subtle">La tienda te escribe aquí para coordinar tus pedidos.</p>
                            </div>

                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={() => setEditing(false)}
                                    className="h-11 px-5 rounded-xl border border-border dark:border-white/15 text-[14px] font-medium text-content dark:text-white hover:bg-surface-2 dark:hover:bg-white/[0.05] transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => save()}
                                    disabled={saving}
                                    className="flex-1 h-11 rounded-xl bg-brand-500 text-white text-[14px] font-semibold hover:brightness-110 transition disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    {saving && <Spinner />}
                                    {saving ? "Guardando…" : "Guardar cambios"}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
