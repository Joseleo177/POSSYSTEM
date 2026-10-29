import { useEffect, useRef, useState } from "react";

// Mapa pequeño y quieto con el punto de entrega de un pedido: se ve a dónde va sin abrir otra
// app. No se arrastra ni hace zoom (dentro de un panel que se desplaza, robaría el gesto);
// tocarlo abre el punto en Google Maps. Leaflet se carga solo cuando hace falta, igual que en
// el mapa del catálogo (PublicCatalog/MapPicker).
export default function MiniMapa({ lat, lng, className = "h-36" }) {
    const box = useRef(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let mapa = null;
        let vivo = true;
        (async () => {
            try {
                const L = (await import("leaflet")).default;
                await import("leaflet/dist/leaflet.css");
                if (!vivo || !box.current) return;
                mapa = L.map(box.current, {
                    zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
                    doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false,
                }).setView([lat, lng], 16);
                L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapa);
            } catch {
                if (vivo) setError(true);
            }
        })();
        return () => { vivo = false; mapa?.remove(); };
    }, [lat, lng]);

    return (
        <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer"
            className={`relative block overflow-hidden rounded-xl bg-surface-3 dark:bg-white/[0.06] ring-1 ring-black/[0.06] dark:ring-white/[0.08] ${className}`}
            title="Abrir en Google Maps">
            <div ref={box} className="absolute inset-0 z-0 pointer-events-none" />
            {!error && (
                <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full w-8 h-8 z-[500] pointer-events-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)]" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="rgb(var(--c-brand-500))" stroke="#fff" strokeWidth="1.5" d="M12 22s-7-6.4-7-12a7 7 0 1114 0c0 5.6-7 12-7 12z" />
                    <circle cx="12" cy="10" r="2.6" fill="#fff" />
                </svg>
            )}
            {error && <span className="absolute inset-0 flex items-center justify-center text-[12px] text-content-subtle">Ver en el mapa</span>}
            <span className="absolute right-2 bottom-2 z-[500] rounded-md bg-white/95 dark:bg-black/70 px-2 py-1 text-[11px] font-semibold text-content dark:text-white shadow-sm">
                Abrir mapa
            </span>
        </a>
    );
}
