import { useState, useEffect, useRef } from "react";
import { Spinner } from "../ui/Spinner";
import CatalogSheet, { SheetHeader } from "./CatalogSheet";

// Elegir en un mapa dónde se entrega el pedido. El delivery no siempre va a donde está el
// cliente: pide desde el trabajo para su casa, o para otra persona. El pin queda fijo en el
// centro y el cliente mueve el mapa debajo —con el dedo es más fácil que arrastrar un marcador—.
//
// Mapa de OpenStreetMap con Leaflet, cargado solo al abrir esta hoja (no pesa en el catálogo).
// El buscador usa Nominatim, el geocodificador de OpenStreetMap, sin clave.

const CENTRO_POR_DEFECTO = { lat: 10.4806, lng: -66.9036, zoom: 12 }; // Caracas
const redondear = (n) => Math.round(n * 1e6) / 1e6;

export default function MapPicker({ skin, initial = null, onClose, onPick }) {
    const boxRef = useRef(null);
    const mapRef = useRef(null);
    const [centro, setCentro] = useState(initial);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [q, setQ] = useState("");
    const [buscando, setBuscando] = useState(false);
    const [resultados, setResultados] = useState(null);
    const [ubicando, setUbicando] = useState(false);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const L = (await import("leaflet")).default;
                await import("leaflet/dist/leaflet.css");
                if (!vivo || !boxRef.current) return;
                const inicio = initial || CENTRO_POR_DEFECTO;
                const map = L.map(boxRef.current, { zoomControl: true, attributionControl: true })
                    .setView([inicio.lat, inicio.lng], initial ? 17 : inicio.zoom);
                L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    maxZoom: 19,
                    attribution: "© OpenStreetMap",
                }).addTo(map);
                const leer = () => { const c = map.getCenter(); setCentro({ lat: redondear(c.lat), lng: redondear(c.lng) }); };
                map.on("moveend", leer);
                leer();
                mapRef.current = map;
                setCargando(false);
                // Sin punto previo, se arranca donde está el cliente, pero solo si ya dio permiso:
                // preguntar al abrir el mapa sería raro cuando justo quiere marcar otro lugar.
                if (!initial && navigator.permissions?.query) {
                    const p = await navigator.permissions.query({ name: "geolocation" }).catch(() => null);
                    if (p?.state === "granted") irAMiUbicacion();
                }
            } catch {
                if (vivo) { setError("No se pudo cargar el mapa. Revisa tu conexión."); setCargando(false); }
            }
        })();
        return () => { vivo = false; mapRef.current?.remove(); mapRef.current = null; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const irAMiUbicacion = () => {
        if (!navigator.geolocation) return;
        setUbicando(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => { mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 17); setUbicando(false); },
            () => setUbicando(false),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
        );
    };

    const buscar = async (e) => {
        e?.preventDefault();
        const texto = q.trim();
        if (texto.length < 3) return;
        setBuscando(true);
        try {
            const c = mapRef.current?.getCenter();
            const params = new URLSearchParams({ format: "json", limit: "5", q: texto, "accept-language": "es" });
            // Se prefieren los resultados cerca de donde está mirando el mapa.
            if (c) params.set("viewbox", `${c.lng - 1},${c.lat + 1},${c.lng + 1},${c.lat - 1}`);
            const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
            setResultados(r.ok ? await r.json() : []);
        } catch {
            setResultados([]);
        } finally {
            setBuscando(false);
        }
    };

    const ir = (r) => {
        mapRef.current?.setView([parseFloat(r.lat), parseFloat(r.lon)], 17);
        setResultados(null);
    };

    return (
        <CatalogSheet skin={skin} onClose={onClose} label="Elegir en el mapa" z="z-[80]">
            <SheetHeader skin={skin} title="Punto de entrega" subtitle="Mueve el mapa hasta que el pin quede en la puerta" onClose={onClose} />

            <form onSubmit={buscar} className="px-5 pb-3 flex gap-2 shrink-0">
                <input value={q} onChange={e => setQ(e.target.value)} autoComplete="off" enterKeyHint="search"
                    placeholder="Busca una zona, calle o lugar" className={`${skin.field} flex-1 min-w-0`} />
                <button type="submit" disabled={buscando || q.trim().length < 3} aria-label="Buscar"
                    className={`shrink-0 w-12 inline-flex items-center justify-center disabled:opacity-50 ${skin.secondary}`}>
                    {buscando ? <Spinner /> : (
                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={2} d="M20 20l-3.5-3.5" /></svg>
                    )}
                </button>
            </form>

            <div className="relative flex-1 min-h-[340px] sm:min-h-[420px] mx-5 rounded-2xl overflow-hidden ring-1 ring-black/10">
                <div ref={boxRef} className="absolute inset-0 z-0" />

                {/* El pin fijo en el centro: la punta marca el punto. */}
                {!cargando && !error && (
                    <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full w-9 h-9 z-[500] pointer-events-none drop-shadow-[0_3px_4px_rgba(0,0,0,0.35)]" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="rgb(var(--c-brand-500))" stroke="#fff" strokeWidth="1.5" d="M12 22s-7-6.4-7-12a7 7 0 1114 0c0 5.6-7 12-7 12z" />
                        <circle cx="12" cy="10" r="2.6" fill="#fff" />
                    </svg>
                )}

                {!error && (
                    <button type="button" onClick={irAMiUbicacion} disabled={ubicando || cargando} aria-label="Ir a mi ubicación" title="Ir a mi ubicación"
                        className="absolute right-3 bottom-8 z-[500] w-11 h-11 rounded-full bg-white text-neutral-800 shadow-lg ring-1 ring-black/10 flex items-center justify-center disabled:opacity-60">
                        {ubicando ? <Spinner /> : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" strokeWidth={1.8} /><path strokeLinecap="round" strokeWidth={1.8} d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7" strokeWidth={1.8} /></svg>
                        )}
                    </button>
                )}

                {cargando && (
                    <div className="absolute inset-0 z-[500] flex items-center justify-center bg-neutral-100 text-neutral-500 text-[13px] gap-2">
                        <Spinner /> Cargando el mapa...
                    </div>
                )}
                {error && (
                    <div className="absolute inset-0 z-[500] flex items-center justify-center bg-neutral-100 text-neutral-600 text-[13px] px-6 text-center">{error}</div>
                )}

                {/* Resultados del buscador, sobre el mapa. */}
                {resultados && (
                    <div className="absolute left-2 right-2 top-2 z-[600] rounded-xl bg-white text-neutral-900 shadow-xl ring-1 ring-black/10 max-h-[60%] overflow-y-auto">
                        {resultados.length === 0 ? (
                            <p className="px-4 py-3 text-[13px] text-neutral-500">No encontramos ese lugar. Prueba con otro nombre o mueve el mapa.</p>
                        ) : resultados.map(r => (
                            <button key={r.place_id} type="button" onClick={() => ir(r)}
                                className="w-full text-left px-4 py-2.5 text-[13px] leading-snug hover:bg-neutral-100 border-b last:border-0 border-black/[0.06]">
                                {r.display_name}
                            </button>
                        ))}
                        <button type="button" onClick={() => setResultados(null)} className="w-full px-4 py-2 text-[12px] font-medium text-neutral-500 hover:text-neutral-900">Cerrar</button>
                    </div>
                )}
            </div>

            <div className="shrink-0 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button type="button" onClick={() => centro && onPick(centro)} disabled={!centro || cargando || !!error}
                    className={`w-full h-12 inline-flex items-center justify-center gap-2 active:scale-[0.99] transition disabled:opacity-50 ${skin.primary}`}>
                    Entregar en este punto
                </button>
            </div>
        </CatalogSheet>
    );
}
