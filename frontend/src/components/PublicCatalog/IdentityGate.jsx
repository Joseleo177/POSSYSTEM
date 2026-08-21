import { useState } from "react";
import { publicApi } from "../../services/api";
import { resolveImageUrl, imgRetryOnError } from "../../helpers";
import { useTheme } from "../../hooks/useTheme";
import CustomSelect from "../ui/CustomSelect";
import { DOC_PREFIXES, docMaxLen } from "./shared";

// Puerta de entrada al catálogo público: identifica al cliente por cédula o RIF antes de
// dejarlo ver la tienda, para poder asociarle sus pedidos y facturarle sin volver a pedirle
// los datos. Cuatro pasos: documento, confirmación de la ficha encontrada, teléfono si falta,
// y alta si es la primera vez.
export default function IdentityGate({ token, store, onIdentified }) {
    const { dark, toggle } = useTheme();
    const [step, setStep] = useState("doc"); // doc | confirm | phone | register
    const [prefix, setPrefix] = useState("V");
    const [number, setNumber] = useState("");
    const [match, setMatch] = useState(null);  // ficha encontrada
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    // Nombre explícito: `document` a secas taparía el objeto global del DOM.
    const fullDocument = `${prefix}-${number}`;
    const phoneOk = phone.replace(/\D/g, "").length >= 7;

    const lookup = async () => {
        if (number.length < 6 || busy) return;
        setBusy(true); setErr(null);
        try {
            const r = await publicApi.identify(token, fullDocument);
            if (r.data.found) {
                setMatch(r.data);
                if (r.data.phone) {
                    onIdentified({ document: fullDocument, name: r.data.name, phone: r.data.phone });
                } else {
                    setPhone("");
                    setStep("phone");
                }
            } else {
                setStep("register");
            }
        } catch (e) {
            setErr(e.message || "No se pudo verificar. Intenta de nuevo.");
        } finally {
            setBusy(false);
        }
    };

    const restart = () => { setStep("doc"); setMatch(null); setName(""); setPhone(""); setErr(null); };

    return (
        <div className="min-h-screen relative flex flex-col items-center justify-center px-5 py-10 bg-surface-2 dark:bg-surface-dark">
            <button
                onClick={toggle}
                title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                className="fixed top-6 right-6 p-2.5 rounded-2xl bg-surface dark:bg-surface-dark-2 border border-border dark:border-white/10 text-content-muted hover:text-content dark:hover:text-white transition-all z-50 shadow-sm"
            >
                {dark ? (
                    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                ) : (
                    <svg className="w-5 h-5 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                )}
            </button>
            <div className="w-full max-w-sm space-y-5">
                <div className="text-center space-y-3">
                    {store?.logo_url ? (
                        <img
                            src={resolveImageUrl(store.logo_url)}
                            alt={store.name}
                            onError={imgRetryOnError}
                            className="w-16 h-16 rounded-2xl object-cover mx-auto border border-border dark:border-white/10"
                        />
                    ) : (
                        <div className="w-16 h-16 rounded-2xl mx-auto bg-brand-500/10 flex items-center justify-center text-2xl font-black text-brand-500">
                            {(store?.name || "C").charAt(0)}
                        </div>
                    )}
                    <div>
                        <h1 className="text-base font-black text-content dark:text-white uppercase tracking-tight">
                            {store?.name || "Catálogo"}
                        </h1>
                        {store?.slogan && (
                            <p className="text-[11px] font-bold text-content-muted italic">{store.slogan}</p>
                        )}
                    </div>
                </div>

                <div className="bg-surface dark:bg-surface-dark-2 rounded-3xl border border-border dark:border-white/10 p-5 space-y-4">
                    {step === "doc" && (
                        <>
                            <div className="text-center space-y-1">
                                <h2 className="text-[13px] font-black uppercase tracking-tight text-content dark:text-white">
                                    Identifícate para entrar
                                </h2>
                                <p className="text-[11px] font-bold text-content-muted leading-relaxed">
                                    Escribe tu cédula o RIF. Lo usamos para asociar tus pedidos y
                                    facturarte sin pedirte los datos cada vez.
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <CustomSelect
                                    value={prefix}
                                    onChange={v => { setPrefix(v); setNumber(n => n.slice(0, docMaxLen(v))); }}
                                    options={DOC_PREFIXES.map(p => ({ value: p, label: `${p}-` }))}
                                    height="h-11"
                                    className="w-[78px] shrink-0"
                                    boxClassName="rounded-xl text-[13px]"
                                />
                                <input
                                    value={number}
                                    onChange={e => setNumber(e.target.value.replace(/\D/g, "").slice(0, docMaxLen(prefix)))}
                                    onKeyDown={e => e.key === "Enter" && lookup()}
                                    inputMode="numeric"
                                    autoFocus
                                    placeholder={"0".repeat(docMaxLen(prefix))}
                                    className="flex-1 h-11 px-3 rounded-xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-[14px] font-black tabular-nums text-content dark:text-white outline-none focus:border-brand-500/60 placeholder:text-content-subtle"
                                />
                            </div>
                            <GateButton onClick={lookup} disabled={number.length < 6 || busy}>
                                {busy ? "Verificando..." : "Continuar"}
                            </GateButton>
                        </>
                    )}

                    {step === "confirm" && (
                        <>
                            <div className="text-center space-y-2">
                                <div className="w-12 h-12 mx-auto rounded-2xl bg-brand-500/10 text-brand-500 flex items-center justify-center">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                </div>
                                <p className="text-[11px] font-black uppercase tracking-widest text-content-subtle">¿Eres tú?</p>
                                <p className="text-base font-black text-content dark:text-white uppercase tracking-tight leading-tight">
                                    {match?.name}
                                </p>
                                <p className="text-[11px] font-bold text-content-muted tabular-nums">{fullDocument}</p>
                            </div>
                            <GateButton
                                onClick={() => {
                                    if (!match?.phone) return setStep("phone");
                                    onIdentified({ document: fullDocument, name: match.name, phone: match.phone });
                                }}
                            >
                                Sí, soy yo
                            </GateButton>
                            <button onClick={restart} className="w-full text-[10px] font-black uppercase tracking-widest text-content-subtle hover:text-content dark:hover:text-white">
                                No, corregir cédula
                            </button>
                        </>
                    )}

                    {step === "phone" && (
                        <>
                            <div className="text-center space-y-1">
                                <h2 className="text-[13px] font-black uppercase tracking-tight text-content dark:text-white">
                                    Falta tu teléfono
                                </h2>
                                <p className="text-[11px] font-bold text-content-muted leading-relaxed">
                                    Es por donde te confirmamos el pedido y te enviamos la factura.
                                </p>
                            </div>
                            <GateInput value={phone} onChange={setPhone} type="tel" placeholder="0414 5550000" autoFocus
                                onEnter={() => phoneOk && onIdentified({ document: fullDocument, name: match.name, phone: phone.trim() })} />
                            <GateButton
                                onClick={() => onIdentified({ document: fullDocument, name: match.name, phone: phone.trim() })}
                                disabled={!phoneOk}
                            >
                                Entrar al catálogo
                            </GateButton>
                            <button onClick={restart} className="w-full text-[10px] font-black uppercase tracking-widest text-content-subtle hover:text-content dark:hover:text-white">
                                Volver
                            </button>
                        </>
                    )}

                    {step === "register" && (
                        <>
                            <div className="text-center space-y-1">
                                <h2 className="text-[13px] font-black uppercase tracking-tight text-content dark:text-white">
                                    Es tu primera vez
                                </h2>
                                <p className="text-[11px] font-bold text-content-muted leading-relaxed">
                                    Deja tus datos y quedas registrado con {fullDocument}.
                                </p>
                            </div>
                            <GateInput value={name} onChange={v => setName(v.toUpperCase())} placeholder="Nombre completo" autoFocus />
                            <GateInput value={phone} onChange={setPhone} type="tel" placeholder="0414 5550000"
                                onEnter={() => name.trim().length >= 2 && phoneOk && onIdentified({ document: fullDocument, name: name.trim(), phone: phone.trim() })} />
                            <GateButton
                                onClick={() => onIdentified({ document: fullDocument, name: name.trim(), phone: phone.trim() })}
                                disabled={name.trim().length < 2 || !phoneOk}
                            >
                                Entrar al catálogo
                            </GateButton>
                            <button onClick={restart} className="w-full text-[10px] font-black uppercase tracking-widest text-content-subtle hover:text-content dark:hover:text-white">
                                Corregir cédula
                            </button>
                        </>
                    )}

                    {err && <p className="text-[11px] font-bold text-danger text-center">{err}</p>}
                </div>

                {store?.phone && (
                    <p className="text-center text-[10px] font-bold text-content-subtle">
                        ¿Problemas? Escríbenos al {store.phone}
                    </p>
                )}
            </div>
        </div>
    );
}

function GateInput({ value, onChange, placeholder, type = "text", autoFocus, onEnter }) {
    return (
        <input
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => e.key === "Enter" && onEnter?.()}
            type={type}
            inputMode={type === "tel" ? "tel" : undefined}
            autoFocus={autoFocus}
            placeholder={placeholder}
            className="w-full h-11 px-3 rounded-xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 placeholder:text-content-subtle"
        />
    );
}

function GateButton({ onClick, disabled, children }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="w-full h-11 rounded-2xl bg-brand-500 text-black text-[11px] font-black uppercase tracking-widest active:scale-[0.99] transition-transform disabled:opacity-40"
        >
            {children}
        </button>
    );
}

// Colores del estado. "rechazado" no viene del servidor: lo deduce el navegador cuando un
// pedido que envió ya no aparece en la lista (ver rejectedIds).
const STAGE_STYLES = {
    enviado: "bg-warning/15 text-warning border-warning/30",
    confirmado: "bg-info/15 text-info border-info/30",
    facturado: "bg-brand-500/15 text-brand-500 border-brand-500/30",
    pagado: "bg-success/15 text-success border-success/30",
    anulado: "bg-danger/15 text-danger border-danger/30",
    rechazado: "bg-danger/15 text-danger border-danger/30",
};

// Cantidades: enteras para unidades contables, 3 decimales para peso y volumen. Aquí no
