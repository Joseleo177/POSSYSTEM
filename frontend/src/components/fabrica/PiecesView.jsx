import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { useDebounce } from "../../hooks/useDebounce";
import { toNameCase, fmtDateShort } from "../../helpers";
import { printPieceLabels } from "../../helpers/printPieceLabels";
import Segmented from "../ui/Segmented";
import CustomSelect from "../ui/CustomSelect";
import StatusMark from "../ui/StatusMark";
import { LedgerSkeleton, LedgerEmpty, ledgerRow, stopRow, RowIcon } from "../ui/Ledger";
import {
    DimsInput, useCutUnit, toMm, fmtDims, fmtSize, PIECE_STATUS, ORIGIN_LABEL, orderCode, errMsg,
} from "./shared";

const FILTROS = [
    { key: "activas",    label: "En existencia" },
    { key: "disponible", label: "Disponibles" },
    { key: "en_taller",  label: "En el taller" },
    { key: "todas",      label: "Todas" },
];

// Dónde está la pieza: disponible en su almacén, o en el taller con la orden que la tiene.
const donde = (p) => p.status === "en_taller" && p.shop_order_number
    ? `${orderCode(p.shop_order_number)} · ${p.shop_order_description || ""}`
    : toNameCase(p.warehouse_name);

export default function PiecesView({ warehouses, materials, version, onOpen, onRegister }) {
    const { notify, printerWidth } = useApp();
    // "¿Dónde cabe?" busca un corte: en la unidad en que mide el taller.
    const unit = useCutUnit();
    const [status, setStatus] = useState("activas");
    const [productId, setProductId] = useState("");
    const [warehouseId, setWarehouseId] = useState("");
    const [search, setSearch] = useState("");
    const [w, setW] = useState("");
    const [l, setL] = useState("");
    const [showFit, setShowFit] = useState(false);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    const q = useDebounce(search, 300);
    // El buscador mide según el material elegido: ancho × largo para láminas, largo para tubos.
    const fitMode = materials.find(m => String(m.id) === productId)?.piece_mode || "area";
    const fitW = toMm(w, unit), fitL = toMm(l, unit);
    const hasFit = showFit && fitL > 0 && (fitMode === "length" || fitW > 0);
    const fitKey = hasFit ? `${fitMode}:${fitW}x${fitL}` : "";

    useEffect(() => {
        let vivo = true;
        setLoading(true);
        const params = { status: hasFit ? "disponible" : status, limit: 200 };
        if (productId) params.product_id = productId;
        if (warehouseId) params.warehouse_id = warehouseId;
        if (q.trim()) params.search = q.trim();
        if (hasFit) { params.fit_l = fitL; if (fitMode === "area") params.fit_w = fitW; }
        api.factory.pieces(params)
            .then(r => { if (vivo) setRows(r.data || []); })
            .catch(e => { if (vivo) notify(errMsg(e, "No se pudieron cargar las piezas"), "err"); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [status, productId, warehouseId, q, fitKey, version]);

    const sinMateriales = materials.length === 0;
    const vacio = sinMateriales
        ? { title: "Primero crea un material", hint: "Un producto con control por piezas: la lámina, el tubo o el perfil que se corta." }
        : hasFit ? { title: "No hay una pieza donde quepa", hint: "Ninguna pieza disponible tiene esa medida, ni girándola." }
        : q || productId || warehouseId ? { title: "Nada coincide", hint: "Prueba con otro número o filtro." }
        : { title: "Sin piezas registradas", hint: "Lo que compras se numera al recibirlo en Compras; lo que ya tenías, con Registrar piezas." };

    return (
        <div className="flex-1 flex flex-col overflow-y-auto lg:overflow-hidden -mx-3 sm:-mx-4 -my-2">
            <div className="shrink-0 px-4 py-2 space-y-2 border-b border-border/20 dark:border-white/5">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-44">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-content-subtle pointer-events-none">#</span>
                        <input value={search} onChange={e => setSearch(e.target.value)} className="input h-9 pl-7 text-[13px] w-full tabular-nums"
                            autoComplete="off" spellCheck={false} inputMode="numeric" placeholder="Número de pieza" />
                    </div>
                    {materials.length > 1 && (
                        <CustomSelect value={productId} onChange={setProductId} height="h-9" className="flex-1 sm:flex-none sm:w-56 min-w-0"
                            options={[{ value: "", label: "Todos los materiales" }, ...materials.map(m => ({ value: String(m.id), label: toNameCase(m.name) }))]} />
                    )}
                    {warehouses.length > 1 && (
                        <CustomSelect value={warehouseId} onChange={setWarehouseId} height="h-9" className="flex-1 sm:flex-none sm:w-40 min-w-0"
                            options={[{ value: "", label: "Todos los almacenes" }, ...warehouses.map(x => ({ value: String(x.id), label: toNameCase(x.name) }))]} />
                    )}
                    <button onClick={() => setShowFit(s => !s)}
                        className={`h-9 px-3 rounded-lg text-[13px] font-medium border transition-colors ${showFit ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40" : "btn-outline"}`}>
                        ¿Dónde cabe?
                    </button>
                    {!hasFit && (
                        <div className="w-full sm:w-auto sm:ml-auto overflow-x-auto scrollbar-hide">
                            <Segmented options={FILTROS} value={status} onChange={setStatus} />
                        </div>
                    )}
                </div>
                {showFit && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <span className="text-[12px] text-content-subtle shrink-0">Necesito cortar</span>
                        <div className="flex-1 sm:max-w-sm"><DimsInput mode={fitMode} w={w} l={l} onW={setW} onL={setL} unit={unit} /></div>
                        {hasFit && <span className="text-[12px] text-content-subtle">{fitMode === "area" ? "De la más chica a la más grande, también girada" : "De la más corta a la más larga"}</span>}
                    </div>
                )}
            </div>

            {/* Escritorio */}
            <div className="hidden lg:flex flex-1 min-h-0 flex-col py-3 px-4">
                <div className="card-premium overflow-auto flex-1">
                    <table className="table-ledger min-w-[860px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4 w-[190px]">Pieza</th>
                                <th>Material</th>
                                <th className="w-[170px]">Medidas</th>
                                <th className="w-[110px] text-right">Tamaño</th>
                                <th className="w-[240px]">Estado</th>
                                <th className="w-[60px] pr-4" />
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? <LedgerSkeleton cols={6} rows={8} />
                                : rows.length === 0 ? <LedgerEmpty cols={6} title={vacio.title} hint={vacio.hint} />
                                : rows.map(p => (
                                    <tr key={p.id} {...ledgerRow(() => onOpen(p), p.status === "en_taller" ? "#f59e0b" : undefined)}>
                                        <td className="pl-4">
                                            <div className="text-[14px] font-semibold text-content dark:text-white tabular-nums">#{p.code}</div>
                                            <div className="text-[12px] text-content-subtle whitespace-nowrap">{ORIGIN_LABEL[p.origin] || p.origin} · {fmtDateShort(p.created_at)}</div>
                                        </td>
                                        <td className="max-w-0">
                                            <div className="text-[13px] text-content dark:text-white truncate">{toNameCase(p.product_name)}</div>
                                        </td>
                                        <td className="text-[13px] text-content dark:text-white tabular-nums">
                                            {fmtDims(p)}
                                            {p.is_irregular && hasFit && <div className="text-[12px] text-amber-700 dark:text-amber-400">Mídela antes</div>}
                                        </td>
                                        <td className="text-right text-[13px] text-content dark:text-white tabular-nums">{fmtSize(p.size, p.unit)}</td>
                                        <td className="max-w-0">
                                            <StatusMark status={p.status} map={PIECE_STATUS} />
                                            <div className="text-[12px] text-content-subtle truncate">{donde(p)}</div>
                                        </td>
                                        <td className="pr-4" onClick={stopRow}>
                                            <div className="flex justify-end">
                                                <RowIcon icon="print" title="Imprimir etiqueta" onClick={() => printPieceLabels([p], printerWidth)} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Teléfono y tablet */}
            <div className="lg:hidden px-3 py-3 space-y-2">
                {loading ? (
                    <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                ) : rows.length === 0 ? (
                    <div className="py-16 text-center px-6">
                        <div className="text-[14px] font-semibold text-content dark:text-white">{vacio.title}</div>
                        <div className="text-[13px] text-content-subtle mt-1">{vacio.hint}</div>
                        {onRegister && !sinMateriales && !q && !hasFit && (
                            <button onClick={onRegister} className="btn-outline h-10 px-4 rounded-lg text-[13px] font-medium mt-4">Registrar piezas</button>
                        )}
                    </div>
                ) : rows.map(p => (
                    <div key={p.id} role="button" tabIndex={0} onClick={() => onOpen(p)}
                        onKeyDown={e => { if (e.key === "Enter") onOpen(p); }}
                        style={p.status === "en_taller" ? { boxShadow: "inset 3px 0 0 #f59e0b" } : undefined}
                        className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3 active:scale-[0.99] transition-transform">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[15px] font-semibold text-content dark:text-white tabular-nums">#{p.code}</span>
                            <span className="text-[13px] font-medium text-content dark:text-white tabular-nums">{fmtDims(p)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3">
                            <span className="text-[12px] text-content-subtle truncate">{toNameCase(p.product_name)} · {fmtSize(p.size, p.unit)}</span>
                            <StatusMark status={p.status} map={PIECE_STATUS} />
                        </div>
                        {p.status === "en_taller" && <div className="text-[12px] text-content-subtle truncate mt-0.5">{donde(p)}</div>}
                    </div>
                ))}
            </div>
        </div>
    );
}
