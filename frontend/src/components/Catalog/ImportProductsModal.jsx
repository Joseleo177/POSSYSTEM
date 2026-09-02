import { useState, useRef, useEffect } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import { descargarPlantilla, leerArchivo } from "../../helpers/productImport";
import { api } from "../../services/api";

// Importación de productos desde Excel, en tres pasos: descargar la plantilla, elegir el
// archivo y revisar lo que va a pasar antes de confirmar.
//
// El paso de revisión no es un adorno: cargar mal 400 productos se deshace a mano, uno por
// uno. Vale más una pantalla de confirmación que un "listo" rápido.
export default function ImportProductsModal({ open, onClose, warehouseName, warehouseId, warehouseCount = 1, notify, onDone }) {
    const [archivo, setArchivo] = useState(null);
    const [analisis, setAnalisis] = useState(null);   // { filas, errores, columnasIgnoradas }
    const [leyendo, setLeyendo] = useState(false);
    const [importando, setImportando] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (!open) { setArchivo(null); setAnalisis(null); setLeyendo(false); setImportando(false); }
    }, [open]);

    if (!open) return null;

    const elegir = async (file) => {
        if (!file) return;
        setArchivo(file);
        setLeyendo(true);
        try {
            setAnalisis(await leerArchivo(file));
        } catch (e) {
            notify(`No se pudo leer el archivo: ${e.message}`, "err");
            setArchivo(null);
            setAnalisis(null);
        } finally {
            setLeyendo(false);
        }
    };

    const importar = async () => {
        if (!analisis?.filas.length) return;
        setImportando(true);
        try {
            const r = await api.products.importar({
                warehouse_id: warehouseId,
                rows: analisis.filas,
            });
            const d = r.data || {};
            notify(r.message || "Importación completada");
            if (d.categorias_creadas?.length) {
                notify(`Categorías nuevas: ${d.categorias_creadas.join(", ")}`);
            }
            onDone?.();
            onClose();
        } catch (e) {
            notify(e.message || "No se pudo importar", "err");
        } finally {
            setImportando(false);
        }
    };

    // Igual que en la ficha del producto: la sucursal solo se nombra ante quien maneja varias.
    const sucursal = warehouseName && warehouseCount > 1 ? warehouseName : null;

    const filas = analisis?.filas ?? [];
    const errores = analisis?.errores ?? [];
    const conExistencia = filas.filter(f => f.stock != null).length;
    const categorias = [...new Set(filas.map(f => f.category).filter(Boolean))];
    const hayAlgo = filas.length > 0;

    return (
        <Modal open={open} onClose={onClose} title="Importar productos desde Excel" width={620}>
            <div className="flex flex-col gap-4 py-1">

                {/* Paso 1 — la plantilla */}
                <div className="flex items-center justify-between gap-3 bg-surface-2 dark:bg-white/5 rounded-xl p-3 border border-border/30 dark:border-white/5">
                    <div className="min-w-0">
                        <div className="text-[11px] font-black uppercase tracking-wide text-content dark:text-white">
                            1 · Descarga la plantilla
                        </div>
                        <div className="text-[10px] font-bold text-content-muted leading-tight mt-0.5">
                            Trae las columnas correctas y una hoja con las instrucciones.
                        </div>
                    </div>
                    <Button variant="ghost" onClick={descargarPlantilla}
                        className="h-8 px-3 text-[10px] shadow-none border border-border dark:border-white/10 shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Plantilla
                    </Button>
                </div>

                {/* Paso 2 — el archivo */}
                <div>
                    <div className="text-[11px] font-black uppercase tracking-wide text-content dark:text-white mb-2">
                        2 · Elige tu archivo
                    </div>
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={e => elegir(e.target.files?.[0])}
                    />
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="w-full border-2 border-dashed border-border dark:border-white/15 rounded-xl py-6 flex flex-col items-center gap-2 hover:border-brand-500/60 hover:bg-brand-500/[0.03] transition-all"
                    >
                        <svg className="w-7 h-7 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        <span className="text-[11px] font-black uppercase tracking-wide text-content-subtle">
                            {archivo ? archivo.name : "Excel o CSV"}
                        </span>
                        {archivo && (
                            <span className="text-[10px] font-bold text-brand-500">Elegir otro</span>
                        )}
                    </button>
                </div>

                {leyendo && (
                    <div className="text-center py-3 text-[11px] font-black uppercase tracking-widest text-content-subtle animate-pulse">
                        Leyendo el archivo…
                    </div>
                )}

                {/* Paso 3 — qué va a pasar */}
                {analisis && !leyendo && (
                    <div className="flex flex-col gap-3">
                        <div className="text-[11px] font-black uppercase tracking-wide text-content dark:text-white">
                            3 · Revisa antes de confirmar
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <Resumen valor={filas.length} label="Filas válidas" tono={hayAlgo ? "ok" : "muerto"} />
                            <Resumen valor={conExistencia} label={sucursal ? `Con existencia en ${sucursal}` : "Con existencia"} tono="neutro" />
                            <Resumen valor={errores.length} label="Con problemas" tono={errores.length ? "mal" : "muerto"} />
                        </div>

                        {categorias.length > 0 && (
                            <div className="text-[10px] font-bold text-content-muted leading-relaxed">
                                <span className="text-content-subtle uppercase tracking-widest font-black">Categorías del archivo: </span>
                                {categorias.join(" · ")}
                                <div className="mt-0.5 opacity-80">Las que no existan se crearán solas.</div>
                            </div>
                        )}

                        {analisis.columnasIgnoradas?.length > 0 && (
                            <div className="text-[10px] font-bold text-warning leading-tight">
                                Columnas que no reconozco y se van a ignorar: {analisis.columnasIgnoradas.join(", ")}
                            </div>
                        )}

                        {errores.length > 0 && (
                            <div className="rounded-xl border border-danger/30 bg-danger/5 p-3 max-h-40 overflow-y-auto">
                                <div className="text-[10px] font-black uppercase tracking-widest text-danger mb-1.5">
                                    Estas filas no se van a importar
                                </div>
                                <ul className="flex flex-col gap-1">
                                    {errores.slice(0, 30).map((e, i) => (
                                        <li key={i} className="text-[10px] font-bold text-content-muted leading-tight">
                                            <span className="text-danger tabular-nums">Fila {e.fila}</span> · {e.motivo}
                                        </li>
                                    ))}
                                    {errores.length > 30 && (
                                        <li className="text-[10px] font-black text-danger/70">y {errores.length - 30} más…</li>
                                    )}
                                </ul>
                            </div>
                        )}

                        {hayAlgo && (
                            <div className="rounded-xl border border-border/40 dark:border-white/10 overflow-hidden">
                                <div className="px-3 py-1.5 bg-surface-2 dark:bg-white/5 text-[9px] font-black uppercase tracking-widest text-content-subtle">
                                    Primeras filas
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[520px]">
                                        <thead>
                                            <tr>
                                                {["Producto", "Unidad", "Costo", "Precio", "% Gan.", "Existencia"].map(h => (
                                                    <th key={h} className="px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-content-subtle border-b border-border/30 dark:border-white/5">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/20 dark:divide-white/5">
                                            {filas.slice(0, 6).map((f, i) => (
                                                <tr key={i}>
                                                    <td className="px-3 py-1.5 text-[10px] font-bold text-content dark:text-white truncate max-w-[150px]">
                                                        {f.name}
                                                        {f.category && <span className="block text-[9px] font-bold text-content-subtle truncate">{f.category}</span>}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-[10px] font-bold text-content-muted">
                                                        {f.unit}
                                                        {f.package_unit && (
                                                            <span className="block text-[9px] text-content-subtle">
                                                                {f.package_unit} de {f.package_size}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-[10px] font-bold text-content-muted tabular-nums">
                                                        {f.cost_price != null ? f.cost_price : "—"}
                                                    </td>
                                                    {/* Un precio calculado se marca: es la cuenta que hizo el
                                                        sistema y conviene que el dueño la confirme. */}
                                                    <td className="px-3 py-1.5 text-[10px] font-bold tabular-nums text-brand-500">
                                                        {f.price}
                                                        {f.precio_calculado && (
                                                            <span className="block text-[8px] font-black uppercase tracking-widest text-content-subtle">calculado</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-[10px] font-bold text-content-muted tabular-nums">
                                                        {f.profit_margin != null ? `${f.profit_margin}%` : "—"}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-[10px] font-bold text-content-muted tabular-nums">
                                                        {f.stock != null ? f.stock : "—"}
                                                        {/* Contado en cajas: se muestra la cuenta para que se
                                                            pueda verificar de un vistazo. */}
                                                        {f.stock_de_presentaciones && (
                                                            <span className="block text-[8px] font-black uppercase tracking-wide text-content-subtle">
                                                                {f.package_qty} × {f.package_size}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <p className="text-[10px] font-bold text-content-muted leading-relaxed">
                            Los productos que ya existan —por código de barras, o por nombre si no traen código— se
                            actualizarán con estos datos. {sucursal && <>La existencia se carga en <span className="text-content dark:text-white">{sucursal}</span>.</>}
                        </p>
                    </div>
                )}

                <div className="flex flex-col gap-2 pt-1">
                    <button
                        type="button"
                        onClick={importar}
                        disabled={!hayAlgo || importando || leyendo}
                        className="w-full h-11 bg-brand-500 text-black rounded-lg font-black text-[11px] uppercase tracking-wider shadow-md shadow-brand-500/10 active:scale-98 transition-all flex items-center justify-center gap-2 hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {importando
                            ? "Importando…"
                            : hayAlgo
                                ? `Importar ${filas.length} ${filas.length === 1 ? "producto" : "productos"}`
                                : "Importar"}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={importando}
                        className="w-full h-8 text-content-subtle dark:text-content-dark-muted rounded-lg font-black uppercase tracking-widest text-[9px] hover:bg-surface-2 dark:hover:bg-white/5 transition-all disabled:opacity-40"
                    >
                        Cancelar (ESC)
                    </button>
                </div>
            </div>
        </Modal>
    );
}

function Resumen({ valor, label, tono }) {
    const color = tono === "ok" ? "text-success" : tono === "mal" ? "text-danger" : tono === "muerto" ? "text-content-subtle" : "text-content dark:text-white";
    return (
        <div className="bg-surface-2 dark:bg-white/5 rounded-xl p-2.5 border border-border/30 dark:border-white/5 flex flex-col gap-0.5">
            <span className={`text-xl font-black font-display tabular-nums leading-none ${color}`}>{valor}</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-content-subtle leading-tight">{label}</span>
        </div>
    );
}
