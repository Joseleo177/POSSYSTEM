import { useEffect, useState } from "react";

// Reconocer al cliente en el QR de la mesa (31-10-2026). Ver services/mesaClientes.js.
//
// El APARATO es este navegador: un código al azar guardado aquí, que no dice nada de la persona.
// Cerrar la pestaña no lo borra; otro navegador, el modo incógnito o borrar los datos, sí.

const CLAVE_APARATO = "nxus_aparato";

export function aparato() {
    try {
        let c = localStorage.getItem(CLAVE_APARATO);
        if (!c || !/^[A-Za-z0-9_-]{16,64}$/.test(c)) {
            c = (crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
            localStorage.setItem(CLAVE_APARATO, c);
        }
        return c;
    } catch { return null; }
}

// Lo que el cliente escribió al registrarse, hasta que su primer pedido cree la ficha.
const claveRegistro = (tienda) => `mesa_registro_${tienda}`;
export const leerRegistro = (tienda) => { try { return JSON.parse(localStorage.getItem(claveRegistro(tienda)) || "null"); } catch { return null; } };
export const guardarRegistro = (tienda, r) => { try { if (r) localStorage.setItem(claveRegistro(tienda), JSON.stringify(r)); else localStorage.removeItem(claveRegistro(tienda)); } catch { /* sin almacenamiento */ } };

// "Ahora no": no se vuelve a preguntar en 6 horas (lo que dura una visita, de sobra).
const claveOmitido = (tienda) => `mesa_quien_omitido_${tienda}`;
export const omitido = (tienda) => { try { return Date.now() - Number(localStorage.getItem(claveOmitido(tienda)) || 0) < 6 * 3600e3; } catch { return false; } };
const omitir = (tienda) => { try { localStorage.setItem(claveOmitido(tienda), String(Date.now())); } catch { /* sin almacenamiento */ } };

export const nombreDePila = (n) => {
    const p = String(n || "").trim().split(/\s+/)[0] || "";
    return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
};

const CAMPO = "w-full h-12 px-4 rounded-2xl bg-white border border-black/10 text-[16px] text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition-shadow";
const Spinner = () => <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />;
const Persona = ({ className = "w-6 h-6" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);
const Visto = () => (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path className="check-draw" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M5 13l4 4L19 7" /></svg>
);

/**
 * La hoja: `modo` "eres" (¿Eres José?) o "quien" (cédula → registro si no tiene ficha).
 * onSi / onNo: respuesta al "¿Eres José?". onCedula(doc) → { found, name } o lanza error.
 * onRegistro({ document, name, phone }): cédula nueva, la ficha nace con el primer pedido.
 */
export default function QuienSoy({ modo, nombre, tienda, onSi, onNo, onCedula, onRegistro, onClose }) {
    const [paso, setPaso] = useState(modo);          // eres · quien · registro · hola
    const [letra, setLetra] = useState("V");
    const [numero, setNumero] = useState("");
    const [doc, setDoc] = useState(null);
    const [nom, setNom] = useState("");
    const [tel, setTel] = useState("");
    const [saludo, setSaludo] = useState(nombre || "");
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);

    // El saludo se cierra solo.
    useEffect(() => {
        if (paso !== "hola") return;
        const t = setTimeout(onClose, 1500);
        return () => clearTimeout(t);
    }, [paso]); // eslint-disable-line react-hooks/exhaustive-deps

    const ahoraNo = () => { omitir(tienda); onClose(); };

    const enviarCedula = async (e) => {
        e?.preventDefault();
        if (numero.length < 6) { setError("Escribe tu cédula completa"); return; }
        setCargando(true); setError(null);
        try {
            const r = await onCedula(`${letra}-${numero}`);
            if (r.found) { setSaludo(r.name); setPaso("hola"); }
            else { setDoc(r.document || `${letra}-${numero}`); setPaso("registro"); }
        } catch (err) {
            setError(err?.message || "No se pudo verificar. Intenta de nuevo.");
        } finally { setCargando(false); }
    };

    const enviarRegistro = (e) => {
        e?.preventDefault();
        if (nom.trim().length < 3) { setError("Escribe tu nombre"); return; }
        onRegistro({ document: doc, name: nom.trim(), phone: tel.trim() || null });
        setSaludo(nombreDePila(nom)); setPaso("hola");
    };

    const responder = async (si) => {
        setCargando(true);
        try { await (si ? onSi() : onNo()); } finally { setCargando(false); }
        if (si) setPaso("hola");
        else { setNumero(""); setError(null); setPaso("quien"); }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/55 backdrop-blur-[3px] catalog-overlay-in" onClick={paso === "hola" ? onClose : ahoraNo} />
            <div className="relative w-full sm:max-w-[440px] rounded-t-[28px] sm:rounded-[28px] bg-[#FBFAF8] shadow-2xl catalog-sheet-in px-6 pt-3 sm:pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <div className="sm:hidden flex justify-center pb-4" aria-hidden="true"><span className="w-10 h-1 rounded-full bg-black/15" /></div>

                {paso === "eres" && (
                    <div className="text-center rise-in">
                        <span className="mx-auto w-16 h-16 rounded-full bg-brand-500 text-brand-ink flex items-center justify-center font-display text-[26px] font-bold">{(nombre || "?").charAt(0)}</span>
                        <h2 className="mt-4 font-display text-[24px] font-bold tracking-tight text-neutral-900">¿Eres {nombre}?</h2>
                        <p className="mt-1.5 text-[14px] text-neutral-500 leading-relaxed">Este teléfono ya pidió aquí antes. Si eres tú, te mostramos lo que te gusta.</p>
                        <div className="mt-6 space-y-2">
                            <button onClick={() => responder(true)} disabled={cargando}
                                className="btn-accent w-full h-12 rounded-full text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                                {cargando && <Spinner />} Sí, soy {nombre}
                            </button>
                            <button onClick={() => responder(false)} disabled={cargando} className="w-full h-12 rounded-full text-[15px] font-medium text-neutral-600 active:bg-black/5">
                                No, soy otra persona
                            </button>
                        </div>
                    </div>
                )}

                {paso === "quien" && (
                    <form onSubmit={enviarCedula} className="rise-in">
                        <span className="w-12 h-12 rounded-2xl bg-brand-500/10 text-brand-600 flex items-center justify-center"><Persona /></span>
                        <h2 className="mt-4 font-display text-[23px] font-bold tracking-tight text-neutral-900">¿Quién eres?</h2>
                        <p className="mt-1 text-[14px] text-neutral-500 leading-relaxed">Con tu cédula te reconocemos la próxima vez y te sugerimos lo que te gusta.</p>
                        <div className="mt-5 flex gap-2">
                            {/* V o E: dos botones, no un select (en la vitrina nada de select nativo). */}
                            <div className="shrink-0 h-12 p-1 rounded-2xl bg-black/[0.05] flex">
                                {["V", "E"].map(l => (
                                    <button key={l} type="button" onClick={() => setLetra(l)}
                                        className={`w-10 rounded-xl text-[15px] font-semibold transition-colors ${letra === l ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}>{l}</button>
                                ))}
                            </div>
                            <input autoFocus inputMode="numeric" autoComplete="off" placeholder="Número de cédula" value={numero}
                                onChange={e => { setNumero(e.target.value.replace(/\D/g, "").slice(0, 9)); setError(null); }}
                                className={`${CAMPO} tabular-nums`} />
                        </div>
                        {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
                        <div className="mt-5 space-y-2">
                            <button type="submit" disabled={cargando || !numero}
                                className="btn-accent w-full h-12 rounded-full text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                                {cargando && <Spinner />} Continuar
                            </button>
                            <button type="button" onClick={ahoraNo} className="w-full h-11 rounded-full text-[14px] font-medium text-neutral-500 active:bg-black/5">Ahora no</button>
                        </div>
                    </form>
                )}

                {paso === "registro" && (
                    <form onSubmit={enviarRegistro} className="rise-in">
                        <h2 className="font-display text-[23px] font-bold tracking-tight text-neutral-900">Es tu primera vez aquí</h2>
                        <p className="mt-1 text-[14px] text-neutral-500 leading-relaxed">¿Cómo te llamas? Así te saludamos la próxima vez.</p>
                        <div className="mt-5 space-y-3">
                            <label className="block">
                                <span className="block text-[13px] font-medium text-neutral-700 mb-1.5">Nombre y apellido</span>
                                <input autoFocus autoComplete="name" value={nom} onChange={e => { setNom(e.target.value.slice(0, 80)); setError(null); }} className={CAMPO} placeholder="José Pérez" />
                            </label>
                            <label className="block">
                                <span className="flex items-center justify-between text-[13px] font-medium text-neutral-700 mb-1.5">Teléfono <span className="text-[12px] font-normal text-neutral-500">Opcional</span></span>
                                <input inputMode="tel" autoComplete="tel" value={tel} onChange={e => setTel(e.target.value.replace(/[^\d+\s-]/g, "").slice(0, 20))} className={`${CAMPO} tabular-nums`} placeholder="0414 000 0000" />
                            </label>
                        </div>
                        <p className="mt-3 text-[12px] text-neutral-500">Cédula {doc}. Tu ficha se crea con tu primer pedido.</p>
                        {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
                        <div className="mt-5 space-y-2">
                            <button type="submit" className="btn-accent w-full h-12 rounded-full text-[15px] font-semibold">Listo</button>
                            <button type="button" onClick={() => { setPaso("quien"); setError(null); }} className="w-full h-11 rounded-full text-[14px] font-medium text-neutral-500 active:bg-black/5">Corregir la cédula</button>
                        </div>
                    </form>
                )}

                {paso === "hola" && (
                    <div className="text-center py-4 rise-in">
                        <span className="mx-auto w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center"><Visto /></span>
                        <h2 className="mt-4 font-display text-[24px] font-bold tracking-tight text-neutral-900">¡Hola, {saludo}!</h2>
                        <p className="mt-1 text-[14px] text-neutral-500">Qué bueno tenerte por aquí.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
