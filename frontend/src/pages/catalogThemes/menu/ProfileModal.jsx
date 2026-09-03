// Ficha del cliente identificado, versión del tema de menú. La compartida
// (components/PublicCatalog/ProfileModal.jsx) usa los tokens del ERP —bg-surface,
// border-border, text-content-subtle— que en el tema por defecto se ven bien porque
// el resto de la pantalla también los usa. Aquí no: la carta entera está en panelColor
// y en el lenguaje de CartDrawer/ProductAddModal (píldoras rounded-full, brand-500 para
// acentos, neutral-900/500/400 para texto), así que la ficha compartida se veía como una
// ventana de otra app encima del menú — "sigue igual de generico" fue el reporte exacto.
const PANEL_POR_DEFECTO = "#F4FAF6";

export default function ProfileModal({
    identity, open, onClose,
    editing, setEditing,
    editName, setEditName, editPhone, setEditPhone,
    onSave, onForget, onOpenMyOrders,
    panelColor,
}) {
    if (!open || !identity) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] catalog-overlay-in" onClick={() => onClose()} />

            <div
                className="relative w-full sm:max-w-md max-h-[92vh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col catalog-drawer-in shadow-2xl shadow-black/40"
                style={{ backgroundColor: panelColor || PANEL_POR_DEFECTO }}
            >
                <div className="px-5 pt-5 pb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 shrink-0 rounded-2xl bg-brand-500 text-white flex items-center justify-center text-base font-black uppercase">
                            {(identity.name || identity.document || "U").charAt(0)}
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-[15px] font-black uppercase tracking-tight text-neutral-900 leading-tight truncate">
                                {identity.name || "Mi perfil"}
                            </h2>
                            <p className="text-[11px] font-bold text-neutral-500 tabular-nums">
                                {identity.document}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => onClose()}
                        aria-label="Cerrar"
                        className="shrink-0 p-1.5 text-neutral-400 hover:text-neutral-900 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="px-5 pb-5 space-y-4 overflow-y-auto">
                    {!editing ? (
                        <>
                            <div className="rounded-2xl bg-black/[0.03] border border-black/10 p-4 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Nombre</span>
                                    <span className="text-[12px] font-bold text-neutral-900 text-right">{identity.name || "Sin registrar"}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] pt-3">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Cédula / RIF</span>
                                    <span className="text-[12px] font-bold text-neutral-900 tabular-nums">{identity.document}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] pt-3">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Teléfono</span>
                                    <span className="text-[12px] font-bold text-neutral-900 tabular-nums">{identity.phone || "Sin registrar"}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <button
                                    onClick={() => setEditing(true)}
                                    className="w-full h-12 rounded-full bg-black/5 text-neutral-900 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-brand-500/10 hover:text-brand-500 active:scale-[0.99] transition-all"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    Modificar mi información
                                </button>

                                <button
                                    onClick={() => { onClose(); onOpenMyOrders(); }}
                                    className="w-full h-12 rounded-full bg-black/5 text-neutral-900 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-brand-500/10 hover:text-brand-500 active:scale-[0.99] transition-all"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                    Ver mis pedidos
                                </button>

                                <button
                                    onClick={onForget}
                                    className="w-full h-12 rounded-full bg-danger/10 text-danger text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-danger hover:text-white active:scale-[0.99] transition-all"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                    Cerrar sesión
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Tu nombre completo</label>
                                <input
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    placeholder="ej. Juan Pérez"
                                    className="w-full h-12 px-4 rounded-full bg-white border border-black/10 text-[13px] font-bold text-neutral-900 outline-none focus:border-brand-500/60 placeholder:text-neutral-400 placeholder:font-medium"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Número de teléfono (WhatsApp)</label>
                                <input
                                    value={editPhone}
                                    onChange={e => setEditPhone(e.target.value.replace(/[^\d+]/g, ""))}
                                    placeholder="ej. 04141234567"
                                    className="w-full h-12 px-4 rounded-full bg-white border border-black/10 text-[13px] font-bold text-neutral-900 outline-none focus:border-brand-500/60 placeholder:text-neutral-400 placeholder:font-medium"
                                />
                            </div>

                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={() => setEditing(false)}
                                    className="flex-1 h-12 rounded-full bg-black/5 text-neutral-500 text-[11px] font-black uppercase tracking-widest hover:text-neutral-900 active:scale-[0.99] transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={onSave}
                                    className="flex-1 h-12 rounded-full bg-brand-500 text-white text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-[0.99] transition-all"
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
