import { useState } from "react";

// "Para tu tipo de negocio": una fila de rubros y, al tocar uno, lo que el sistema le resuelve
// a ese negocio en particular. Sin fotos de archivo: el panel habla de funciones concretas.
//
// Cada punto es una función que el sistema tiene hoy (peso con 3 decimales, comandas sin
// precio, presentaciones de compra, lotes y vencimientos, cobro conjunto, etiquetas...). Si un
// rubro necesita algo que todavía no existe, no se lo promete aquí.

const RUBROS = [
    {
        id: "abastos", nombre: "Abastos y bodegas",
        icono: "M3 9l1.5-5h15L21 9M3 9h18M3 9v10a1 1 0 001 1h5v-6h6v6h5a1 1 0 001-1V9",
        frase: "Mucho movimiento, precios que cambian y clientes que pagan en varias monedas.",
        puntos: [
            "Productos por peso con tres decimales: kilos y litros exactos.",
            "Precio en referencia y cobro en bolívares a la tasa del día.",
            "Pago combinado: una parte en divisas y otra en pago móvil.",
            "El vuelto sale de la caja y en la moneda que haya.",
        ],
    },
    {
        id: "restaurantes", nombre: "Restaurantes y bares",
        icono: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
        frase: "Mesas que se abren y se cierran todo el día, y una cocina que tiene que enterarse a tiempo.",
        puntos: [
            "Cuentas abiertas para ir sumando rondas sin rehacer el pedido.",
            "Comanda a cocina en la impresora térmica, sin precios.",
            "Platos con receta: al venderlos descuentan sus ingredientes.",
            "Pensado para tablet: nada escondido detrás del cursor.",
        ],
    },
    {
        id: "ferreterias", nombre: "Ferreterías y repuestos",
        icono: "M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z",
        frase: "Miles de referencias, compras por bulto y ventas por unidad.",
        puntos: [
            "Compras por bulto, caja o docena; la venta, por unidad.",
            "Búsqueda por código de barras o por nombre.",
            "Historial de cada producto: qué entró, qué salió y por qué.",
            "Ventas a crédito con el plazo de cada cliente.",
        ],
    },
    {
        id: "distribuidoras", nombre: "Distribuidoras",
        icono: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
        frase: "Varios almacenes, clientes a crédito y proveedores a quienes pagar.",
        puntos: [
            "Sucursales y almacenes, con transferencias entre ellos.",
            "Vencimiento de cada factura y lo vencido a la vista.",
            "Cobro de varias facturas de un cliente en un solo pago.",
            "Cuentas por pagar a proveedores, con pago conjunto.",
        ],
    },
    {
        id: "tiendas", nombre: "Tiendas y boutiques",
        icono: "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z",
        frase: "Vender también por el teléfono, con la tienda abierta las 24 horas.",
        puntos: [
            "Catálogo en línea con fotos y precios del día.",
            "Pedidos que llegan armados al sistema y por WhatsApp.",
            "Promociones con el precio anterior tachado.",
            "Etiquetas de precio para imprimir en la térmica.",
        ],
    },
    {
        id: "cosmeticos", nombre: "Cosméticos y farmacias",
        icono: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
        frase: "Productos con lote y fecha de vencimiento, y clientes que compran por la marca.",
        puntos: [
            "Lote y vencimiento al recibir la mercancía.",
            "Ficha en el catálogo con marca, descripción y beneficios.",
            "Aviso de reposición por sucursal.",
            "Ventas a crédito y abonos del cliente.",
        ],
    },
];

const CHECK = "M5 13l4 4L19 7";

export default function LandingRubros() {
    const [activo, setActivo] = useState(RUBROS[0].id);
    const r = RUBROS.find(x => x.id === activo);

    return (
        <section id="rubros" className="scroll-mt-16 border-t border-border/50 dark:border-white/[0.06] bg-white dark:bg-white/[0.02]">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-24">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:items-end">
                    <div>
                        <p className="text-[14px] font-semibold text-brand-600 dark:text-brand-400">Para tu tipo de negocio</p>
                        <h2 className="mt-2 text-[30px] sm:text-[38px] font-bold tracking-[-0.02em] leading-tight text-content dark:text-white">
                            El mismo sistema, ajustado a cómo trabajas tú
                        </h2>
                    </div>
                    <p className="text-[16px] text-content-muted dark:text-white/70 leading-relaxed">
                        Elige tu rubro y mira qué es lo que más vas a usar.
                    </p>
                </div>

                {/* Rubros: fila deslizable en el teléfono. */}
                <div role="tablist" aria-label="Tipos de negocio" className="mt-8 -mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto no-scrollbar sm:flex-wrap">
                    {RUBROS.map(x => {
                        const on = x.id === activo;
                        return (
                            <button key={x.id} role="tab" aria-selected={on} onClick={() => setActivo(x.id)}
                                className={`shrink-0 h-11 pl-2 pr-4 rounded-full border inline-flex items-center gap-2 text-[14px] font-medium transition-colors ${on
                                    ? "border-brand-500 bg-brand-500 text-white"
                                    : "border-border dark:border-white/15 text-content-muted dark:text-white/75 hover:border-content-subtle/60 hover:text-content dark:hover:text-white"}`}>
                                <span className={`w-7 h-7 rounded-full flex items-center justify-center ${on ? "bg-white/20" : "bg-brand-500/10 text-brand-600 dark:text-brand-400"}`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={x.icono} /></svg>
                                </span>
                                {x.nombre}
                            </button>
                        );
                    })}
                </div>

                {/* Panel del rubro elegido */}
                <div key={r.id} className="mt-6 modal-in rounded-3xl border border-border/70 dark:border-white/[0.08] bg-surface-2/60 dark:bg-white/[0.02] overflow-hidden grid md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <div className="relative p-6 sm:p-8 bg-gradient-to-br from-brand-600 to-brand-800 text-white overflow-hidden">
                        <div aria-hidden="true" className="absolute -right-10 -bottom-10 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
                        <span className="relative w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d={r.icono} /></svg>
                        </span>
                        <h3 className="relative mt-6 text-[24px] font-bold tracking-tight">{r.nombre}</h3>
                        <p className="relative mt-2 text-[15px] text-white/80 leading-relaxed">{r.frase}</p>
                    </div>
                    <ul className="p-6 sm:p-8 grid sm:grid-cols-2 gap-x-6 gap-y-5 content-center">
                        {r.puntos.map(p => (
                            <li key={p} className="flex items-start gap-3">
                                <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-emerald-500/[0.12] text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d={CHECK} /></svg>
                                </span>
                                <span className="text-[15px] text-content dark:text-white/90 leading-relaxed">{p}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="mt-4 text-[13px] text-content-subtle">¿Tu rubro no está? Todo lo anterior funciona igual para cualquier negocio que venda, cobre y lleve inventario.</p>
            </div>
        </section>
    );
}
