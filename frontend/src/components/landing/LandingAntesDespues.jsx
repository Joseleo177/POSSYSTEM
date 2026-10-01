// "Antes y con Nexus": cada problema del día a día emparejado con lo que lo resuelve. Va en
// una franja oscura, sea cual sea el tema, para cortar el ritmo de la portada clara.
//
// Solo se promete lo que el sistema hace hoy; cada "con Nexus" corresponde a una función real.

const PARES = [
    ["La tasa cambia y toca recalcular los precios a mano.", "Precio en referencia: el cobro en bolívares sale a la tasa del día."],
    ["El cierre de caja nunca cuadra con lo que hay en la gaveta.", "Arqueo por cajero y por forma de pago: lo esperado contra lo contado."],
    ["No sabes bien quién te debe, cuánto ni desde cuándo.", "Cuentas por cobrar con vencimiento, y lo vencido marcado en rojo."],
    ["El inventario vive en un cuaderno o en la cabeza de alguien.", "Existencias por sucursal, con aviso de lo que se está acabando."],
    ["Los pedidos llegan sueltos por WhatsApp y se pierden.", "Catálogo en línea: el pedido llega armado al sistema."],
];

const X = "M6 18L18 6M6 6l12 12";
const CHECK = "M5 13l4 4L19 7";
const FLECHA = "M13 7l5 5m0 0l-5 5m5-5H6";

function Ico({ d, className }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={d} />
        </svg>
    );
}

export default function LandingAntesDespues() {
    return (
        <section className="relative overflow-hidden bg-[#0B1220] text-white">
            <div aria-hidden="true" className="absolute inset-0 pointer-events-none
                bg-[linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)]
                bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_80%_70%_at_50%_40%,black,transparent)]" />
            <div aria-hidden="true" className="absolute -bottom-40 right-0 w-[520px] h-[520px] rounded-full bg-brand-500/25 blur-[130px] pointer-events-none" />

            <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-24">
                <div className="max-w-3xl">
                    <p className="text-[14px] font-semibold text-cyan-300">El día a día, antes y después</p>
                    <h2 className="mt-2 text-[30px] sm:text-[40px] font-bold tracking-[-0.02em] leading-[1.1]">
                        Del cuaderno y la calculadora a{" "}
                        <span className="bg-gradient-to-r from-brand-300 to-cyan-300 bg-clip-text text-transparent">un sistema que cuadra solo</span>.
                    </h2>
                </div>

                {/* Encabezado de las dos columnas, solo en escritorio. */}
                <div className="hidden md:grid grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)] gap-4 mt-12 mb-3 text-[13px] font-medium">
                    <span className="text-white/45">Antes</span>
                    <span />
                    <span className="text-cyan-300">Con Nexus</span>
                </div>

                <ul className="mt-8 md:mt-0 space-y-3">
                    {PARES.map(([antes, con]) => (
                        <li key={antes} className="grid md:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)] gap-2 md:gap-4 items-stretch">
                            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4 flex items-start gap-3">
                                <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-white/[0.06] text-white/40 flex items-center justify-center">
                                    <Ico d={X} className="w-3 h-3" />
                                </span>
                                <span className="text-[15px] text-white/60 leading-relaxed">{antes}</span>
                            </div>
                            <div className="hidden md:flex items-center justify-center text-white/25">
                                <Ico d={FLECHA} className="w-5 h-5" />
                            </div>
                            <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-brand-500/[0.18] to-cyan-400/[0.06] px-5 py-4 flex items-start gap-3">
                                <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-cyan-300 text-[#0B1220] flex items-center justify-center">
                                    <Ico d={CHECK} className="w-3.5 h-3.5" />
                                </span>
                                <span className="text-[15px] font-medium text-white leading-relaxed">{con}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
