// Los bloques de "cómo comprar aquí", en el sitio donde las tiendas de referencia ponen sus
// garantías (envíos, pago seguro, atención), y con esa misma forma: icono en un círculo
// suave y una etiqueta corta, sin tarjeta alrededor.
//
// Dicen otra cosa a propósito: esas tiendas cobran en línea y aquí no. El pedido llega al
// sistema, la tienda lo confirma y contacta al cliente para el pago. Un cliente que llega
// esperando pagar con tarjeta y no lo encuentra abandona el pedido creyendo que la página
// falla, así que el flujo real se explica en la portada y no al final. Por lo mismo no hay
// "Envío a todo el país" ni "Múltiples métodos de pago": son promesas de cada tienda, no
// algo que el catálogo pueda garantizar.
//
// Los textos son del tema y no ajustes editables: describen cómo funciona el catálogo, no una
// promesa comercial de la tienda. Si mañana hay pasarela de pago, esto cambia con el código
// que la traiga.

const PASOS = [
    {
        titulo: "Arma tu pedido",
        texto: "Envíalo sin pagar nada",
        icono: "M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
    },
    {
        titulo: "Te confirmamos",
        texto: "Te escribimos para acordar la entrega",
        icono: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z",
    },
    {
        titulo: "Pagas al confirmar",
        texto: "Coordinas el pago con la tienda",
        icono: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
    },
    {
        titulo: "Sigue tu pedido",
        texto: "Consulta su estado desde Mi cuenta",
        icono: "M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75",
    },
];

export default function HowItWorks() {
    return (
        <section className="max-w-6xl mx-auto px-4 pt-12 md:pt-20 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-9">
                {PASOS.map((p) => (
                    <div key={p.titulo} className="flex flex-col items-center text-center">
                        <div className="w-[72px] h-[72px] md:w-[88px] md:h-[88px] rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center">
                            <svg className="w-8 h-8 md:w-9 md:h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={p.icono} />
                            </svg>
                        </div>
                        <h3 className="mt-4 text-[13px] md:text-[14px] font-bold text-content dark:text-white">{p.titulo}</h3>
                        <p className="mt-1 text-[11px] md:text-[12px] font-medium text-content-muted leading-snug max-w-[180px]">
                            {p.texto}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    );
}
