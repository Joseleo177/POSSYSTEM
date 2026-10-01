import { useState, useEffect, useRef } from "react";
import { api } from "../services/api";
import { useTheme } from "../hooks/useTheme";
import { NexusLogo, NexusMark } from "./ui/NexusLogo";

// Pantalla de entrada con forma de portada informativa: quien llega por primera vez entiende
// qué es el sistema, y quien entra a trabajar tiene el formulario a la vista sin bajar.
//
// El formulario vive en el hero, no al final: es la pantalla de todos los días del cajero, y
// una portada larga con el acceso escondido sería un estorbo cada mañana. En el teléfono va
// justo después del titular, antes del resto del texto.
//
// Los textos describen lo que el sistema hace hoy. Nada de cifras de clientes ni de premios:
// lo que no se puede respaldar no va en la portada.

const VERSION = "3.1.5";

// Iconos (contorno, 24px) de las funciones.
const IC = {
    pos:      "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
    stock:    "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    money:    "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    credit:   "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    cash:     "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
    store:    "M3 9l1.5-5h15L21 9M3 9h18M3 9v10a1 1 0 001 1h5v-6h6v6h5a1 1 0 001-1V9M3 9a3 3 0 006 0m0 0a3 3 0 006 0m0 0a3 3 0 006 0",
    chart:    "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    shield:   "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    food:     "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    bolt:     "M13 10V3L4 14h7v7l9-11h-7z",
    check:    "M5 13l4 4L19 7",
    arrow:    "M13 7l5 5m0 0l-5 5m5-5H6",
};

const FUNCIONES = [
    { ic: "pos",    titulo: "Punto de venta",            texto: "Cobra en efectivo, punto, pago móvil o divisas. Combina formas de pago y da el vuelto en la moneda que tengas." },
    { ic: "money",  titulo: "Bolívares y dólares",       texto: "Precios en referencia y cobro en bolívares a la tasa del día. El sistema hace la cuenta, no el cajero." },
    { ic: "stock",  titulo: "Inventario por sucursal",   texto: "Existencias por almacén, transferencias entre tiendas, ajustes controlados y el historial de cada producto." },
    { ic: "credit", titulo: "Cuentas por cobrar y pagar", texto: "Ventas a crédito con su vencimiento, cobro de varias facturas en un solo pago y pagos a proveedores." },
    { ic: "cash",   titulo: "Caja y arqueo",             texto: "Cada cajero cierra su turno con lo esperado contra lo contado, por forma de pago y por moneda." },
    { ic: "store",  titulo: "Catálogo en línea",         texto: "Tu tienda publicada con fotos y precios. Los pedidos llegan al sistema y la conversación sigue por WhatsApp." },
    { ic: "chart",  titulo: "Reportes",                  texto: "Ventas, márgenes y antigüedad de la cartera en pantalla, en PDF o en Excel, por sucursal y por fecha." },
    { ic: "shield", titulo: "Roles y permisos",          texto: "Cada empleado ve y hace solo lo que le toca, en las sucursales que le corresponden." },
    { ic: "food",   titulo: "Restaurantes y bares",      texto: "Cuentas abiertas, comandas a cocina e impresión térmica, pensado para trabajar desde una tablet." },
];

const PASOS = [
    { titulo: "Configura tu empresa", texto: "Datos fiscales, sucursales, cajas y las formas de pago que aceptas." },
    { titulo: "Carga tus productos",  texto: "Precios en referencia, existencias por sucursal y fotos para tu catálogo." },
    { titulo: "Vende y mide",         texto: "Cobra, cierra caja y mira cómo va el negocio con los reportes del día." },
];

function Icono({ d, className = "w-5 h-5" }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={d} />
        </svg>
    );
}

// Logo oficial: letras en el color del texto (negro en claro, blanco en oscuro) y el rayo
// turquesa de la marca, fijo.
function Logo({ className = "h-8" }) {
    return <NexusLogo className={`${className} w-auto text-content dark:text-white`} />;
}

const INPUT = "w-full h-11 rounded-xl border border-border dark:border-white/15 bg-white dark:bg-white/[0.04] text-[15px] text-content dark:text-white placeholder:text-content-subtle/60 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition-colors";

// Equipo de trabajo: este navegador ya inició sesión alguna vez. NO se guarda quién: al cerrar
// sesión casi siempre entra otro cajero, y ver el usuario del anterior invitaba a equivocarse.
// Solo sirve para abrir el acceso de una vez, vacío, en la caja.
const EQUIPO = "nexus_equipo_en_uso";
const esEquipoDeTrabajo = () => {
    try {
        // Versiones anteriores guardaban el último usuario: se borra para no dejarlo a la vista.
        localStorage.removeItem("nexus_ultimo_usuario");
        return localStorage.getItem(EQUIPO) === "1";
    } catch { return false; }
};

// Ilustración del producto en el hero: una venta cobrada en bolívares, con su equivalente en
// referencia, la tasa y por dónde entró el dinero. Datos de ejemplo —se lee como una captura
// del sistema, no como una cifra del negocio— y oculta para lectores de pantalla.
function Vista() {
    const barras = [38, 52, 44, 70, 58, 86, 64];
    return (
        <div aria-hidden="true" className="relative mx-auto w-full max-w-md lg:max-w-none select-none">
            <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-brand-500/25 via-cyan-400/10 to-transparent blur-2xl" />
            <div className="relative rounded-3xl border border-border/70 dark:border-white/10 bg-white/95 dark:bg-surface-dark-2/95 backdrop-blur shadow-[0_30px_80px_-30px_rgb(0_0_0/0.45)] overflow-hidden">
                <div className="h-10 px-4 flex items-center gap-1.5 border-b border-border/60 dark:border-white/[0.06]">
                    <span className="w-2.5 h-2.5 rounded-full bg-content-subtle/25" />
                    <span className="w-2.5 h-2.5 rounded-full bg-content-subtle/25" />
                    <span className="w-2.5 h-2.5 rounded-full bg-content-subtle/25" />
                    <span className="ml-3 text-[12px] text-content-subtle">Caja · Sucursal Centro</span>
                </div>

                <div className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[12px] text-content-subtle">Venta registrada</p>
                            <p className="text-[16px] font-semibold text-content dark:text-white">Factura A-0093</p>
                        </div>
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">
                            <Icono d={IC.check} className="w-3.5 h-3.5" />
                            Pagada
                        </span>
                    </div>

                    <div className="rounded-2xl bg-surface-2 dark:bg-white/[0.04] px-4 py-3.5 flex items-end justify-between gap-3">
                        <span className="text-[13px] text-content-subtle pb-1">Total</span>
                        <div className="text-right">
                            <div className="text-[28px] font-bold tracking-tight leading-none text-content dark:text-white tabular-nums">
                                <span className="text-[0.55em] font-medium text-content-subtle mr-1">Bs.</span>17493.20
                            </div>
                            <div className="mt-1.5 text-[12px] text-content-subtle tabular-nums">≈ Ref. 20.40 · tasa 857.8876</div>
                        </div>
                    </div>

                    <ul className="divide-y divide-border/60 dark:divide-white/[0.06] text-[13px]">
                        {[["Pago móvil", "#6366f1", "Bs. 9986.68"], ["Efectivo $", "#22c55e", "Ref. 8.75"]].map(([caja, color, monto]) => (
                            <li key={caja} className="py-2 flex items-center justify-between gap-3">
                                <span className="inline-flex items-center gap-2 text-content-muted dark:text-white/75">
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                                    {caja}
                                </span>
                                <span className="font-medium text-content dark:text-white tabular-nums">{monto}</span>
                            </li>
                        ))}
                    </ul>

                    <div>
                        <div className="flex items-baseline justify-between">
                            <span className="text-[12px] text-content-subtle">Ventas de la semana</span>
                            <span className="text-[12px] font-medium text-emerald-700 dark:text-emerald-400">Hoy, el mejor día</span>
                        </div>
                        <div className="mt-2 h-16 flex items-end gap-1.5">
                            {barras.map((h, i) => (
                                <span key={i} className={`flex-1 rounded-md ${i === 5 ? "bg-brand-500" : "bg-brand-500/25 dark:bg-brand-400/25"}`} style={{ height: `${h}%` }} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Viñeta flotante: lo que el sistema hizo solo en esa venta. */}
            <div className="hidden sm:flex absolute -left-5 -bottom-5 items-center gap-2.5 rounded-2xl bg-white dark:bg-surface-dark-2 border border-border/70 dark:border-white/10 shadow-xl px-3.5 py-2.5">
                <span className="w-8 h-8 rounded-full bg-emerald-500/[0.12] text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Icono d={IC.money} className="w-4 h-4" />
                </span>
                <span className="text-[13px] leading-tight">
                    <span className="block font-semibold text-content dark:text-white">Tasa del día aplicada</span>
                    <span className="block text-content-subtle">Sin hacer cuentas a mano</span>
                </span>
            </div>
        </div>
    );
}

export default function LoginScreen({ onLogin }) {
    const { dark, toggle } = useTheme();
    const [form, setForm] = useState({ username: "", password: "" });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPass, setShowPass] = useState(false);
    // El acceso es un modal que se abre con "Iniciar sesión". En un equipo de trabajo ya está
    // abierto y vacío, con el cursor en el usuario: el cajero que entra no busca nada.
    const [open, setOpen] = useState(esEquipoDeTrabajo);
    const userRef = useRef(null);

    // Al abrir, el cursor va al usuario. Escape cierra, como cualquier otro modal del sistema.
    useEffect(() => {
        if (!open) return;
        const t = setTimeout(() => userRef.current?.focus(), 60);
        const onEsc = e => { if (e.key === "Escape") setOpen(false); };
        window.addEventListener("keydown", onEsc);
        return () => { clearTimeout(t); window.removeEventListener("keydown", onEsc); };
    }, [open]);

    const handleSubmit = async () => {
        if (!form.username || !form.password) return;
        setError("");
        setLoading(true);
        try {
            const res = await api.auth.login(form);
            localStorage.setItem("pos_token", res.token);
            try { localStorage.setItem(EQUIPO, "1"); } catch { /* modo privado */ }
            onLogin(res.employee);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const onKey = e => e.key === "Enter" && handleSubmit();

    const abrirAcceso = () => { setError(""); setOpen(true); };


    const anio = new Date().getFullYear();

    return (
        <div className="min-h-screen bg-surface-2 dark:bg-surface-dark text-content dark:text-white">

            {/* ── Cabecera ── */}
            <header className="sticky top-0 z-40 bg-surface-2/80 dark:bg-surface-dark/80 backdrop-blur-md border-b border-border/50 dark:border-white/[0.06]">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
                    <Logo />
                    <nav className="hidden md:flex items-center gap-1 ml-6">
                        {[["#funciones", "Funciones"], ["#como-funciona", "Cómo funciona"]].map(([href, label]) => (
                            <a key={href} href={href}
                                className="h-9 px-3 rounded-lg inline-flex items-center text-[14px] font-medium text-content-muted dark:text-white/70 hover:text-content dark:hover:text-white hover:bg-surface-3/60 dark:hover:bg-white/[0.06] transition-colors">
                                {label}
                            </a>
                        ))}
                    </nav>
                    <div className="ml-auto flex items-center gap-2">
                        <button
                            onClick={toggle}
                            title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                            aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-content-subtle hover:text-content dark:text-white/60 dark:hover:text-white hover:bg-surface-3/60 dark:hover:bg-white/[0.06] transition-colors"
                        >
                            {dark ? (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                            )}
                        </button>
                        <button onClick={abrirAcceso}
                            className="btn-accent h-10 px-4 rounded-xl text-[14px] font-semibold">
                            Iniciar sesión
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Hero ── */}
            <section className="relative overflow-hidden">
                {/* Fondo: rejilla tenue que se desvanece y dos halos del color de la marca. */}
                <div aria-hidden="true" className="absolute inset-0 pointer-events-none
                    bg-[linear-gradient(to_right,rgb(0_0_0/0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgb(0_0_0/0.045)_1px,transparent_1px)]
                    dark:bg-[linear-gradient(to_right,rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.05)_1px,transparent_1px)]
                    bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
                <div aria-hidden="true" className="absolute -top-40 -left-32 w-[560px] h-[560px] rounded-full bg-brand-500/20 dark:bg-brand-500/25 blur-[120px] pointer-events-none" />
                <div aria-hidden="true" className="absolute top-20 -right-40 w-[480px] h-[480px] rounded-full bg-cyan-400/15 dark:bg-cyan-400/10 blur-[120px] pointer-events-none" />

                <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-20 lg:pt-20 lg:pb-28 grid gap-14 lg:gap-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] items-center">
                    <div>
                        <span className="inline-flex items-center gap-2 h-8 pl-2.5 pr-3.5 rounded-full border border-brand-500/25 bg-white/70 dark:bg-white/[0.05] text-[13px] font-medium text-content-muted dark:text-white/80 backdrop-blur">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                            Hecho para negocios en Venezuela
                        </span>
                        <h1 className="mt-5 text-[36px] sm:text-[48px] lg:text-[56px] font-bold tracking-[-0.03em] leading-[1.04] text-content dark:text-white">
                            Tu negocio en orden, en{" "}
                            <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-cyan-500 dark:from-brand-400 dark:via-brand-300 dark:to-cyan-300 bg-clip-text text-transparent">
                                bolívares y dólares
                            </span>
                            , desde un solo lugar.
                        </h1>
                        <p className="mt-5 text-[16px] sm:text-[18px] text-content-muted dark:text-white/70 leading-relaxed max-w-xl">
                            Ventas, inventario por sucursal, cuentas por cobrar y caja al día. Con la tasa
                            aplicada sola y tu catálogo recibiendo pedidos.
                        </p>
                        <ul className="mt-6 grid sm:grid-cols-2 gap-x-6 gap-y-3 max-w-xl">
                            {["Precios en Ref., cobro en Bs.", "Varias sucursales y cajas", "Funciona en tablet y teléfono", "Impresión térmica y carta"].map(t => (
                                <li key={t} className="flex items-center gap-2.5 text-[15px] text-content dark:text-white/90">
                                    <span className="w-6 h-6 rounded-full bg-emerald-500/[0.12] text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                        <Icono d={IC.check} className="w-3.5 h-3.5" />
                                    </span>
                                    {t}
                                </li>
                            ))}
                        </ul>
                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            <button onClick={abrirAcceso}
                                className="btn-accent h-12 px-6 rounded-full text-[15px] font-semibold inline-flex items-center gap-2 active:scale-[0.98] transition">
                                Iniciar sesión
                                <Icono d={IC.arrow} className="w-4 h-4" />
                            </button>
                            <a href="#funciones"
                                className="h-12 px-5 rounded-full border border-border dark:border-white/15 bg-white/70 dark:bg-white/[0.04] inline-flex items-center text-[15px] font-semibold text-content dark:text-white hover:bg-white dark:hover:bg-white/[0.08] transition-colors">
                                Ver todo lo que hace
                            </a>
                        </div>
                    </div>

                    <Vista />
                </div>
            </section>

            {/* ── Funciones ── */}
            <section id="funciones" className="scroll-mt-16 border-t border-border/50 dark:border-white/[0.06] bg-white dark:bg-white/[0.02]">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-24">
                    <div className="max-w-2xl">
                        <p className="text-[14px] font-semibold text-brand-600 dark:text-brand-400">Funciones</p>
                        <h2 className="mt-2 text-[30px] sm:text-[38px] font-bold tracking-[-0.02em] leading-tight text-content dark:text-white">
                            Todo lo que pasa en tu negocio, en un solo sistema
                        </h2>
                        <p className="mt-3 text-[16px] text-content-muted dark:text-white/70 leading-relaxed">
                            De la caja al inventario y de las cuentas a los reportes, sin hojas de cálculo aparte.
                        </p>
                    </div>

                    <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {FUNCIONES.map(f => (
                            <article key={f.titulo}
                                className="group rounded-2xl border border-border/70 dark:border-white/[0.08] bg-surface-2/50 dark:bg-white/[0.02] p-6 transition-colors hover:border-brand-500/40 hover:bg-white dark:hover:bg-white/[0.04]">
                                <span className="w-11 h-11 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center transition-colors group-hover:bg-brand-500 group-hover:text-white">
                                    <Icono d={IC[f.ic]} />
                                </span>
                                <h3 className="mt-4 text-[17px] font-semibold text-content dark:text-white">{f.titulo}</h3>
                                <p className="mt-1.5 text-[14px] text-content-muted dark:text-white/65 leading-relaxed">{f.texto}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Cómo funciona ── */}
            <section id="como-funciona" className="scroll-mt-16">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-24">
                    <div className="max-w-2xl">
                        <p className="text-[14px] font-semibold text-brand-600 dark:text-brand-400">Cómo funciona</p>
                        <h2 className="mt-2 text-[30px] sm:text-[38px] font-bold tracking-[-0.02em] leading-tight text-content dark:text-white">
                            Listo para vender en tres pasos
                        </h2>
                    </div>
                    <ol className="mt-10 grid md:grid-cols-3 gap-4">
                        {PASOS.map((p, i) => (
                            <li key={p.titulo} className="relative rounded-2xl border border-border/70 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-6">
                                <span className="text-[44px] font-bold leading-none tracking-tight bg-gradient-to-br from-brand-500 to-cyan-400 bg-clip-text text-transparent tabular-nums">
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                                <h3 className="mt-4 text-[17px] font-semibold text-content dark:text-white">{p.titulo}</h3>
                                <p className="mt-1.5 text-[14px] text-content-muted dark:text-white/65 leading-relaxed">{p.texto}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* ── Cierre ── */}
            <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 lg:pb-24">
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 dark:from-brand-600 dark:to-brand-900 px-6 py-12 sm:px-12 sm:py-14 text-center">
                    <div aria-hidden="true" className="absolute -top-24 left-1/2 -translate-x-1/2 w-[520px] h-[260px] rounded-full bg-white/15 blur-[90px] pointer-events-none" />
                    <h2 className="relative text-[26px] sm:text-[34px] font-bold tracking-tight text-white">¿Listo para empezar el día?</h2>
                    <p className="relative mt-2 text-[16px] text-white/80">Entra con tu usuario y retoma donde lo dejaste.</p>
                    <button onClick={abrirAcceso}
                        className="relative mt-7 inline-flex items-center gap-2 h-12 px-6 rounded-full bg-white text-brand-700 text-[15px] font-semibold hover:bg-white/90 active:scale-[0.98] transition">
                        Iniciar sesión
                        <Icono d={IC.arrow} className="w-4 h-4" />
                    </button>
                </div>
            </section>

            {/* ── Pie ── */}
            <footer className="border-t border-border/50 dark:border-white/[0.06]">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <Logo />
                    <p className="text-[13px] text-content-subtle text-center sm:text-right">
                        Versión {VERSION} · © {anio} Nexus Global Technologies
                    </p>
                </div>
            </footer>

            {/* ── Acceso (modal) ──
                En el teléfono sube como hoja desde abajo; en escritorio es un diálogo centrado. */}
            {open && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-acceso">
                    <div className="absolute inset-0 bg-black/55 backdrop-blur-sm overlay-in" onClick={() => setOpen(false)} />
                    <div className="relative w-full sm:max-w-[420px] rounded-t-3xl sm:rounded-3xl bg-white dark:bg-surface-dark-2 border-t sm:border border-border/70 dark:border-white/10 shadow-2xl px-6 pt-3 pb-6 sm:p-8 modal-in">
                        <div className="sm:hidden flex justify-center pb-3" aria-hidden="true">
                            <span className="w-10 h-1 rounded-full bg-border dark:bg-white/20" />
                        </div>
                        <button
                            onClick={() => setOpen(false)}
                            aria-label="Cerrar"
                            className="absolute top-3 right-3 sm:top-4 sm:right-4 w-9 h-9 rounded-lg flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/[0.06] transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>

                        <NexusMark className="w-11 h-11 text-content dark:text-white" />
                        <h2 id="titulo-acceso" className="mt-4 text-[22px] font-bold tracking-tight text-content dark:text-white">
                            Inicia sesión
                        </h2>
                        <p className="mt-1 text-[14px] text-content-subtle">Entra con el usuario que te dio tu empresa.</p>

                        <div className="mt-6 space-y-4">
                            <div>
                                <label htmlFor="login-user" className="block text-[13px] font-medium text-content-muted dark:text-white/70 mb-1.5">Usuario</label>
                                <div className="relative group">
                                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-subtle group-focus-within:text-brand-500 transition-colors">
                                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    </span>
                                    <input
                                        id="login-user"
                                        ref={userRef}
                                        className={`${INPUT} pl-11 pr-4`}
                                        placeholder="Tu usuario"
                                        autoComplete="username"
                                        autoCapitalize="none"
                                        value={form.username}
                                        onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                                        onKeyDown={onKey}
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="login-pass" className="block text-[13px] font-medium text-content-muted dark:text-white/70 mb-1.5">Contraseña</label>
                                <div className="relative group">
                                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-content-subtle group-focus-within:text-brand-500 transition-colors">
                                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                    </span>
                                    <input
                                        id="login-pass"
                                        className={`${INPUT} pl-11 pr-11`}
                                        type={showPass ? "text" : "password"}
                                        placeholder="••••••••"
                                        autoComplete="current-password"
                                        value={form.password}
                                        onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                                        onKeyDown={onKey}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPass(!showPass)}
                                        aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                                        title={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                                        className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-white transition-colors"
                                    >
                                        {showPass ? (
                                            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                        ) : (
                                            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div role="alert" className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300 text-[13px] font-medium animate-shake">
                                    <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    {error}
                                </div>
                            )}

                            <button
                                onClick={handleSubmit}
                                disabled={loading || !form.username || !form.password}
                                className="btn-accent w-full h-12 rounded-xl text-[15px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] transition"
                            >
                                {loading ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                        Verificando…
                                    </>
                                ) : (
                                    <>
                                        Entrar
                                        <Icono d={IC.arrow} className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </div>

                        <p className="mt-5 pt-5 border-t border-border/60 dark:border-white/[0.08] text-[13px] text-content-subtle leading-relaxed">
                            ¿No tienes usuario u olvidaste tu contraseña? Pídeselo al administrador de tu empresa.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
