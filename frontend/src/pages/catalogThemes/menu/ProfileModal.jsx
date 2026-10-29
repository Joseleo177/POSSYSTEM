// Ficha del cliente identificado, versión del tema de menú. La compartida
// (components/PublicCatalog/ProfileModal.jsx) usa los tokens del ERP, que aquí se veían como
// una ventana de otra app encima de la carta. Esta va en el papel del panel (CatalogSheet con
// la piel "carta"), igual que pedidos y checkout.
//
// Segunda vuelta (29-10-2026, "se ven demasiado genéricos"): tres píldoras grises iguales en
// mayúsculas se leían como un formulario. Ahora es una ficha de cuenta: avatar con iniciales,
// datos con su icono y las acciones como lista con flecha —Mis pedidos lleva cuántos siguen
// en curso—, y "Cerrar sesión" aparte, en rojo y sin relleno.
import { useAsyncAction } from "../../../hooks/useAsyncAction";
import { Spinner } from "../../../components/ui/Spinner";
import CatalogSheet, { sheetSkin } from "../../../components/PublicCatalog/CatalogSheet";
import { MENU_PANEL_DEFAULT } from "../../../components/PublicCatalog/shared";
import { toNameCase } from "../../../helpers";

const iniciales = (nombre) => String(nombre || "").trim().split(/\s+/).slice(0, 2).map(p => p.charAt(0)).join("").toUpperCase() || "?";

const ICON = {
    user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    card: "M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2",
    phone: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
    bag: "M6 7h12l-1 12.2a2 2 0 01-2 1.8H9a2 2 0 01-2-1.8L6 7zM9 10V6a3 3 0 016 0v4",
    edit: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
    out: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
    lock: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
};

const Icono = ({ d, className = "w-[18px] h-[18px]" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d={d} /></svg>
);

// Campo con su icono a la izquierda, dentro de la caja: se lee qué dato va sin buscar el
// rótulo, y el formulario deja de ser "dos cajas blancas iguales".
function Campo({ icon, label, hint, skin, children }) {
    return (
        <label className="block">
            <span className={skin.label}>{label}</span>
            <span className="relative block mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-brand-500/10 text-brand-600 flex items-center justify-center pointer-events-none">
                    <Icono d={icon} className="w-4 h-4" />
                </span>
                {children}
            </span>
            {hint && <span className={`block mt-1.5 text-[12px] ${skin.subtle}`}>{hint}</span>}
        </label>
    );
}

function Dato({ icon, label, value, skin }) {
    return (
        <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-8 h-8 rounded-xl bg-brand-500/10 text-brand-600 flex items-center justify-center shrink-0"><Icono d={icon} className="w-4 h-4" /></span>
            <span className={`flex-1 text-[13px] ${skin.subtle}`}>{label}</span>
            <span className={`text-[14px] font-semibold ${skin.ink} tabular-nums text-right truncate`}>{value}</span>
        </div>
    );
}

function Accion({ icon, label, onClick, badge = 0, skin }) {
    return (
        <button type="button" onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 h-14 text-left transition-colors hover:bg-white active:bg-white`}>
            <span className={`w-8 h-8 rounded-xl bg-black/[0.05] ${skin.ink} flex items-center justify-center shrink-0`}><Icono d={icon} className="w-4 h-4" /></span>
            <span className={`flex-1 text-[15px] font-semibold ${skin.ink}`}>{label}</span>
            {badge > 0 && (
                <span className="h-6 min-w-[24px] px-2 rounded-full bg-brand-500 text-brand-ink text-[12px] font-bold flex items-center justify-center tabular-nums">{badge}</span>
            )}
            <svg className={`w-4 h-4 ${skin.subtle} opacity-60`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
    );
}

export default function ProfileModal({
    identity, open, onClose,
    editing, setEditing,
    editName, setEditName, editPhone, setEditPhone,
    onSave, onForget, onOpenMyOrders,
    panelColor, openOrdersCount = 0,
}) {
    const [save, saving] = useAsyncAction(onSave);
    if (!open || !identity) return null;
    const skin = sheetSkin(panelColor || MENU_PANEL_DEFAULT);
    const nombre = toNameCase(identity.name) || "Mi cuenta";

    return (
        <CatalogSheet skin={skin} onClose={() => onClose()} label="Mi cuenta" width="sm:max-w-md">
            {/* Cabecera: avatar grande con iniciales sobre un halo del color de la tienda. */}
            <div className="relative px-5 pt-4 sm:pt-6 pb-5 flex flex-col items-center text-center shrink-0">
                <button type="button" onClick={() => onClose()} aria-label="Cerrar"
                    className={`absolute top-2 sm:top-4 right-4 w-9 h-9 flex items-center justify-center transition-colors ${skin.iconBtn}`}>
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <div className="ring-grow relative">
                    <span className="absolute -inset-2 rounded-full bg-brand-500/15" aria-hidden="true" />
                    <div className="relative w-[72px] h-[72px] rounded-full bg-brand-500 text-brand-ink flex items-center justify-center font-display text-[26px] font-bold shadow-[0_10px_24px_-8px_rgb(var(--c-brand-600)/0.8)]"
                        style={{ backgroundImage: "linear-gradient(145deg, rgb(255 255 255 / .25), rgb(0 0 0 / .08))" }}>
                        {iniciales(editing ? (editName || identity.name) : (identity.name || identity.document))}
                    </div>
                    {/* Editando, el lápiz sobre el avatar dice en qué modo está la ficha. */}
                    {editing && (
                        <span className="badge-pop absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-neutral-900 text-white ring-[3px] ring-white flex items-center justify-center" aria-hidden="true">
                            <Icono d={ICON.edit} className="w-3.5 h-3.5" />
                        </span>
                    )}
                </div>
                <h2 className={`mt-4 ${skin.title} ${skin.ink} leading-tight`}>{editing ? "Modificar mis datos" : nombre}</h2>
                <p className={`text-[13px] ${skin.subtle} tabular-nums mt-0.5`}>{identity.document}</p>
            </div>

            <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3 overflow-y-auto">
                {!editing ? (
                    <>
                        <div className={`${skin.card} divide-y ${skin.divide}`}>
                            <Dato icon={ICON.user} label="Nombre" value={nombre} skin={skin} />
                            <Dato icon={ICON.card} label="Cédula / RIF" value={identity.document} skin={skin} />
                            <Dato icon={ICON.phone} label="Teléfono" value={identity.phone || "Sin registrar"} skin={skin} />
                        </div>

                        <div className={`${skin.card} overflow-hidden divide-y ${skin.divide}`}>
                            <Accion icon={ICON.bag} label="Mis pedidos" badge={openOrdersCount} skin={skin}
                                onClick={() => { onClose(); onOpenMyOrders(); }} />
                            <Accion icon={ICON.edit} label="Modificar mi información" skin={skin}
                                onClick={() => setEditing(true)} />
                        </div>

                        <button type="button" onClick={onForget}
                            className="w-full h-12 rounded-full text-[14px] font-semibold text-red-600 flex items-center justify-center gap-2 hover:bg-red-500/[0.08] active:scale-[0.99] transition-all">
                            <Icono d={ICON.out} className="w-4 h-4" />
                            Cerrar sesión
                        </button>
                    </>
                ) : (
                    <div className="rise-in space-y-4">
                        <Campo icon={ICON.user} label="Tu nombre completo" skin={skin}>
                            <input
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                placeholder="Ej. Juan Pérez"
                                autoComplete="name"
                                className={`${skin.field} pl-12`}
                            />
                        </Campo>

                        <Campo icon={ICON.phone} label="Teléfono (WhatsApp)" skin={skin}
                            hint="Por aquí te escribe la tienda para confirmar tu pedido.">
                            <input
                                value={editPhone}
                                onChange={e => setEditPhone(e.target.value.replace(/[^\d+]/g, ""))}
                                placeholder="Ej. 04141234567"
                                inputMode="tel"
                                autoComplete="tel"
                                className={`${skin.field} pl-12 tabular-nums`}
                            />
                        </Campo>

                        {/* La cédula se ve pero no se cambia: es la llave de sus pedidos. Cambiarla
                            es entrar como otra persona, y eso se hace cerrando sesión. */}
                        <div>
                            <span className={skin.label}>Cédula / RIF</span>
                            <div className="mt-1.5 h-12 pl-3 pr-4 rounded-2xl bg-black/[0.04] flex items-center gap-3">
                                <span className="w-7 h-7 rounded-lg bg-black/[0.06] text-neutral-500 flex items-center justify-center"><Icono d={ICON.card} className="w-4 h-4" /></span>
                                <span className={`flex-1 text-[15px] font-medium ${skin.muted} tabular-nums`}>{identity.document}</span>
                                <Icono d={ICON.lock} className="w-4 h-4 text-neutral-400" />
                            </div>
                        </div>

                        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setEditing(false)}
                                className={`h-12 sm:flex-1 transition-all ${skin.secondary}`}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => save()}
                                disabled={saving}
                                className={`h-12 sm:flex-1 active:scale-[0.99] transition-all disabled:opacity-60 flex items-center justify-center gap-2 ${skin.primary}`}
                            >
                                {saving && <Spinner />}
                                {saving ? "Guardando..." : "Guardar cambios"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </CatalogSheet>
    );
}
