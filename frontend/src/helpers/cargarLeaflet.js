// Leaflet (el mapa) se baja aparte, solo cuando se abre un mapa. Un despliegue le cambia el
// nombre al archivo: quien tenía la página abierta desde antes pide el nombre viejo, que ya no
// existe, y el mapa no carga aunque haya internet. Ese caso se marca (`desactualizado`) para
// ofrecer recargar la página en vez de culpar a la conexión. App.jsx hace lo mismo con las
// pantallas enteras.
export async function cargarLeaflet() {
    let L;
    try {
        L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");
    } catch (err) {
        throw Object.assign(err instanceof Error ? err : new Error(String(err)), { desactualizado: navigator.onLine !== false });
    }
    return L;
}

export const MENSAJE_DESACTUALIZADO = "Hay una versión nueva del sistema. Recarga la página para ver el mapa.";
