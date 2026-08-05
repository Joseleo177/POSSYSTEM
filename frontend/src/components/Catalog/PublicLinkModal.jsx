import { useState, useEffect } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";

// Genera, muestra y revoca el enlace público del catálogo. El token vive en `settings`
// (clave public_catalog_token), así que no hizo falta migración.
export default function PublicLinkModal({ open, onClose }) {
    const { notify } = useApp();
    const [token, setToken]     = useState(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [confirmRevoke, setConfirmRevoke] = useState(false);
    // Pedidos por WhatsApp. Vive en `settings` igual que el token, así que se lee y se
    // guarda aquí mismo: configurar el enlace y decidir si acepta pedidos es una sola
    // tarea, y mandar al usuario a otra pantalla a medio camino la parte en dos.
    const [whatsapp, setWhatsapp]     = useState("");
    const [ordersOn, setOrdersOn]     = useState(false);
    const [savedWhatsapp, setSavedWhatsapp] = useState("");

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        setConfirmRevoke(false);
        Promise.all([api.catalogLink.get(), api.settings.getAll()])
            .then(([link, cfg]) => {
                setToken(link.data?.token || null);
                const num = cfg.data?.catalog_whatsapp || "";
                setWhatsapp(num);
                setSavedWhatsapp(num);
                setOrdersOn(cfg.data?.catalog_orders_enabled === "true");
            })
            .catch(e => notify(e.message, "err"))
            .finally(() => setLoading(false));
    }, [open, notify]);

    // Dígitos que quedan tras limpiar el formato; es lo que realmente recibe wa.me.
    const whatsappDigits = whatsapp.replace(/\D/g, "");
    const whatsappValid  = whatsappDigits.length >= 8;

    const saveOrders = async (nextOn, nextNumber = whatsapp) => {
        setWorking(true);
        try {
            await api.settings.update({
                catalog_whatsapp: nextNumber,
                catalog_orders_enabled: nextOn ? "true" : "false",
            });
            setOrdersOn(nextOn);
            setSavedWhatsapp(nextNumber);
            notify(nextOn ? "Pedidos por WhatsApp activados" : "Pedidos desactivados");
        } catch (e) { notify(e.message, "err"); }
        setWorking(false);
    };

    const url = token ? `${window.location.origin}/catalogo/${token}` : "";

    const generate = async () => {
        setWorking(true);
        try {
            const r = await api.catalogLink.create();
            setToken(r.data.token);
            notify(token ? "Enlace regenerado. El anterior dejó de funcionar." : "Enlace creado");
        } catch (e) { notify(e.message, "err"); }
        setWorking(false);
        setConfirmRevoke(false);
    };

    const revoke = async () => {
        setWorking(true);
        try {
            await api.catalogLink.revoke();
            setToken(null);
            notify("Enlace desactivado");
        } catch (e) { notify(e.message, "err"); }
        setWorking(false);
        setConfirmRevoke(false);
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            notify("Enlace copiado");
        } catch {
            notify("No se pudo copiar. Selecciónalo manualmente.", "err");
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Catálogo público" width={480}>
            <div className="space-y-4">
                <p className="text-[12px] font-bold text-content-muted leading-relaxed">
                    Un enlace para compartir con tus clientes. Muestra nombre, foto, categoría y
                    precio de los productos que hayas marcado como públicos, e indica si están
                    agotados — nunca la cantidad en inventario, ni costos, ni ningún otro dato del
                    negocio.
                </p>

                {loading ? (
                    <div className="py-8 text-center text-[11px] font-black uppercase tracking-widest text-content-subtle">
                        Cargando...
                    </div>
                ) : token ? (
                    <>
                        <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-3 space-y-2">
                            <div className="text-[9px] font-black uppercase tracking-widest text-brand-500">
                                Enlace activo
                            </div>
                            <div className="text-[11px] font-bold text-content dark:text-white break-all leading-relaxed">
                                {url}
                            </div>
                            <div className="flex gap-2 pt-1">
                                <Button onClick={copy} className="h-8 px-3 text-[10px] shadow-none flex-1">
                                    Copiar enlace
                                </Button>
                                <Button
                                    onClick={() => window.open(url, "_blank", "noopener")}
                                    variant="ghost"
                                    className="h-8 px-3 text-[10px] shadow-none border border-border dark:border-white/10"
                                >
                                    Abrir
                                </Button>
                            </div>
                        </div>

                        {/* ── Pedidos por WhatsApp ── */}
                        <div className="rounded-xl border border-border dark:border-white/10 p-3 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-[9px] font-black uppercase tracking-widest text-content-subtle">
                                        Pedidos por WhatsApp
                                    </div>
                                    <p className="text-[11px] font-bold text-content-muted leading-relaxed mt-1">
                                        El cliente arma un carrito y te lo envía por WhatsApp. No genera
                                        ninguna venta ni aparta inventario: la gestionas tú.
                                    </p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={ordersOn}
                                        disabled={working || (!ordersOn && !whatsappValid)}
                                        onChange={e => saveOrders(e.target.checked)}
                                    />
                                    <div className="w-9 h-5 bg-border/50 dark:bg-white/10 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500 peer-disabled:opacity-40" />
                                </label>
                            </div>

                            <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-content-subtle">
                                    Número con código de país
                                </label>
                                <div className="flex gap-2 mt-1">
                                    <input
                                        value={whatsapp}
                                        onChange={e => setWhatsapp(e.target.value)}
                                        placeholder="58 414 5550000"
                                        className="input h-8 text-[11px] flex-1"
                                    />
                                    <button
                                        onClick={() => saveOrders(ordersOn, whatsapp)}
                                        disabled={working || !whatsappValid || whatsapp === savedWhatsapp}
                                        className="h-8 px-3 rounded-lg bg-brand-500 text-black text-[10px] font-black uppercase tracking-wide disabled:opacity-40"
                                    >
                                        Guardar
                                    </button>
                                </div>
                                <p className="text-[10px] font-bold text-content-subtle mt-1.5 leading-relaxed">
                                    {whatsapp && !whatsappValid
                                        ? "Número incompleto: hacen falta al menos 8 dígitos."
                                        : whatsappValid
                                        ? `Los pedidos llegarán a wa.me/${whatsappDigits}`
                                        : "Sin número no se pueden activar los pedidos."}
                                </p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-border dark:border-white/10 p-3 space-y-2">
                            <div className="text-[9px] font-black uppercase tracking-widest text-content-subtle">
                                Si el enlace se filtró
                            </div>
                            {confirmRevoke ? (
                                <div className="space-y-2">
                                    <p className="text-[11px] font-bold text-danger">
                                        Quien tenga el enlace actual dejará de ver el catálogo. ¿Continuar?
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={revoke}
                                            disabled={working}
                                            className="h-8 px-3 rounded-lg bg-danger text-white text-[10px] font-black uppercase tracking-wide disabled:opacity-50"
                                        >
                                            Desactivar
                                        </button>
                                        <button
                                            onClick={generate}
                                            disabled={working}
                                            className="h-8 px-3 rounded-lg bg-warning text-black text-[10px] font-black uppercase tracking-wide disabled:opacity-50"
                                        >
                                            Generar otro
                                        </button>
                                        <button
                                            onClick={() => setConfirmRevoke(false)}
                                            className="h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wide text-content-subtle"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmRevoke(true)}
                                    className="text-[11px] font-black uppercase tracking-wide text-danger hover:underline"
                                >
                                    Desactivar o regenerar
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="rounded-xl border border-border dark:border-white/10 p-5 text-center space-y-3">
                        <p className="text-[12px] font-bold text-content-muted">
                            Todavía no has creado el enlace.
                        </p>
                        <Button onClick={generate} disabled={working} className="h-9 px-5 text-[11px] shadow-none">
                            {working ? "Creando..." : "Crear enlace"}
                        </Button>
                    </div>
                )}
            </div>
        </Modal>
    );
}