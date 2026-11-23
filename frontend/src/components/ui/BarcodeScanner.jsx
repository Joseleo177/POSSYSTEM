import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Escáner de códigos de barras con la cámara del teléfono o la tablet (23-11-2026).
 *
 * Lee con el detector nativo del navegador (`BarcodeDetector`: Chrome en Android) y, donde no
 * existe —Safari y todo navegador de iPhone, Firefox—, con @zxing/browser, que se descarga
 * aparte y solo la primera vez que se abre el escáner en esos equipos.
 *
 * Al leer un código vibra, llama a `onDetected(codigo)` una sola vez y deja de leer: cerrar el
 * escáner es cosa de quien lo abrió. La cámara se apaga al cerrarse.
 *
 * La cámara exige https (o localhost): en http el navegador ni la ofrece.
 */

const NATIVOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "codabar", "qr_code"];

async function detectorNativo() {
    if (typeof window === "undefined" || !("BarcodeDetector" in window)) return null;
    try {
        const soportados = await window.BarcodeDetector.getSupportedFormats();
        const formats = NATIVOS.filter(f => soportados.includes(f));
        return formats.length ? new window.BarcodeDetector({ formats }) : null;
    } catch {
        return null;
    }
}

async function lectorZxing() {
    const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
    ]);
    // Solo los formatos de producto: probar todos hace cada cuadro más lento.
    const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.ITF,
        BarcodeFormat.CODABAR, BarcodeFormat.QR_CODE,
    ]]]);
    return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
}

/** ¿Se puede ofrecer el escáner en este equipo? (cámara disponible por la API del navegador) */
export const puedeEscanear = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

const mensajeDeError = (e) => {
    if (e?.name === "NotAllowedError" || e?.name === "SecurityError") return "No hay permiso para usar la cámara. Actívalo en los ajustes del navegador para este sitio.";
    if (e?.name === "NotFoundError" || e?.name === "OverconstrainedError") return "Este equipo no tiene una cámara disponible.";
    if (e?.name === "NotReadableError") return "La cámara está ocupada por otra aplicación. Ciérrala e inténtalo de nuevo.";
    return "No se pudo abrir la cámara.";
};

export default function BarcodeScanner({ open, onClose, onDetected, title = "Escanear código" }) {
    const videoRef = useRef(null);
    const trackRef = useRef(null);
    const alDetectar = useRef(onDetected);
    alDetectar.current = onDetected;
    const [error, setError] = useState("");
    const [listo, setListo] = useState(false);
    const [linterna, setLinterna] = useState({ hay: false, on: false });

    useEffect(() => {
        if (!open) return undefined;
        let parar = false;
        let stream = null;
        let timer = null;
        let controles = null;
        setError("");
        setListo(false);

        const leido = (codigo) => {
            if (parar || !codigo) return;
            parar = true;
            try { navigator.vibrate?.(60); } catch { /* sin vibración */ }
            alDetectar.current?.(String(codigo).trim());
        };

        (async () => {
            if (!puedeEscanear()) {
                setError("Este navegador no permite usar la cámara. Abre el sistema desde su dirección https.");
                return;
            }
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
                });
            } catch (e) {
                setError(mensajeDeError(e));
                return;
            }
            if (parar) { stream.getTracks().forEach(t => t.stop()); return; }

            const video = videoRef.current;
            video.srcObject = stream;
            await video.play().catch(() => {});
            setListo(true);

            const track = stream.getVideoTracks()[0];
            trackRef.current = track;
            const caps = track.getCapabilities?.() || {};
            if (caps.torch) setLinterna({ hay: true, on: false });
            if (caps.focusMode?.includes?.("continuous")) {
                track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
            }

            const nativo = await detectorNativo();
            if (nativo) {
                const cuadro = async () => {
                    if (parar) return;
                    if (video.readyState >= 2) {
                        try {
                            const r = await nativo.detect(video);
                            if (r[0]?.rawValue) return leido(r[0].rawValue);
                        } catch { /* cuadro ilegible: se sigue */ }
                    }
                    timer = setTimeout(cuadro, 120);
                };
                cuadro();
            } else {
                try {
                    const lector = await lectorZxing();
                    if (parar) return;
                    controles = await lector.decodeFromStream(stream, video, (res) => { if (res) leido(res.getText()); });
                    if (parar) controles.stop();
                } catch {
                    if (!parar) setError("No se pudo cargar el lector de códigos. Revisa la conexión e inténtalo de nuevo.");
                }
            }
        })();

        return () => {
            parar = true;
            clearTimeout(timer);
            try { controles?.stop(); } catch { /* ya parado */ }
            stream?.getTracks().forEach(t => t.stop());
            trackRef.current = null;
            setLinterna({ hay: false, on: false });
        };
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const alternarLinterna = async () => {
        const t = trackRef.current;
        if (!t) return;
        const on = !linterna.on;
        try {
            await t.applyConstraints({ advanced: [{ torch: on }] });
            setLinterna({ hay: true, on });
        } catch { /* el equipo no la deja encender */ }
    };

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 z-[1000] bg-black text-white overlay-in" role="dialog" aria-modal="true" aria-label={title}>
            <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />

            {/* Ventana de lectura: lo de afuera se oscurece con la sombra del propio recuadro. */}
            {!error && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative w-[80%] max-w-[360px] aspect-[16/10] rounded-2xl shadow-[0_0_0_100vmax_rgba(0,0,0,0.55)]">
                        {["top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-2xl", "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-2xl",
                          "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-2xl", "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-2xl"].map(c => (
                            <span key={c} className={`absolute w-8 h-8 border-white ${c}`} />
                        ))}
                        {listo && <span className="scan-line absolute inset-x-4 h-[2px] rounded-full bg-brand-400 shadow-[0_0_12px_2px_rgba(255,255,255,0.35)]" />}
                    </div>
                </div>
            )}

            {/* Cabecera */}
            <div className="absolute top-0 inset-x-0 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
                <span className="text-[15px] font-semibold">{title}</span>
                <button type="button" onClick={onClose} aria-label="Cerrar"
                    className="w-11 h-11 -mr-1.5 rounded-full bg-white/15 backdrop-blur flex items-center justify-center active:scale-95">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>

            {/* Pie: indicación y linterna */}
            <div className="absolute bottom-0 inset-x-0 px-6 pt-10 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-4 bg-gradient-to-t from-black/70 to-transparent">
                {error ? (
                    <div className="max-w-[340px] text-center">
                        <div className="text-[15px] font-semibold">No se puede escanear</div>
                        <div className="mt-1 text-[13px] text-white/75">{error}</div>
                        <button type="button" onClick={onClose} className="mt-4 h-12 px-6 rounded-xl bg-white text-black text-[14px] font-semibold active:scale-95">Volver</button>
                    </div>
                ) : (
                    <>
                        <div className="text-[13px] text-white/85 text-center">{listo ? "Apunta al código de barras del producto" : "Abriendo la cámara…"}</div>
                        {linterna.hay && (
                            <button type="button" onClick={alternarLinterna} aria-pressed={linterna.on}
                                className={`h-11 px-4 rounded-full flex items-center gap-2 text-[13px] font-semibold active:scale-95 ${linterna.on ? "bg-white text-black" : "bg-white/15 backdrop-blur text-white"}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 2h6v4l-2 3v13h-2V9L9 6V2zM9 6h6" /></svg>
                                {linterna.on ? "Apagar linterna" : "Linterna"}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>,
        document.body
    );
}
