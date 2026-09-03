import { resolveImageUrl, imgRetryOnError } from "../../../helpers";
import { useTheme } from "../../../hooks/useTheme";
import { useIdentityGate } from "../../../hooks/useIdentityGate";
import CustomSelect from "../../../components/ui/CustomSelect";
import { DOC_PREFIXES, docMaxLen } from "../../../components/PublicCatalog/shared";

// Misma puerta de identificación que el tema estándar —mismos cuatro pasos, mismas
// validaciones, mismo hook (useIdentityGate)— con la cara de una tienda de marca en vez de un
// formulario de sistema: nombre en el color de la marca, pastillas redondeadas en vez de
// cajas con borde, botón blanco sobre el color de marca como el resto del tema.
//
// Nunca se toca la lógica desde aquí: si algún día cambia el orden de los pasos o qué campos
// se piden, cambia en el hook y las dos presentaciones lo heredan solas.
export default function IdentityGate({ token, store, onIdentified }) {
    const { dark, toggle } = useTheme();
    const {
        step, prefix, setPrefix, number, setNumber, match, name, setName, phone, setPhone,
        busy, err, fullDocument, phoneOk,
        lookup, restart, confirmMatch, submitPhone, submitRegister,
    } = useIdentityGate(token, onIdentified);

    return (
        <div className="min-h-screen relative flex flex-col items-center justify-center px-5 py-10 bg-surface-2 dark:bg-surface-dark">
            <button
                onClick={toggle}
                title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                className="fixed top-6 right-6 w-10 h-10 rounded-full bg-surface dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 shadow-sm flex items-center justify-center text-content-muted hover:text-brand-500 transition-colors z-50"
            >
                {dark ? (
                    <svg className="w-[18px] h-[18px] text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                ) : (
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                )}
            </button>

            <div className="w-full max-w-sm">
                <div className="text-center mb-6">
                    {store?.logo_url ? (
                        <img
                            src={resolveImageUrl(store.logo_url)}
                            alt={store.name}
                            onError={imgRetryOnError}
                            className="w-40 h-40 sm:w-48 sm:h-48 object-contain mx-auto"
                        />
                    ) : (
                        <div className="w-24 h-24 rounded-full mx-auto bg-brand-500/10 flex items-center justify-center text-4xl font-black text-brand-500">
                            {(store?.name || "C").charAt(0)}
                        </div>
                    )}
                    <h1 className="mt-3 text-[20px] font-bold text-brand-500 leading-tight">
                        {store?.name || "Catálogo"}
                    </h1>
                    {store?.slogan && (
                        <p className="text-[12px] font-medium text-content-muted mt-0.5">{store.slogan}</p>
                    )}
                </div>

                <div className="bg-surface dark:bg-surface-dark-2 rounded-3xl shadow-sm border border-border/40 dark:border-white/[0.06] p-6 space-y-4">
                    {step === "doc" && (
                        <>
                            <div className="text-center space-y-1">
                                <h2 className="text-[15px] font-bold text-content dark:text-white">
                                    Identifícate para entrar
                                </h2>
                                <p className="text-[11px] font-medium text-content-muted leading-relaxed">
                                    Lo usamos para asociar tus pedidos y facturarte.
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <CustomSelect
                                    value={prefix}
                                    onChange={v => { setPrefix(v); setNumber(n => n.slice(0, docMaxLen(v))); }}
                                    options={DOC_PREFIXES.map(p => ({ value: p, label: `${p}-` }))}
                                    height="h-12"
                                    className="w-[76px] shrink-0"
                                    boxClassName="rounded-full text-[13px]"
                                />
                                <input
                                    value={number}
                                    onChange={e => setNumber(e.target.value.replace(/\D/g, "").slice(0, docMaxLen(prefix)))}
                                    onKeyDown={e => e.key === "Enter" && lookup()}
                                    inputMode="numeric"
                                    autoFocus
                                    placeholder={"0".repeat(docMaxLen(prefix))}
                                    className="flex-1 h-12 px-4 rounded-full bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-[14px] font-bold tabular-nums text-content dark:text-white outline-none focus:border-brand-500/60 placeholder:text-content-subtle"
                                />
                            </div>
                            <GateButton onClick={lookup} disabled={number.length < 6 || busy}>
                                {busy ? "Verificando..." : "Continuar"}
                            </GateButton>
                        </>
                    )}

                    {step === "confirm" && (
                        <>
                            <div className="text-center space-y-1.5">
                                <div className="w-12 h-12 mx-auto rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                </div>
                                <p className="text-[11px] font-bold uppercase tracking-widest text-content-muted">¿Eres tú?</p>
                                <p className="text-[17px] font-bold text-content dark:text-white leading-tight">{match?.name}</p>
                                <p className="text-[12px] font-medium text-content-muted tabular-nums">{fullDocument}</p>
                            </div>
                            <GateButton onClick={confirmMatch}>Sí, soy yo</GateButton>
                            <button onClick={restart} className="w-full text-[11px] font-bold text-content-muted hover:text-brand-500 transition-colors">
                                No, corregir cédula
                            </button>
                        </>
                    )}

                    {step === "phone" && (
                        <>
                            <div className="text-center space-y-1">
                                <h2 className="text-[15px] font-bold text-content dark:text-white">Falta tu teléfono</h2>
                                <p className="text-[11px] font-medium text-content-muted leading-relaxed">
                                    Es por donde te confirmamos el pedido y te enviamos la factura.
                                </p>
                            </div>
                            <GateInput value={phone} onChange={setPhone} type="tel" placeholder="0414 5550000" autoFocus onEnter={submitPhone} />
                            <GateButton onClick={submitPhone} disabled={!phoneOk}>Entrar al catálogo</GateButton>
                            <button onClick={restart} className="w-full text-[11px] font-bold text-content-muted hover:text-brand-500 transition-colors">
                                Volver
                            </button>
                        </>
                    )}

                    {step === "register" && (
                        <>
                            <div className="text-center space-y-1">
                                <h2 className="text-[15px] font-bold text-content dark:text-white">Es tu primera vez</h2>
                                <p className="text-[11px] font-medium text-content-muted leading-relaxed">
                                    Deja tus datos y quedas registrado con {fullDocument}.
                                </p>
                            </div>
                            <GateInput value={name} onChange={v => setName(v.toUpperCase())} placeholder="Nombre completo" autoFocus />
                            <GateInput value={phone} onChange={setPhone} type="tel" placeholder="0414 5550000" onEnter={submitRegister} />
                            <GateButton onClick={submitRegister} disabled={name.trim().length < 2 || !phoneOk}>
                                Entrar al catálogo
                            </GateButton>
                            <button onClick={restart} className="w-full text-[11px] font-bold text-content-muted hover:text-brand-500 transition-colors">
                                Corregir cédula
                            </button>
                        </>
                    )}

                    {err && <p className="text-[11px] font-bold text-danger text-center">{err}</p>}
                </div>

                {store?.phone && (
                    <p className="text-center text-[11px] font-medium text-content-muted mt-5">
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
            className="w-full h-12 px-4 rounded-full bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-[13px] font-medium text-content dark:text-white outline-none focus:border-brand-500/60 placeholder:text-content-subtle"
        />
    );
}

function GateButton({ onClick, disabled, children }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="w-full h-12 rounded-full bg-brand-500 text-white text-[11px] font-bold uppercase tracking-widest hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-40"
        >
            {children}
        </button>
    );
}
