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

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        setConfirmRevoke(false);
        api.catalogLink.get()
            .then(r => setToken(r.data?.token || null))
            .catch(e => notify(e.message, "err"))
            .finally(() => setLoading(false));
    }, [open, notify]);

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
                    Un enlace de solo lectura para compartir con tus clientes. Muestra nombre, foto,
                    categoría y precio de cada producto, e indica si está agotado — nunca la cantidad
                    en inventario, ni costos, ni ningún otro dato del negocio.
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