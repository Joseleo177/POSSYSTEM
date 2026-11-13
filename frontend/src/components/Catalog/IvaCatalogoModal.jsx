import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Segmented from "../ui/Segmented";
import CustomSelect from "../ui/CustomSelect";
import Check from "../ui/Check";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { OPCIONES_IVA } from "../../helpers/iva";

// IVA del catálogo, en lote. Dos cosas que una empresa hace al empezar a facturar con IVA:
//  - Alícuota (backend: services/fiscal/catalogoIva.js): todo nace en 16 %; aquí se marcan de una
//    vez los exentos o los de otra alícuota. El precio no cambia.
//  - Precios (services/fiscal/preciosIva.js): sumarle el IVA a los precios de venta ($1,00 → $1,16)
//    para que el impuesto no salga de la ganancia. Con vista previa, y se puede deshacer.
// Las dos actúan sobre los productos marcados, una categoría o el catálogo entero.

const LABEL = "text-[12px] font-medium text-content-subtle";
const CAJA = "rounded-xl bg-surface-2 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.06] px-4 py-3";
const NOMBRE = { G: "en 16 %", E: "exentos", R: "en 8 %", A: "en 31 %" };
const nombre = (t, n) => (t === "E" && n === 1 ? "exento" : NOMBRE[t]);
const DESTINO = { G: "16 %", E: "exento", R: "8 %", A: "31 %" };
const TASA = { G: "16 %", R: "8 %", A: "31 %" };

const REDONDEOS = [
    { value: "exacto",  label: "Sin redondear (precio exacto)" },
    { value: "centimo", label: "Al céntimo (1,16)" },
    { value: "0.05",    label: "A 0,05 (1,15)" },
    { value: "0.10",    label: "A 0,10 (1,20)" },
    { value: "0.50",    label: "A 0,50 (1,00 / 1,50)" },
    { value: "1",       label: "Al entero (1,00)" },
];

// Precio en la moneda base: dos decimales como mínimo y hasta cinco si los tiene (un ajuste
// exacto deja 2,088).
const ref = (n) => `Ref. ${Number(n).toFixed(5).replace(/(\.\d{2}\d*?)0+$/, "$1")}`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const fecha = (d) => new Date(d).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function IvaCatalogoModal({ open, onClose, seleccionados = [], onAplicado }) {
    const { notify, categories } = useApp();
    const haySeleccion = seleccionados.length > 0;
    const [pestana, setPestana] = useState("alicuota");
    const [alcance, setAlcance] = useState("seleccion");
    const [categoria, setCategoria] = useState("");
    // Alícuota
    const [tipo, setTipo] = useState("E");
    const [resumen, setResumen] = useState(null);
    const [cargando, setCargando] = useState(false);
    // Precios
    const [direccion, setDireccion] = useState("sumar");
    const [redondeo, setRedondeo] = useState("centimo");
    const [vista, setVista] = useState(null);
    const [cargandoVista, setCargandoVista] = useState(false);
    const [otraVez, setOtraVez] = useState(false);
    const [confirmarDeshacer, setConfirmarDeshacer] = useState(false);
    const [recarga, setRecarga] = useState(0);

    useEffect(() => {
        if (!open) return;
        setPestana("alicuota");
        setAlcance(haySeleccion ? "seleccion" : "todos");
        setCategoria("");
        setTipo("E");
        setDireccion("sumar");
        setRedondeo("centimo");
        setOtraVez(false);
        setConfirmarDeshacer(false);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const cuerpo = alcance === "seleccion" ? { ids: seleccionados }
        : alcance === "categoria" ? (categoria ? { category_id: Number(categoria) } : null)
        : { todos: true };
    const clave = JSON.stringify(cuerpo);

    // Cuántos hay hoy en cada alícuota dentro de lo elegido: así se ve qué va a cambiar.
    useEffect(() => {
        if (!open || pestana !== "alicuota" || !cuerpo) { setResumen(null); return; }
        let vigente = true;
        setCargando(true);
        api.products.ivaResumen(cuerpo)
            .then(r => { if (vigente) setResumen(r.data); })
            .catch(e => { if (vigente) { setResumen(null); notify(e.message, "err"); } })
            .finally(() => { if (vigente) setCargando(false); });
        return () => { vigente = false; };
    }, [open, pestana, clave]); // eslint-disable-line react-hooks/exhaustive-deps

    // Vista previa del ajuste de precios: cuántos cambian, una muestra y el último ajuste vigente.
    useEffect(() => {
        if (!open || pestana !== "precios" || !cuerpo) { setVista(null); return; }
        let vigente = true;
        setCargandoVista(true);
        api.products.ivaPreciosVista({ ...cuerpo, direccion, redondeo })
            .then(r => { if (vigente) setVista(r.data); })
            .catch(e => { if (vigente) { setVista(null); notify(e.message, "err"); } })
            .finally(() => { if (vigente) setCargandoVista(false); });
        return () => { vigente = false; };
    }, [open, pestana, clave, direccion, redondeo, recarga]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { setOtraVez(false); }, [direccion]);

    const aCambiar = resumen ? resumen.total - (resumen.por_tipo[tipo] || 0) : 0;

    const aplicarAlicuota = async () => {
        try {
            const r = await api.products.setIvaTipo({ ...cuerpo, tipo });
            const n = r.data?.cambiados || 0;
            notify(n ? `${plural(n, "producto pasó", "productos pasaron")} a ${DESTINO[tipo]}` : "No había nada que cambiar");
            onAplicado?.();
            onClose();
        } catch (e) { notify(e.message, "err"); }
    };

    const aplicarPrecios = async () => {
        try {
            const r = await api.products.ivaPreciosAplicar({ ...cuerpo, direccion, redondeo });
            const n = r.data?.productos || 0;
            notify(n
                ? `${direccion === "sumar" ? "IVA sumado" : "IVA quitado"}: ${plural(n, "producto", "productos")} con precio nuevo`
                : "No había precios que cambiar");
            onAplicado?.();
            onClose();
        } catch (e) { notify(e.message, "err"); }
    };

    const deshacer = async () => {
        try {
            const r = await api.products.ivaPreciosDeshacer();
            const { restaurados = 0, omitidos = 0 } = r.data || {};
            notify(`${plural(restaurados, "precio volvió", "precios volvieron")} a como estaban`
                + (omitidos ? `; ${plural(omitidos, "se dejó", "se dejaron")} porque ${omitidos === 1 ? "cambió" : "cambiaron"} después` : ""));
            setConfirmarDeshacer(false);
            setRecarga(n => n + 1);
            onAplicado?.();
        } catch (e) { notify(e.message, "err"); }
    };

    const opcionesAlcance = [
        ...(haySeleccion ? [{ key: "seleccion", label: `Marcados (${seleccionados.length})` }] : []),
        { key: "categoria", label: "Una categoría" },
        { key: "todos", label: "Todos" },
    ];

    // Sumar dos veces cobraría el IVA dos veces: con un ajuste igual vigente se pide confirmarlo.
    const repetido = vista?.vigente && vista.vigente.direccion === direccion;
    const totalPrecios = vista ? vista.productos + vista.variantes : 0;
    const puedeAplicarPrecios = vista && totalPrecios + vista.sucursales > 0 && (!repetido || otraVez);

    const pie = (
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button variant="ghost" onClick={onClose} className="h-12 sm:h-10">Cancelar</Button>
            {pestana === "alicuota" && resumen && aCambiar > 0 && (
                <Button onClick={aplicarAlicuota} className="h-12 sm:h-10">
                    Pasar {aCambiar} a {DESTINO[tipo]}
                </Button>
            )}
            {pestana === "precios" && puedeAplicarPrecios && (
                <Button onClick={aplicarPrecios} className="h-12 sm:h-10">
                    {direccion === "sumar" ? "Sumar el IVA" : "Quitar el IVA"} a {plural(vista.productos || totalPrecios, "producto", "productos")}
                </Button>
            )}
        </div>
    );

    return (
        <Modal open={open} onClose={onClose} title="IVA del catálogo" width={560} footer={pie}>
            <div className="space-y-5">
                <Segmented
                    className="w-full [&>button]:flex-1 [&>button]:justify-center"
                    value={pestana}
                    onChange={setPestana}
                    options={[{ key: "alicuota", label: "Alícuota" }, { key: "precios", label: "Precios" }]}
                />

                <div className="space-y-2">
                    <div className={LABEL}>A qué productos</div>
                    <Segmented
                        className="w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:px-2"
                        value={alcance}
                        onChange={setAlcance}
                        options={opcionesAlcance}
                    />
                    {alcance === "categoria" && (
                        <CustomSelect
                            value={categoria}
                            onChange={setCategoria}
                            placeholder="Elige la categoría"
                            options={categories.map(c => ({ value: String(c.id), label: c.name, color: c.color || "#fabd2f" }))}
                        />
                    )}
                </div>

                {pestana === "alicuota" ? (
                    <>
                        <div className={`${CAJA} min-h-[64px] flex items-center`}>
                            {!cuerpo ? (
                                <p className="text-[13px] text-content-subtle">Elige una categoría para ver cuántos productos tiene.</p>
                            ) : cargando && !resumen ? (
                                <Spinner className="w-4 h-4" />
                            ) : resumen ? (
                                <div className="min-w-0">
                                    <p className="text-[14px] font-semibold text-content dark:text-white">
                                        {plural(resumen.total, "producto", "productos")}
                                        {resumen.variantes > 0 && <span className="font-normal text-content-subtle"> y {resumen.variantes} variantes</span>}
                                    </p>
                                    <p className="text-[12px] text-content-subtle mt-0.5">
                                        {resumen.total === 0 ? "No hay productos aquí." : "Hoy: " + ["G", "E", "R", "A"]
                                            .filter(t => resumen.por_tipo[t] > 0)
                                            .map(t => `${resumen.por_tipo[t]} ${nombre(t, resumen.por_tipo[t])}`)
                                            .join(" · ")}
                                    </p>
                                </div>
                            ) : null}
                        </div>

                        <div className="space-y-2">
                            <div className={LABEL}>Pasar a</div>
                            <Segmented
                                className="w-full [&>button]:flex-1 [&>button]:justify-center"
                                value={tipo}
                                onChange={setTipo}
                                options={OPCIONES_IVA}
                            />
                            <p className="text-[12px] text-content-subtle leading-snug">
                                {tipo === "E"
                                    ? "Exento: la factura lo suma aparte, sin impuesto."
                                    : "El precio no cambia: sigue incluyendo el impuesto y la factura lo separa de la base."}
                                {" "}Lo ya vendido conserva el IVA con que se facturó.
                            </p>
                            {resumen && resumen.total > 0 && aCambiar === 0 && (
                                <p className="text-[12px] text-content-subtle">Todos ya están {NOMBRE[tipo]}.</p>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <div className={LABEL}>Qué hacer</div>
                                <Segmented
                                    className="w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:px-2"
                                    value={direccion}
                                    onChange={setDireccion}
                                    options={[{ key: "sumar", label: "Sumar el IVA" }, { key: "quitar", label: "Quitar el IVA" }]}
                                />
                            </div>
                            <div className="space-y-2">
                                <div className={LABEL}>Redondeo</div>
                                <CustomSelect value={redondeo} onChange={setRedondeo} options={REDONDEOS} height="h-[36px]" />
                            </div>
                        </div>

                        <div className={`${CAJA} min-h-[64px]`}>
                            {!cuerpo ? (
                                <p className="text-[13px] text-content-subtle">Elige una categoría para ver sus precios.</p>
                            ) : cargandoVista && !vista ? (
                                <Spinner className="w-4 h-4" />
                            ) : vista ? (
                                <div className="min-w-0 space-y-2.5">
                                    <div>
                                        <p className="text-[14px] font-semibold text-content dark:text-white">
                                            {totalPrecios + vista.sucursales === 0
                                                ? "No hay precios que cambiar"
                                                : `${plural(vista.productos, "producto cambia", "productos cambian")} de precio`}
                                        </p>
                                        <p className="text-[12px] text-content-subtle mt-0.5 leading-snug">
                                            {[
                                                vista.variantes > 0 && `${plural(vista.variantes, "variante", "variantes")}`,
                                                vista.sucursales > 0 && `${plural(vista.sucursales, "precio propio de sucursal", "precios propios de sucursal")}`,
                                                vista.mayor > 0 && `${plural(vista.mayor, "precio al mayor", "precios al mayor")}`,
                                            ].filter(Boolean).join(" · ") || "Cada uno con la alícuota de su producto"}
                                            {vista.exentos > 0 && ` · ${plural(vista.exentos, "exento queda", "exentos quedan")} igual`}
                                        </p>
                                    </div>
                                    {vista.muestra.length > 0 && (
                                        <ul className="divide-y divide-border/60 dark:divide-white/[0.06] border-t border-border/60 dark:border-white/[0.06]">
                                            {vista.muestra.map(m => (
                                                <li key={m.id} className="flex items-baseline justify-between gap-3 pt-1.5 pb-1 text-[13px]">
                                                    <span className="min-w-0 truncate text-content dark:text-white">
                                                        {m.name}
                                                        {m.iva_tipo !== "G" && <span className="text-content-subtle"> · {TASA[m.iva_tipo]}</span>}
                                                    </span>
                                                    <span className="shrink-0 tabular-nums whitespace-nowrap">
                                                        <span className="text-content-subtle">{ref(m.antes)}</span>
                                                        <span className="text-content-subtle px-1.5">→</span>
                                                        <span className="font-semibold text-content dark:text-white">{ref(m.despues)}</span>
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ) : null}
                        </div>

                        {repetido && (
                            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 space-y-2">
                                <p className="text-[13px] text-content dark:text-white leading-snug">
                                    Ya {direccion === "sumar" ? "sumaste" : "quitaste"} el IVA el {fecha(vista.vigente.created_at)}
                                    {vista.vigente.por ? ` (${vista.vigente.por})` : ""}.
                                    {direccion === "sumar" ? " Sumarlo otra vez cobraría el impuesto dos veces." : " Quitarlo otra vez dejaría los precios por debajo de lo que eran."}
                                </p>
                                <label className="flex items-center gap-2 text-[13px] text-content dark:text-white cursor-pointer">
                                    <Check checked={otraVez} onChange={setOtraVez} title="Aplicarlo de nuevo" />
                                    Sé lo que hago, aplicarlo de nuevo
                                </label>
                            </div>
                        )}

                        <p className="text-[12px] text-content-subtle leading-snug">
                            El margen de cada producto no cambia: ahora el precio es costo más margen más IVA.
                            Las cotizaciones ya hechas conservan su precio; las cuentas abiertas en caja toman el nuevo.
                        </p>

                        {vista?.vigente && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-border/60 dark:border-white/[0.06]">
                                <p className="text-[12px] text-content-subtle leading-snug min-w-0">
                                    Último ajuste: {vista.vigente.direccion === "sumar" ? "IVA sumado" : "IVA quitado"} el {fecha(vista.vigente.created_at)}
                                    {" "}a {plural(vista.vigente.productos, "producto", "productos")}.
                                    {confirmarDeshacer && " Los precios que cambiaron después se dejan como están."}
                                </p>
                                {confirmarDeshacer ? (
                                    <div className="flex gap-2 shrink-0">
                                        <Button variant="ghost" onClick={() => setConfirmarDeshacer(false)} className="h-10 sm:h-9 flex-1 sm:flex-none">No</Button>
                                        <Button variant="danger" onClick={deshacer} className="h-10 sm:h-9 flex-1 sm:flex-none">Sí, deshacer</Button>
                                    </div>
                                ) : (
                                    <Button variant="ghost" onClick={() => setConfirmarDeshacer(true)} className="h-10 sm:h-9 shrink-0">Deshacer</Button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
}
