// El visto de "listo" de la vitrina: un círculo verde que crece con rebote, una onda que se
// expande detrás, el visto que se dibuja y un abanico de chispas en dos tamaños y dos colores
// (verde y el de la tienda). Lo usan "Pedido enviado" y "Pago reportado".
//
// Las chispas van en dos anillos desfasados: con un solo anillo de ocho puntos iguales se veía
// como un reloj; con dos, distintos tamaños y alcances, se lee como una pequeña explosión.
const CHISPAS = [
    ...Array.from({ length: 8 }, (_, i) => ({ a: i * 45, lejos: false })),
    ...Array.from({ length: 8 }, (_, i) => ({ a: i * 45 + 22.5, lejos: true })),
];

export default function Celebracion({ size = "w-24 h-24", icon = "w-11 h-11" }) {
    return (
        <div className={`relative ${size} mx-auto`} aria-hidden="true">
            <span className="ring-pulse absolute inset-0 rounded-full bg-emerald-500/30" />
            {CHISPAS.map(({ a, lejos }, i) => (
                <span key={`${a}-${lejos}`}
                    className={`${lejos ? "burst-far w-1.5 h-1.5 -ml-[3px] -mt-[3px]" : "burst-dot w-2 h-2 -ml-1 -mt-1"} absolute left-1/2 top-1/2 rounded-full ${i % 3 === 0 ? "bg-brand-500" : i % 3 === 1 ? "bg-emerald-500" : "bg-amber-400"}`}
                    style={{ "--a": `${a}deg` }} />
            ))}
            <div className="ring-grow absolute inset-0 rounded-full bg-emerald-500 shadow-[0_14px_30px_-10px_rgba(16,185,129,.8)] flex items-center justify-center">
                <svg className={`${icon} text-white`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path className="check-draw" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.8} d="M5 13l4 4L19 7" />
                </svg>
            </div>
        </div>
    );
}
