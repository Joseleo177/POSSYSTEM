import { useState } from "react";
import LegalLink from "../../../components/PublicCatalog/LegalLink";
import { IdentitySheet, BranchSheet } from "../../../components/PublicCatalog/WelcomeSheets";
import { fmtRango, duracion, iniciales, FotoServicio } from "../../../components/PublicCatalog/agendaShared";

// Tema "servicios": la vitrina de un negocio que vende tiempo —barbería, peluquería, spa,
// consultorio, autolavado—. Lo que el cliente viene a hacer es reservar, así que la portada es
// la foto del local con un solo botón ("Reservar cita"), y debajo lo que necesita para
// decidir: los servicios con foto, duración y precio, el local, quién atiende, los productos y
// el horario con el mapa.
//
// Es SOLO presentación, como los otros temas: la reserva (BookingSheet) la monta
// PublicCatalogPage y aquí solo se abre con `agenda.open`. Sin la Agenda de citas encendida el
// tema funciona igual, como lista de precios.
//
// De dónde sale cada cosa (todo se carga desde el sistema, nada está escrito aquí):
//   portada y galería  los banners de Configuración → Vitrina (el primero es la portada)
//   "Por qué venir"    los destacados de la misma pantalla (foto + título + texto)
//   frases             las frases de marca ("Sin cita también te atendemos")
//   fotos de servicios la foto de cada servicio en el Catálogo
//   colores            fondo de la portada y del contenido, y el color de la tienda
export const SERVICIOS_BG = "#141414";
export const SERVICIOS_PANEL = "#F5F0E8";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const CARD = "rounded-3xl bg-white ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]";

/** "Lun – Sáb · 9:00 a. m. – 8:00 p. m." agrupando días con el mismo horario. */
function horarioAgrupado(hours) {
    const por = [1, 2, 3, 4, 5, 6, 0].map(d => {
        const h = hours.find(x => x.weekday === d);
        return { d, txt: h ? fmtRango(h.start_min, h.end_min) : null };
    });
    const grupos = [];
    for (const x of por) {
        const u = grupos[grupos.length - 1];
        if (u && u.txt === x.txt) u.hasta = x.d; else grupos.push({ desde: x.d, hasta: x.d, txt: x.txt });
    }
    return grupos.map(g => ({ dias: g.desde === g.hasta ? DIAS[g.desde] : `${DIAS_CORTOS[g.desde]} – ${DIAS_CORTOS[g.hasta]}`, txt: g.txt || "Cerrado" }));
}

function Monograma({ store, size = "w-10 h-10", text = "text-[15px]" }) {
    if (store?.logo_url) return <img src={store.logo_url} alt="" className={`${size} rounded-full object-cover bg-white/10 ring-1 ring-white/15`} />;
    return (
        <span className={`${size} rounded-full bg-brand-500 text-white font-display font-bold ${text} flex items-center justify-center ring-1 ring-white/15`}>
            {iniciales(store?.name) || "·"}
        </span>
    );
}

// Franjas de barbero, tenues: la firma de la portada cuando la tienda no ha subido una foto.
function Franjas() {
    return (
        <svg className="absolute -right-16 top-0 h-full w-72 opacity-[0.14] pointer-events-none" viewBox="0 0 100 400" preserveAspectRatio="none" aria-hidden="true">
            <defs>
                <pattern id="franja" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
                    <rect width="14" height="40" fill="rgb(var(--c-brand-500))" />
                    <rect x="20" width="6" height="40" fill="#ffffff" />
                </pattern>
            </defs>
            <rect width="100" height="400" fill="url(#franja)" />
        </svg>
    );
}

const Check = () => (
    <svg className="w-4 h-4 text-brand-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M5 13l4 4L19 7" /></svg>
);

function Titulo({ kicker, children, sub }) {
    return (
        <div className="mb-6">
            {kicker && <p className="text-[12px] font-semibold tracking-[0.18em] uppercase text-brand-600">{kicker}</p>}
            <h2 className="font-display text-[30px] sm:text-[38px] font-bold tracking-tight text-neutral-900 leading-tight mt-1">{children}</h2>
            {sub && <p className="text-[15px] text-neutral-500 mt-2 max-w-xl">{sub}</p>}
        </div>
    );
}

export default function CatalogLayout({ catalog, token, agenda }) {
    const {
        store, products, error, fmt, baseCur, altCur, banners = [], features = [],
        warehouses, branch, branchGate, chooseBranch, openBranchGate, gated, saveIdentity,
    } = catalog;
    const bg = store?.bg_color || SERVICIOS_BG;
    const panel = store?.panel_color || SERVICIOS_PANEL;
    const info = agenda?.info || null;
    const reserva = !!(store?.agenda && info);
    const abrir = (initial = {}) => agenda?.open?.(initial);
    const [catServ, setCatServ] = useState("");
    const [todosServ, setTodosServ] = useState(false);

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-2 px-6 text-center" style={{ backgroundColor: bg }}>
                <p className="text-[15px] font-semibold text-white">{error}</p>
                <p className="text-[13px] text-white/60">Verifica el enlace con la tienda.</p>
            </div>
        );
    }

    if (gated || branchGate) {
        return (
            <div className="min-h-screen" style={{ backgroundColor: bg }}>
                {gated
                    ? <IdentitySheet token={token} store={store} onIdentified={saveIdentity} panel={panel} logoBg={bg} />
                    : <BranchSheet store={store} warehouses={warehouses} onChoose={chooseBranch} currentId={branch?.id || null} panel={panel} logoBg={bg} />}
            </div>
        );
    }

    const idsServicio = new Set((info?.services || []).map(s => s.id));
    const todosLosServicios = info?.services || [];
    // Con muchos servicios: pestañas por categoría y los primeros nueve, con "Ver todos".
    const catsServ = [...new Set(todosLosServicios.map(s => s.category_name || "Otros"))];
    const deLaCategoria = todosLosServicios.filter(s => !catServ || (s.category_name || "Otros") === catServ);
    const servicios = todosServ ? deLaCategoria : deLaCategoria.slice(0, 9);
    const productos = (products || []).filter(p => !idsServicio.has(p.id));
    const conFotos = productos.some(p => p.image_url);
    const equipo = (info?.team || []).filter(r => r.kind === "persona");
    const horario = info?.hours?.length ? horarioAgrupado(info.hours) : [];
    const hoyH = info?.hours?.find(h => h.weekday === new Date().getDay());
    const portada = banners[0] || null;
    const galeria = banners.filter(b => b.image_url);
    const frases = store?.highlights || [];
    // El punto marcado en Agenda → Configuración. Sin él, buscar por la dirección encuentra
    // cualquier local con un nombre parecido en otro país: el mapa no se muestra, y "Cómo
    // llegar" busca por la dirección.
    const punto = info?.location || null;
    const lugar = punto ? `${punto.lat},${punto.lng}` : (store?.address ? encodeURIComponent(`${store.name}, ${store.address}`) : null);
    const comoLlegar = punto
        ? `https://www.google.com/maps/dir/?api=1&destination=${punto.lat},${punto.lng}`
        : (lugar ? `https://www.google.com/maps/search/?api=1&query=${lugar}` : null);

    const BotonReservar = ({ className = "", children = "Reservar cita", ...props }) => (
        <button type="button" onClick={() => abrir()} {...props}
            className={`h-12 px-7 rounded-full bg-brand-500 text-white text-[15px] font-semibold shadow-[0_12px_28px_-12px_rgb(var(--c-brand-600)/0.9)] hover:brightness-110 active:scale-[0.98] transition ${className}`}>
            {children}
        </button>
    );

    return (
        <div className="min-h-screen" style={{ backgroundColor: panel }}>
            {store?.announcement && (
                <div className="text-center text-[13px] font-medium text-white bg-brand-600 px-4 py-2">
                    {store.announcement.link
                        ? <a href={store.announcement.link} className="hover:underline">{store.announcement.text}</a>
                        : store.announcement.text}
                </div>
            )}

            {/* Cabecera */}
            <header className="sticky top-0 z-30 border-b border-white/[0.06] backdrop-blur" style={{ backgroundColor: `${bg}EE` }}>
                <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-3">
                    <Monograma store={store} />
                    <div className="min-w-0 flex-1">
                        <p className="font-display text-[16px] font-bold text-white truncate leading-tight">{store?.name}</p>
                        {warehouses.length > 1 && branch && (
                            <button type="button" onClick={openBranchGate} className="text-[12px] text-white/60 hover:text-white truncate">{branch.name} · cambiar</button>
                        )}
                    </div>
                    <nav className="hidden md:flex items-center gap-6 text-[13px] font-medium text-white/70 mr-2">
                        {todosLosServicios.length > 0 && <a href="#servicios" className="hover:text-white">Servicios</a>}
                        {galeria.length > 1 && <a href="#local" className="hover:text-white">El local</a>}
                        {equipo.length > 0 && <a href="#equipo" className="hover:text-white">Equipo</a>}
                        {productos.length > 0 && <a href="#productos" className="hover:text-white">Productos</a>}
                        <a href="#visitanos" className="hover:text-white">Visítanos</a>
                    </nav>
                    {reserva && <BotonReservar className="!h-10 !px-5 !text-[13px] hidden sm:block">Reservar</BotonReservar>}
                </div>
            </header>

            {/* Portada: la foto del local si la hay */}
            <section className="relative overflow-hidden" style={{ backgroundColor: bg }}>
                {portada?.image_url ? (
                    <picture>
                        <source media="(max-width: 640px)" srcSet={portada.image_mobile_url || portada.image_url} />
                        <img src={portada.image_url} alt={portada.alt_text || store?.name || ""} className="absolute inset-0 w-full h-full object-cover" />
                    </picture>
                ) : <Franjas />}
                <div className="absolute inset-0" style={{ background: portada?.image_url
                    ? `linear-gradient(90deg, ${bg}F2 0%, ${bg}B3 45%, ${bg}33 100%), linear-gradient(0deg, ${bg} 0%, transparent 35%)`
                    : "radial-gradient(ellipse at top left, rgba(255,255,255,0.07), transparent 60%)" }} />
                <div className={`relative max-w-6xl mx-auto px-5 ${portada?.image_url ? "pt-28 pb-20 sm:pt-40 sm:pb-28 min-h-[78vh] sm:min-h-[86vh] flex flex-col justify-end" : "pt-16 pb-16 sm:pt-24 sm:pb-24"}`}>
                    {info?.hours?.length > 0 && (
                        <p className="inline-flex self-start items-center gap-2 text-[12px] font-medium text-white/85 rounded-full bg-white/10 backdrop-blur border border-white/15 px-3 h-8">
                            <span className={`w-1.5 h-1.5 rounded-full ${hoyH ? "bg-emerald-400" : "bg-white/40"}`} />
                            {hoyH ? `Hoy de ${fmtRango(hoyH.start_min, hoyH.end_min).replace(" – ", " a ")}` : "Hoy cerrado"}
                        </p>
                    )}
                    <h1 className="font-display text-white font-bold tracking-tight text-[46px] leading-[1.02] sm:text-[76px] mt-5 max-w-3xl">{store?.name}</h1>
                    {store?.slogan && <p className="text-white/75 text-[17px] sm:text-[21px] mt-4 max-w-xl">{store.slogan}</p>}
                    <div className="mt-8 flex flex-col sm:flex-row gap-3">
                        {reserva && <BotonReservar className="sm:!h-14 sm:!px-9 sm:!text-[16px]" />}
                        {servicios.length > 0 && (
                            <a href="#servicios" className="h-12 sm:h-14 px-7 rounded-full border border-white/25 bg-white/5 backdrop-blur text-white text-[15px] font-medium flex items-center justify-center hover:bg-white/10">Ver servicios y precios</a>
                        )}
                    </div>
                    {store?.address && (
                        <p className="mt-8 text-[13px] text-white/60 flex items-center gap-2">
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 21s-7-6.2-7-11.5a7 7 0 1114 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" strokeWidth={1.8} /></svg>
                            {store.address}
                        </p>
                    )}
                </div>
            </section>

            {/* Frases de la marca */}
            {frases.length > 0 && (
                <div className="border-b border-black/[0.06] bg-white/60">
                    <div className="max-w-6xl mx-auto px-5 py-4 flex flex-wrap justify-center gap-x-8 gap-y-2">
                        {frases.map(f => <span key={f} className="inline-flex items-center gap-2 text-[14px] font-medium text-neutral-800"><Check />{f}</span>)}
                    </div>
                </div>
            )}

            <main className="max-w-6xl mx-auto px-5 pb-32 sm:pb-20">
                {/* Servicios */}
                {todosLosServicios.length > 0 && (
                    <section id="servicios" className="pt-16 scroll-mt-20">
                        <Titulo kicker="Nuestra carta" sub={altCur ? `Precios en ${baseCur?.symbol || "$"}, también en ${altCur.symbol} a la tasa del día. Se paga en el local.` : "Se paga en el local."}>
                            Servicios
                        </Titulo>
                        {catsServ.length > 1 && (
                            <div className="-mx-5 px-5 mb-5 flex gap-2 overflow-x-auto scrollbar-hide">
                                {["", ...catsServ].map(c => (
                                    <button key={c || "todos"} type="button" onClick={() => { setCatServ(c); setTodosServ(false); }}
                                        className={`h-10 px-4 rounded-full text-[14px] font-semibold whitespace-nowrap shrink-0 transition-colors ${catServ === c ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 ring-1 ring-black/[0.08] hover:ring-black/20"}`}>
                                        {c || "Todos"}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {servicios.map(s => (
                                <article key={s.id} className={`${CARD} overflow-hidden flex sm:flex-col group`}>
                                    <div className="relative w-32 sm:w-full shrink-0 sm:aspect-[4/3] overflow-hidden">
                                        <FotoServicio s={s} className="w-full h-full sm:absolute sm:inset-0 transition-transform duration-500 group-hover:scale-[1.04]" icono="w-9 h-9" />
                                        <span className="hidden sm:inline-flex absolute top-3 left-3 h-7 px-2.5 rounded-full bg-black/55 backdrop-blur text-white text-[12px] font-medium items-center">{duracion(s.duration_min)}</span>
                                    </div>
                                    <div className="p-4 sm:p-5 flex-1 flex flex-col min-w-0">
                                        <h3 className="text-[16px] sm:text-[18px] font-semibold text-neutral-900 leading-snug">{s.name}</h3>
                                        <p className="text-[13px] text-neutral-500 mt-1 line-clamp-2">
                                            <span className="sm:hidden">{duracion(s.duration_min)}{s.short_description ? " · " : ""}</span>{s.short_description}
                                        </p>
                                        <div className="mt-auto pt-3 flex items-center justify-between gap-3">
                                            <p className="tabular-nums leading-tight">
                                                <span className="text-[18px] font-bold text-neutral-900">{fmt(s.price, baseCur)}</span>
                                                {altCur && <span className="block text-[12px] text-neutral-500">{fmt(s.price, altCur)}</span>}
                                            </p>
                                            {reserva && (
                                                <button type="button" onClick={() => abrir({ serviceId: s.id })}
                                                    className="shrink-0 h-10 px-5 rounded-full bg-neutral-900 text-white text-[13px] font-semibold hover:bg-brand-600 active:scale-[0.97] transition-colors">
                                                    Reservar
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                        {!todosServ && deLaCategoria.length > servicios.length && (
                            <div className="mt-6 flex justify-center">
                                <button type="button" onClick={() => setTodosServ(true)}
                                    className="h-12 px-6 rounded-full bg-white ring-1 ring-black/[0.1] text-[14px] font-semibold text-neutral-900 hover:ring-black/25">
                                    Ver los {deLaCategoria.length} servicios
                                </button>
                            </div>
                        )}
                    </section>
                )}

                {/* El local */}
                {galeria.length > 1 && (
                    <section id="local" className="pt-20 scroll-mt-20">
                        <Titulo kicker="El local">Ven a conocernos</Titulo>
                        <div className="grid grid-cols-2 sm:grid-cols-4 auto-rows-[150px] sm:auto-rows-[200px] gap-3">
                            {galeria.slice(0, 7).map((b, i, arr) => (
                                // La primera, grande; si después quedan impares, la última se estira
                                // para no dejar un hueco en la cuadrícula.
                                <div key={b.id} className={`overflow-hidden rounded-3xl bg-neutral-200 ${i === 0 ? "col-span-2 row-span-2" : (i === arr.length - 1 && (arr.length - 1) % 2 === 1 ? "col-span-2" : "")}`}>
                                    <img src={b.image_url} alt={b.alt_text || ""} loading="lazy" className="w-full h-full object-cover hover:scale-[1.03] transition-transform duration-500" />
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Por qué venir: los destacados con foto y texto */}
                {features.length > 0 && (
                    <section className="pt-20 space-y-10">
                        {features.map((f, i) => (
                            <div key={f.id} className={`grid sm:grid-cols-2 gap-6 sm:gap-12 items-center ${i % 2 ? "sm:[&>*:first-child]:order-2" : ""}`}>
                                {f.image_url
                                    ? <img src={f.image_url} alt={f.alt_text || ""} loading="lazy" className="w-full aspect-[4/3] object-cover rounded-3xl" />
                                    : <div />}
                                <div>
                                    {f.heading && <h3 className="font-display text-[26px] sm:text-[32px] font-bold tracking-tight text-neutral-900 leading-tight">{f.heading}</h3>}
                                    {f.body && <p className="text-[16px] text-neutral-600 mt-3 leading-relaxed">{f.body}</p>}
                                    {reserva && i === features.length - 1 && <BotonReservar className="mt-6" />}
                                </div>
                            </div>
                        ))}
                    </section>
                )}

                {/* Equipo */}
                {equipo.length > 0 && (
                    <section id="equipo" className="pt-20 scroll-mt-20">
                        <Titulo kicker="El equipo" sub="Elige con quién, o reserva con quien esté libre.">Quién te atiende</Titulo>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {equipo.map(r => (
                                <button key={r.id} type="button" onClick={() => reserva && abrir({ resourceId: r.id })} disabled={!reserva}
                                    className={`${CARD} p-6 flex flex-col items-center gap-3 text-center hover:-translate-y-0.5 transition-transform disabled:cursor-default`}>
                                    <span className="w-24 h-24 rounded-full flex items-center justify-center text-white font-display text-[32px] font-bold ring-4 ring-white shadow-lg" style={{ background: r.color || "#334155" }}>{iniciales(r.name)}</span>
                                    <span className="text-[17px] font-semibold text-neutral-900">{r.name}</span>
                                    {reserva && <span className="text-[13px] font-semibold text-brand-600">Reservar con {r.name.split(" ")[0]}</span>}
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {/* Productos */}
                {productos.length > 0 && (
                    <section id="productos" className="pt-20 scroll-mt-20">
                        <Titulo kicker="Para llevar" sub="Los usamos en el sillón y te los llevas en el local.">Productos</Titulo>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {productos.map(p => (
                                <div key={p.id} className={`${CARD} overflow-hidden`}>
                                    {conFotos && (
                                        <div className="aspect-square bg-neutral-100 flex items-center justify-center overflow-hidden">
                                            {p.image_url
                                                ? <img src={p.image_url} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                                                : <span className="font-display text-[34px] font-bold text-neutral-300">{iniciales(p.name)}</span>}
                                        </div>
                                    )}
                                    <div className="p-4">
                                        <p className="text-[15px] font-semibold text-neutral-900 leading-snug line-clamp-2">{p.name}</p>
                                        {p.short_description && <p className="text-[12px] text-neutral-500 line-clamp-1 mt-0.5">{p.short_description}</p>}
                                        <p className="text-[16px] font-bold text-neutral-900 mt-2 tabular-nums">{fmt(p.price, baseCur)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Horario y ubicación */}
                <section id="visitanos" className="pt-20 scroll-mt-20">
                    <Titulo kicker="Visítanos">Horario y ubicación</Titulo>
                    <div className="grid lg:grid-cols-5 gap-4">
                        <div className={`${CARD} p-6 ${punto ? "lg:col-span-2" : "lg:col-span-5"} flex flex-col`}>
                            {horario.length > 0 && (
                                <div className="divide-y divide-black/[0.06]">
                                    {horario.map(h => (
                                        <div key={h.dias} className="py-2.5 flex justify-between gap-4 text-[14px]">
                                            <span className="text-neutral-600">{h.dias}</span>
                                            <span className={`tabular-nums text-right ${h.txt === "Cerrado" ? "text-neutral-400" : "text-neutral-900 font-medium"}`}>{h.txt}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="mt-5 space-y-1.5 text-[14px] text-neutral-700">
                                {store?.address && <p>{store.address}</p>}
                                {store?.phone && <a href={`tel:${store.phone.split("/")[0].replace(/\s/g, "")}`} className="block tabular-nums hover:underline">{store.phone}</a>}
                            </div>
                            <div className="flex flex-wrap gap-2 pt-5 mt-auto">
                                {comoLlegar && <a href={comoLlegar} target="_blank" rel="noreferrer" className="h-10 px-4 rounded-full bg-neutral-900 text-white text-[13px] font-semibold flex items-center hover:bg-neutral-800">Cómo llegar</a>}
                                {store?.socials?.instagram && <a href={store.socials.instagram} target="_blank" rel="noreferrer" className="h-10 px-4 rounded-full bg-black/[0.05] text-[13px] font-semibold text-neutral-800 flex items-center hover:bg-black/[0.08]">Instagram</a>}
                                {store?.socials?.facebook && <a href={store.socials.facebook} target="_blank" rel="noreferrer" className="h-10 px-4 rounded-full bg-black/[0.05] text-[13px] font-semibold text-neutral-800 flex items-center hover:bg-black/[0.08]">Facebook</a>}
                            </div>
                        </div>
                        {punto && (
                            <div className={`${CARD} overflow-hidden lg:col-span-3 min-h-[280px]`}>
                                <iframe title="Mapa" src={`https://www.google.com/maps?q=${punto.lat},${punto.lng}&z=17&output=embed`} loading="lazy" className="w-full h-full min-h-[280px] border-0" referrerPolicy="no-referrer-when-downgrade" />
                            </div>
                        )}
                    </div>
                </section>

                {/* Cierre */}
                {reserva && (
                    <section className="mt-20 rounded-[32px] overflow-hidden relative" style={{ backgroundColor: bg }}>
                        <Franjas />
                        <div className="relative px-6 py-12 sm:px-12 sm:py-16 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                            <div>
                                <h2 className="font-display text-[28px] sm:text-[36px] font-bold text-white tracking-tight leading-tight">¿Listo para tu próxima cita?</h2>
                                <p className="text-white/65 text-[15px] mt-2">Elige la hora que te quede mejor. Sin llamadas ni esperas.</p>
                            </div>
                            <BotonReservar className="sm:!h-14 sm:!px-9 shrink-0" />
                        </div>
                    </section>
                )}

                <footer className="pt-14 pb-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-neutral-500">
                    <p>© {new Date().getFullYear()} {store?.name}{store?.rif ? ` · ${store.rif}` : ""}</p>
                    <LegalLink className="text-neutral-500 hover:text-neutral-800" />
                </footer>
            </main>

            {/* En el teléfono, reservar queda siempre a mano */}
            {reserva && (
                <div className="sm:hidden fixed inset-x-0 bottom-0 z-30 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/30 to-transparent">
                    <BotonReservar className="w-full" />
                </div>
            )}
        </div>
    );
}
