// Ficha del cliente identificado: ver y editar nombre y teléfono, o salir de la sesión para
// que el catálogo vuelva a pedir el documento. El documento no se edita — es la llave con la
// que la tienda encuentra al cliente y sus pedidos.
export default function ProfileModal({
    identity, open, onClose,
    editing, setEditing,
    editName, setEditName, editPhone, setEditPhone,
    onSave, onForget, onOpenMyOrders,
}) {
    if (!open || !identity) return null;

    return (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => onClose()} />
                    <div className="relative w-full sm:max-w-md bg-surface dark:bg-surface-dark-2 rounded-t-3xl sm:rounded-3xl border-t sm:border border-border dark:border-white/10 overflow-hidden shadow-2xl z-10 flex flex-col animate-in fade-in slide-in-from-bottom-3 sm:zoom-in-95 duration-200">

                        {/* Encabezado */}
                        <div className="px-5 pt-5 pb-4 border-b border-border dark:border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-brand-500/15 text-brand-500 flex items-center justify-center text-base font-black uppercase">
                                    {(identity.name || identity.document || "U").charAt(0)}
                                </div>
                                <div>
                                    <h2 className="text-sm font-black uppercase tracking-tight text-content dark:text-white">
                                        {identity.name || "Mi Perfil"}
                                    </h2>
                                    <p className="text-[11px] font-bold text-content-muted">
                                        {identity.document}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => onClose()} className="p-1.5 -mr-1 text-content-subtle hover:text-content dark:hover:text-white transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Contenido / Edición */}
                        <div className="p-5 space-y-4">
                            {!editing ? (
                                <>
                                    <div className="rounded-2xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Nombre</span>
                                            <span className="text-xs font-bold text-content dark:text-white">{identity.name || "Sin registrar"}</span>
                                        </div>
                                        <div className="flex items-center justify-between border-t border-border/40 dark:border-white/5 pt-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Cédula / RIF</span>
                                            <span className="text-xs font-bold text-content dark:text-white tabular-nums">{identity.document}</span>
                                        </div>
                                        <div className="flex items-center justify-between border-t border-border/40 dark:border-white/5 pt-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Teléfono</span>
                                            <span className="text-xs font-bold text-content dark:text-white tabular-nums">{identity.phone || "Sin registrar"}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-1">
                                        <button
                                            onClick={() => setEditing(true)}
                                            className="w-full h-11 rounded-2xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-content dark:text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-brand-500/10 hover:text-brand-500 hover:border-brand-500/40 transition-all"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                            Modificar mi información
                                        </button>

                                        <button
                                            onClick={() => { onClose(); onOpenMyOrders(); }}
                                            className="w-full h-11 rounded-2xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-content dark:text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-brand-500/10 hover:text-brand-500 hover:border-brand-500/40 transition-all"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                            Ver mis pedidos
                                        </button>

                                        <button
                                            onClick={onForget}
                                            className="w-full h-11 rounded-2xl bg-danger/10 text-danger border border-danger/20 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-danger hover:text-white transition-all"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                            Cerrar sesión
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Tu nombre completo</label>
                                        <input
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            placeholder="ej. Juan Pérez"
                                            className="w-full h-11 px-3.5 rounded-2xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-xs font-bold text-content dark:text-white outline-none focus:border-brand-500 transition-colors"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Número de teléfono (WhatsApp)</label>
                                        <input
                                            value={editPhone}
                                            onChange={e => setEditPhone(e.target.value.replace(/[^\d+]/g, ""))}
                                            placeholder="ej. 04141234567"
                                            className="w-full h-11 px-3.5 rounded-2xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-xs font-bold text-content dark:text-white outline-none focus:border-brand-500 transition-colors"
                                        />
                                    </div>

                                    <div className="flex gap-2 pt-2">
                                        <button
                                            onClick={() => setEditing(false)}
                                            className="flex-1 h-11 rounded-2xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-content-subtle text-[11px] font-black uppercase tracking-widest hover:text-content dark:hover:text-white transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={onSave}
                                            className="flex-1 h-11 rounded-2xl bg-brand-500 text-black text-[11px] font-black uppercase tracking-widest hover:bg-brand-400 transition-all"
                                        >
                                            Guardar cambios
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
    );
}
