import { useState } from "react";

// Preguntas frecuentes. Solo respuestas que el sistema puede respaldar hoy: si una pregunta
// tiene una respuesta incómoda o incierta, no se la responde a medias en la portada.

const PREGUNTAS = [
    ["¿Puedo cobrar en bolívares y en dólares a la vez?",
     "Sí. Los precios se cargan en referencia y el cobro sale en la moneda de cada caja a la tasa del día. Un mismo cobro puede combinar varias formas de pago, por ejemplo parte en efectivo en dólares y parte en pago móvil, y el vuelto se entrega en la moneda que haya."],
    ["¿Sirve si tengo más de una tienda?",
     "Sí. Cada sucursal lleva su inventario, sus cajas y su numeración, y entre ellas se transfiere mercancía. El dueño ve todo junto; cada empleado ve solo las sucursales que le corresponden."],
    ["¿Funciona en tablet y en teléfono?",
     "Sí. Se usa desde el navegador en computadora, tablet o teléfono, sin instalar nada. Las pantallas están pensadas para el dedo: nada queda escondido detrás del cursor."],
    ["¿Qué impresoras usa?",
     "Impresoras térmicas de 58 y 80 mm para tickets, comandas y etiquetas de precio, y cualquier impresora normal para documentos en tamaño carta o PDF."],
    ["¿Mis empleados pueden ver todo?",
     "No, a menos que tú quieras. Cada rol tiene permisos por módulo y por acción: quién vende, quién anula, quién da crédito o quién ve los reportes."],
    ["¿Cómo consigo acceso?",
     "Tu usuario lo crea el administrador de tu empresa desde el módulo de Empleados. Si tu negocio todavía no usa Nexus, pide información a quien te compartió este enlace."],
];

export default function LandingPreguntas() {
    const [abierta, setAbierta] = useState(0);

    return (
        <section id="preguntas" className="scroll-mt-16 border-t border-border/50 dark:border-white/[0.06]">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-24 grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
                <div>
                    <p className="text-[14px] font-semibold text-brand-600 dark:text-brand-400">Preguntas frecuentes</p>
                    <h2 className="mt-2 text-[30px] sm:text-[38px] font-bold tracking-[-0.02em] leading-tight text-content dark:text-white">
                        Lo que suelen preguntar antes de empezar
                    </h2>
                </div>

                <div className="divide-y divide-border/70 dark:divide-white/[0.08] border-y border-border/70 dark:border-white/[0.08]">
                    {PREGUNTAS.map(([p, r], i) => {
                        const on = abierta === i;
                        return (
                            <div key={p}>
                                <button
                                    onClick={() => setAbierta(on ? -1 : i)}
                                    aria-expanded={on}
                                    className="w-full py-5 flex items-center justify-between gap-4 text-left"
                                >
                                    <span className="text-[17px] font-semibold text-content dark:text-white">{p}</span>
                                    <span className={`w-8 h-8 shrink-0 rounded-full border border-border dark:border-white/15 flex items-center justify-center text-content-subtle transition-transform duration-200 ${on ? "rotate-45" : ""}`}>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>
                                    </span>
                                </button>
                                {on && (
                                    <p className="pb-5 pr-12 -mt-1 text-[15px] text-content-muted dark:text-white/70 leading-relaxed modal-in">{r}</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
