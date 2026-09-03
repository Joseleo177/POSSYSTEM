// Los tres bloques de "cómo comprar aquí", en el sitio donde las tiendas de referencia ponen
// sus garantías (envíos, pago seguro, atención).
//
// Dicen otra cosa a propósito: esas tiendas cobran en línea y aquí no. El pedido llega al
// sistema, la tienda lo confirma y contacta al cliente para el pago. Un cliente que llega
// esperando pagar con tarjeta y no lo encuentra abandona el pedido creyendo que la página
// falla, así que el flujo real se explica en la portada y no al final.
//
// Los textos son del tema y no ajustes editables: describen cómo funciona el catálogo, no una
// promesa comercial de la tienda. Si mañana hay pasarela de pago, esto cambia con el código
// que la traiga.

const PASOS = [
    {
        titulo: "Arma tu pedido",
        texto: "Agrega lo que quieras al carrito y envíalo. No se cobra nada en este paso.",
        icono: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17",
    },
    {
        titulo: "Te confirmamos",
        texto: "Revisamos tu pedido y te escribimos para acordar la entrega.",
        icono: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    },
    {
        titulo: "Pagas al confirmar",
        texto: "El pago se coordina directamente con la tienda. Puedes seguir tu pedido desde aquí.",
        icono: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
    },
];

export default function HowItWorks() {
    return (
        <section className="max-w-6xl mx-auto px-4 pt-10">
            <div className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface dark:bg-surface-dark-2 p-5 sm:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
                    {PASOS.map((p, i) => (
                        <div key={p.titulo} className="flex sm:flex-col gap-3">
                            <div className="w-10 h-10 shrink-0 rounded-2xl bg-brand-500/10 text-brand-500 flex items-center justify-center">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d={p.icono} />
                                </svg>
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-black text-brand-500 tabular-nums">{i + 1}</span>
                                    <h3 className="text-[13px] font-black text-content dark:text-white">{p.titulo}</h3>
                                </div>
                                <p className="text-[11px] font-medium text-content-muted leading-relaxed mt-0.5">
                                    {p.texto}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
