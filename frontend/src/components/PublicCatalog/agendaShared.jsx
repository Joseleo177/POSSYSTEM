// Lo común de la reserva de citas en la vitrina (BookingSheet y el tema "servicios").
//
// La vitrina muestra las horas en 12 horas ("9:30 a. m."): es como se dicen en la calle. La
// agenda interna sigue en 24 horas, como el resto del sistema.

/** 570 → { h: "9:30", ampm: "a. m." } */
export function hora12(min) {
    const m = ((min % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60), mi = m % 60;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return { h: `${h12}:${String(mi).padStart(2, "0")}`, ampm: h < 12 ? "a. m." : "p. m." };
}

/** 570 → "9:30 a. m." */
export const fmtHora = (min) => { const x = hora12(min); return `${x.h} ${x.ampm}`; };

/** 540, 1200 → "9:00 a. m. – 8:00 p. m." */
export const fmtRango = (a, b) => `${fmtHora(a)} – ${fmtHora(b)}`;

export const duracion = (min) => { const h = Math.floor(min / 60), m = min % 60; return !h ? `${m} min` : m ? `${h} h ${m} min` : `${h} h`; };
/** "RICARDO HERRERA" → "Ricardo Herrera" (los nombres suelen guardarse en mayúsculas). */
export const nombrePropio = (n) => {
    const s = String(n || "").trim();
    if (s !== s.toUpperCase()) return s;
    return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
};
export const iniciales = (n) => String(n || "").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();

// Icono de respaldo para un servicio sin foto: unas tijeras.
export function IconoServicio({ className = "w-6 h-6" }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="6" cy="6" r="3" strokeWidth={1.6} />
            <circle cx="6" cy="18" r="3" strokeWidth={1.6} />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" />
        </svg>
    );
}

/** Foto del servicio, o el icono sobre un tono de la marca. */
export function FotoServicio({ s, className = "", icono = "w-7 h-7" }) {
    if (s?.image_url) return <img src={s.image_url} alt={s.name} loading="lazy" className={`object-cover ${className}`} />;
    return (
        <span className={`flex items-center justify-center bg-brand-500/[0.12] text-brand-700 ${className}`}>
            <IconoServicio className={icono} />
        </span>
    );
}
