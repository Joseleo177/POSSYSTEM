// Configuración → Asistente IA (solo superusuario). La llave del proveedor es de la plataforma,
// no de una empresa: una sola sirve a todas las tiendas que tienen el extra. Se guarda cifrada en
// la base y vale en el acto, sin redesplegar. Quién tiene el asistente y su nivel se decide en
// Empresas.
//
// La llave nunca vuelve del servidor: la pantalla solo conoce sus 4 últimos caracteres.
import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import ConfirmModal from "../ui/ConfirmModal";

const SECTION = "bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none";
const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";
const LABEL = "flex items-baseline justify-between gap-2 text-[12px] text-content-subtle mb-1.5";

const fmtFecha = (f) => f ? new Date(f).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export default function AsistenteIASettings({ notify }) {
    const [estado, setEstado] = useState(null);
    const [llave, setLlave] = useState("");
    const [modelo, setModelo] = useState("");
    const [prueba, setPrueba] = useState(null);
    const [quitar, setQuitar] = useState(false);

    const cargar = async () => {
        try {
            const r = await api.asistente.config();
            setEstado(r.data);
            setModelo(r.data.modelo || "");
        } catch (e) { notify(e.message, "err"); }
    };
    useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const guardar = async () => {
        try {
            const body = { modelo };
            if (llave.trim()) body.api_key = llave.trim();
            const r = await api.asistente.guardarConfig(body);
            setEstado(r.data);
            setLlave("");
            setPrueba(null);
            notify(body.api_key ? "Llave guardada. Ya está activa para todas las tiendas." : "Cambios guardados");
        } catch (e) { notify(e.message, "err"); }
    };

    const probar = async () => {
        setPrueba(null);
        try {
            const r = await api.asistente.probarConfig();
            setPrueba({ ok: true, ...r.data });
        } catch (e) { setPrueba({ ok: false, mensaje: e.message }); }
    };

    const borrar = async () => {
        try {
            const r = await api.asistente.guardarConfig({ api_key: "" });
            setEstado(r.data);
            setPrueba(null);
            setQuitar(false);
            notify("Llave quitada");
        } catch (e) { notify(e.message, "err"); }
    };

    const hayCambios = !!llave.trim() || (estado && modelo !== (estado.modelo || ""));

    return (
        <div className="max-w-2xl space-y-4">
            {/* Estado de la llave */}
            <div className={`${SECTION} p-5`}>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-content dark:text-white">Llave de DeepSeek</p>
                        <p className="mt-0.5 text-[13px] text-content-subtle leading-relaxed max-w-md">
                            Una sola llave para todas las tiendas que tienen el asistente. Cambiarla vale en el acto, sin redesplegar.
                            Quién tiene el asistente y su nivel se elige en Empresas.
                        </p>
                    </div>
                    {estado?.configurada && (
                        <Button variant="ghost" onClick={probar} className="shrink-0">Probar</Button>
                    )}
                </div>

                {estado && (
                    <dl className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px]">
                        <div>
                            <dt className="text-[12px] text-content-subtle">Estado</dt>
                            <dd className={`mt-0.5 font-medium ${estado.configurada ? "text-content dark:text-white" : "text-danger"}`}>
                                {estado.configurada ? "Configurada" : estado.ilegible ? "Hay que volver a pegarla" : "Sin llave"}
                            </dd>
                        </div>
                        {estado.configurada && (
                            <div>
                                <dt className="text-[12px] text-content-subtle">Llave</dt>
                                <dd className="mt-0.5 font-medium text-content dark:text-white tabular-nums">•••• {estado.termina_en}</dd>
                            </div>
                        )}
                        {estado.configurada && (
                            <div>
                                <dt className="text-[12px] text-content-subtle">Origen</dt>
                                <dd className="mt-0.5 font-medium text-content dark:text-white">
                                    {estado.origen === "panel" ? `Este panel${estado.actualizada ? ` · ${fmtFecha(estado.actualizada)}` : ""}` : "Variable del servidor"}
                                </dd>
                            </div>
                        )}
                    </dl>
                )}

                {prueba && (
                    <div className={`mt-4 pl-3 border-l-[3px] text-[13px] ${prueba.ok ? "border-border dark:border-white/20 text-content dark:text-white" : "border-danger text-danger"}`}>
                        {prueba.ok
                            ? <>La llave funciona{prueba.disponible === false ? ", pero la cuenta no está disponible" : ""}. Saldo: {prueba.saldos?.length
                                ? prueba.saldos.map(s => `${s.moneda} ${s.total.toFixed(2)}`).join(" · ")
                                : "sin datos"}.</>
                            : prueba.mensaje}
                    </div>
                )}
            </div>

            {/* Cambiar llave y modelo */}
            <div className={`${SECTION} p-5 space-y-4`}>
                <div>
                    <label className={LABEL} htmlFor="ia-llave">
                        {estado?.configurada ? "Nueva llave" : "Llave"}
                        {estado?.configurada && <span className="text-[11px] text-content-subtle/80">Vacío: se queda la actual</span>}
                    </label>
                    <input id="ia-llave" type="password" value={llave} onChange={e => setLlave(e.target.value)}
                        autoComplete="new-password" spellCheck={false} placeholder="sk-…" className={INPUT} />
                    <p className="mt-1 text-[11px] text-content-subtle">Se crea en platform.deepseek.com → API keys. Se guarda cifrada.</p>
                </div>
                <div>
                    <label className={LABEL} htmlFor="ia-modelo">Modelo</label>
                    <input id="ia-modelo" type="text" value={modelo} onChange={e => setModelo(e.target.value)}
                        autoComplete="off" spellCheck={false} placeholder="deepseek-chat" className={`${INPUT} sm:max-w-[280px]`} />
                    <p className="mt-1 text-[11px] text-content-subtle">El nombre exacto que indica DeepSeek. Vacío: deepseek-chat.</p>
                </div>
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
                    {estado?.origen === "panel" ? (
                        <button type="button" onClick={() => setQuitar(true)} className="h-12 sm:h-9 text-[13px] text-danger hover:underline sm:text-left">
                            Quitar la llave
                        </button>
                    ) : <span />}
                    {hayCambios && <Button onClick={guardar} className="h-12 sm:h-10 px-5">Guardar</Button>}
                </div>
            </div>

            <ConfirmModal
                isOpen={quitar}
                title="¿Quitar la llave?"
                message="El asistente deja de responder en todas las tiendas hasta que pegues otra."
                confirmText="Quitar"
                onConfirm={borrar}
                onCancel={() => setQuitar(false)}
            />
        </div>
    );
}
