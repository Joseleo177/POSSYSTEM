import { resolveImageUrl, imgRetryOnError, toNameCase } from "../../helpers";
import { useIdentityGate } from "../../hooks/useIdentityGate";
import CatalogSheet, { sheetSkin } from "./CatalogSheet";
import { DOC_PREFIXES, docMaxLen } from "./shared";

// Bienvenida del catálogo público (empezó en el tema de menú y la usan los tres temas): identificarse y elegir sucursal como hojas ENCIMA de la carta,
// no como pantallas sueltas. Antes eran las puertas claras del tema estándar —un logo sobre
// fondo gris y un formulario—, y el cliente que abría el enlace no veía la tienda hasta haber
// dado su cédula: "debería verse la tienda de fondo, para que se vea más creíble" (29-10-2026).
// Ahora detrás está la portada real (banners y categorías, que ya cargan sin identidad) y el
// cliente se identifica sabiendo dónde está.
//
// La lógica de los pasos es la misma de siempre (useIdentityGate); aquí solo cambia la cara.
// Ninguna de las dos se cierra tocando fuera: son puertas, no avisos.
//
// Cada tema decide dos cosas: `panel`, el color del papel de la hoja (el panel de la carta en
// el menú, blanco en boutique y estándar), y `logoBg`, el recuadro del logo. La carta usa el
// fondo oscuro de su página porque sus logos están hechos para ir sobre él; en boutique y
// estándar el logo va suelto (null): un logo negro sobre un recuadro negro desaparece.

const VELO = "bg-black/35 backdrop-blur-[2px]";

const I = {
    id: "M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2",
    user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    phone: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
    bag: "M6 7h12l-1 12.2a2 2 0 01-2 1.8H9a2 2 0 01-2-1.8L6 7zM9 10V6a3 3 0 016 0v4",
    track: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
    receipt: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z",
    pin: "M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z",
    lock: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
    arrow: "M5 12h14m-6-6l6 6-6 6",
};
const Ico = ({ d, className = "w-4 h-4", w = 1.9 }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={w} d={d} /></svg>
);

// Marca de la tienda arriba de la hoja: el logo en su recuadro del color de la página (los
// logos de la carta suelen estar hechos para fondo oscuro), el nombre y el lema.
function Marca({ store, skin, logoBg }) {
    return (
        <div className="px-5 pt-3 sm:pt-6 pb-1 flex items-center gap-3">
            {logoBg ? (
                <span className="h-14 min-w-[56px] max-w-[150px] px-2 rounded-2xl flex items-center justify-center shrink-0 shadow-[0_8px_20px_-10px_rgba(0,0,0,.6)]"
                    style={{ backgroundColor: logoBg }}>
                    {store?.logo_url
                        ? <img src={resolveImageUrl(store.logo_url)} alt={store.name} onError={imgRetryOnError} className="max-h-11 w-auto object-contain" />
                        : <span className="font-display text-[22px] font-bold text-white">{(store?.name || "T").charAt(0)}</span>}
                </span>
            ) : store?.logo_url ? (
                <img src={resolveImageUrl(store.logo_url)} alt={store.name} onError={imgRetryOnError} className="h-14 max-w-[160px] w-auto object-contain shrink-0" />
            ) : (
                <span className="w-14 h-14 rounded-2xl bg-brand-500 text-brand-ink flex items-center justify-center font-display text-[22px] font-bold shrink-0">{(store?.name || "T").charAt(0)}</span>
            )}
            <div className="min-w-0">
                <div className={`font-display text-[18px] font-bold ${skin.ink} leading-tight truncate`}>{store?.name || "Bienvenido"}</div>
                {store?.slogan && <div className={`text-[12px] ${skin.subtle} truncate`}>{store.slogan}</div>}
            </div>
        </div>
    );
}

function Campo({ icon, children, skin }) {
    return (
        <span className="relative block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-brand-500/10 text-brand-600 flex items-center justify-center pointer-events-none">
                <Ico d={icon} />
            </span>
            {children}
        </span>
    );
}

function Primario({ onClick, disabled, children, skin }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled}
            className={`w-full h-[52px] flex items-center justify-center gap-2 active:scale-[0.99] transition-all disabled:opacity-40 disabled:shadow-none ${skin.primary}`}>
            {children}
            {!disabled && <Ico d={I.arrow} className="w-4 h-4" w={2.5} />}
        </button>
    );
}

function Ayuda({ store, skin }) {
    if (!store?.phone) return null;
    return <p className={`text-center text-[12px] ${skin.subtle}`}>¿Problemas? Escríbenos al <span className="font-semibold tabular-nums">{store.phone}</span></p>;
}

export function IdentitySheet({ token, store, onIdentified, panel = "#FFFFFF", logoBg = null }) {
    const skin = sheetSkin(panel);
    const {
        step, prefix, setPrefix, number, setNumber, match, name, setName, phone, setPhone,
        busy, err, fullDocument, phoneOk,
        lookup, restart, confirmMatch, submitPhone, submitRegister,
    } = useIdentityGate(token, onIdentified);
    const campo = `${skin.field} pl-12`;
    const volver = (txt) => (
        <button type="button" onClick={restart} className={`w-full h-10 text-[13px] font-medium ${skin.subtle} hover:text-neutral-900 transition-colors`}>{txt}</button>
    );

    return (
        <CatalogSheet skin={skin} onClose={null} label="Identifícate" overlay={VELO} width="sm:max-w-md">
            <Marca store={store} skin={skin} logoBg={logoBg} />

            <div className="overflow-y-auto px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                {/* key={step}: cada paso entra con su animación, no aparece de golpe. */}
                <div key={step} className="rise-in space-y-4">
                    {step === "doc" && (
                        <>
                            <div>
                                <h2 className={`${skin.title} ${skin.ink}`}>¡Bienvenido! Identifícate</h2>
                                <p className={`text-[13px] ${skin.muted} mt-1 leading-relaxed`}>
                                    Con tu cédula asociamos tus pedidos y te facturamos sin pedirte los datos cada vez.
                                </p>
                            </div>

                            {/* El tipo de documento como pastillas y no como lista: son cinco
                                letras, caben en una fila y se eligen de un toque. */}
                            <div className="flex gap-1.5" role="radiogroup" aria-label="Tipo de documento">
                                {DOC_PREFIXES.map(p => (
                                    <button key={p} type="button" role="radio" aria-checked={prefix === p}
                                        onClick={() => { setPrefix(p); setNumber(n => n.slice(0, docMaxLen(p))); }}
                                        className={`flex-1 h-10 rounded-xl text-[14px] font-bold transition-all ${prefix === p ? "bg-neutral-900 text-white shadow-sm" : "bg-black/[0.05] text-neutral-600 hover:bg-black/[0.08]"}`}>
                                        {p}
                                    </button>
                                ))}
                            </div>
                            <Campo icon={I.id} skin={skin}>
                                <span className={`absolute left-12 top-1/2 -translate-y-1/2 text-[16px] font-semibold ${skin.subtle} pointer-events-none`}>{prefix}-</span>
                                <input
                                    value={number}
                                    onChange={e => setNumber(e.target.value.replace(/\D/g, "").slice(0, docMaxLen(prefix)))}
                                    onKeyDown={e => e.key === "Enter" && lookup()}
                                    inputMode="numeric"
                                    autoComplete="off"
                                    autoFocus
                                    aria-label="Número de cédula o RIF"
                                    placeholder={"0".repeat(docMaxLen(prefix))}
                                    className="w-full h-14 pl-[4.6rem] pr-4 rounded-2xl border border-black/10 bg-white text-[18px] font-semibold tracking-wide text-neutral-900 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 placeholder:text-neutral-300 tabular-nums transition-shadow"
                                />
                            </Campo>
                            <Primario onClick={lookup} disabled={number.length < 6 || busy} skin={skin}>
                                {busy && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                                {busy ? "Verificando..." : "Continuar"}
                            </Primario>

                            {/* Para qué sirve entrar, en tres iconos: pedir a alguien su cédula sin
                                decirle qué gana es la forma más rápida de que se vaya. */}
                            <ul className="grid grid-cols-3 gap-2 pt-1">
                                {[[I.bag, "Pide desde aquí"], [I.track, "Sigue tu pedido"], [I.receipt, "Tu factura lista"]].map(([d, t], i) => (
                                    <li key={t} style={{ "--i": i + 2 }} className={`rise-in ${skin.card} px-2 py-3 flex flex-col items-center gap-1.5 text-center`}>
                                        <span className="w-8 h-8 rounded-xl bg-brand-500/10 text-brand-600 flex items-center justify-center"><Ico d={d} /></span>
                                        <span className={`text-[11px] font-medium ${skin.muted} leading-tight`}>{t}</span>
                                    </li>
                                ))}
                            </ul>
                            <p className={`flex items-center justify-center gap-1.5 text-[11px] ${skin.subtle}`}>
                                <Ico d={I.lock} className="w-3.5 h-3.5" /> Tus datos solo los ve esta tienda.
                            </p>
                        </>
                    )}

                    {step === "confirm" && (
                        <>
                            <div className="text-center pt-2">
                                <div className="ring-grow relative w-20 h-20 mx-auto">
                                    <span className="absolute -inset-2 rounded-full bg-brand-500/15" aria-hidden="true" />
                                    <span className="relative w-20 h-20 rounded-full bg-brand-500 text-brand-ink flex items-center justify-center font-display text-[28px] font-bold"
                                        style={{ backgroundImage: "linear-gradient(145deg, rgb(255 255 255 / .25), rgb(0 0 0 / .08))" }}>
                                        {String(match?.name || "?").trim().split(/\s+/).slice(0, 2).map(x => x.charAt(0)).join("").toUpperCase()}
                                    </span>
                                </div>
                                <p className={`mt-4 text-[13px] ${skin.subtle}`}>¿Eres tú?</p>
                                <p className={`${skin.title} ${skin.ink}`}>{toNameCase(match?.name)}</p>
                                <p className={`text-[13px] ${skin.subtle} tabular-nums`}>{fullDocument}</p>
                            </div>
                            <Primario onClick={confirmMatch} skin={skin}>Sí, soy yo</Primario>
                            {volver("No, corregir la cédula")}
                        </>
                    )}

                    {step === "phone" && (
                        <>
                            <div>
                                <h2 className={`${skin.title} ${skin.ink}`}>Falta tu teléfono</h2>
                                <p className={`text-[13px] ${skin.muted} mt-1`}>Es por donde te confirmamos el pedido y te enviamos la factura.</p>
                            </div>
                            <Campo icon={I.phone} skin={skin}>
                                <input value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === "Enter" && submitPhone()}
                                    type="tel" inputMode="tel" autoComplete="tel" autoFocus placeholder="0414 5550000" className={`${campo} tabular-nums`} />
                            </Campo>
                            <Primario onClick={submitPhone} disabled={!phoneOk} skin={skin}>Entrar a la tienda</Primario>
                            {volver("Volver")}
                        </>
                    )}

                    {step === "register" && (
                        <>
                            <div>
                                <h2 className={`${skin.title} ${skin.ink}`}>Es tu primera vez</h2>
                                <p className={`text-[13px] ${skin.muted} mt-1`}>Deja tus datos y quedas registrado con <span className="font-semibold tabular-nums">{fullDocument}</span>.</p>
                            </div>
                            <Campo icon={I.user} skin={skin}>
                                <input value={name} onChange={e => setName(e.target.value.toUpperCase())} autoComplete="name" autoFocus
                                    placeholder="Nombre completo" className={campo} />
                            </Campo>
                            <Campo icon={I.phone} skin={skin}>
                                <input value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === "Enter" && submitRegister()}
                                    type="tel" inputMode="tel" autoComplete="tel" placeholder="0414 5550000" className={`${campo} tabular-nums`} />
                            </Campo>
                            <Primario onClick={submitRegister} disabled={name.trim().length < 2 || !phoneOk} skin={skin}>Entrar a la tienda</Primario>
                            {volver("Corregir la cédula")}
                        </>
                    )}

                    {err && <p className="text-[13px] font-medium text-red-600 text-center">{err}</p>}
                    <Ayuda store={store} skin={skin} />
                </div>
            </div>
        </CatalogSheet>
    );
}

export function BranchSheet({ store, warehouses, onChoose, currentId = null, panel = "#FFFFFF", logoBg = null }) {
    const skin = sheetSkin(panel);
    return (
        <CatalogSheet skin={skin} onClose={null} label="Elige tu tienda" overlay={VELO} width="sm:max-w-md">
            <Marca store={store} skin={skin} logoBg={logoBg} />
            <div className="overflow-y-auto px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4">
                <div className="rise-in">
                    <h2 className={`${skin.title} ${skin.ink}`}>¿Dónde vas a pedir?</h2>
                    <p className={`text-[13px] ${skin.muted} mt-1`}>
                        {currentId
                            ? "Si cambias de tienda se vacía el carrito: lo disponible cambia en cada una."
                            : "Elige tu tienda para ver lo que hay disponible allí."}
                    </p>
                </div>
                <div className="space-y-2.5">
                    {warehouses.map((w, i) => {
                        const actual = String(w.id) === String(currentId);
                        return (
                            <button key={w.id} type="button" onClick={() => onChoose(w.id)} style={{ "--i": i + 1 }}
                                className={`rise-in w-full px-3.5 py-3.5 rounded-2xl flex items-center gap-3 text-left active:scale-[0.99] transition-all ${actual ? skin.selected : skin.option}`}>
                                <span className="w-11 h-11 rounded-2xl bg-brand-500 text-brand-ink flex items-center justify-center shrink-0">
                                    <Ico d={I.pin} className="w-5 h-5" w={2} />
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className={`block text-[15px] font-semibold ${skin.ink} truncate`}>{toNameCase(w.name)}</span>
                                    <span className={`block text-[12px] ${actual ? "text-brand-600 font-semibold" : skin.subtle}`}>{actual ? "Estás aquí" : "Ver la carta de esta tienda"}</span>
                                </span>
                                <Ico d="M9 5l7 7-7 7" className={`w-4 h-4 ${skin.subtle}`} w={2.2} />
                            </button>
                        );
                    })}
                </div>
                <Ayuda store={store} skin={skin} />
            </div>
        </CatalogSheet>
    );
}
