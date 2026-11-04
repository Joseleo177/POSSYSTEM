import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import Segmented from "../ui/Segmented";
import CustomSelect from "../ui/CustomSelect";
import { fmtDateShort, toNameCase } from "../../helpers";

const MAX = 50;
const fmtCant = (n) => (Number(n) || 0).toLocaleString("es-VE", { maximumFractionDigits: 3 });

/**
 * Dar un regalo: qué (de las categorías de regalos, con lo que queda libre en la sucursal del
 * sector), por qué factura (la que saldó, si la hay) y si se entrega ya o queda apartado para la
 * próxima visita. Entregarlo lo descuenta de la existencia; apartarlo lo reserva.
 */
export default function DarRegaloModal({ cliente, ganados = [], bolsaInicial = null, onClose, onDone }) {
    const { notify } = useApp();
    const [ops, setOps] = useState(null);
    const [pid, setPid] = useState(null);
    const [qty, setQty] = useState(1);
    const [modo, setModo] = useState("ahora");
    const [venta, setVenta] = useState(bolsaInicial ? String(bolsaInicial) : (ganados[0] ? String(ganados[0].id) : ""));
    const [notas, setNotas] = useState("");

    useEffect(() => {
        api.cobranza.regalosOpciones(cliente.id)
            .then(r => setOps(r.data))
            .catch(e => { notify(e.message, "err"); setOps({ productos: [] }); });
    }, [cliente.id]);   // eslint-disable-line react-hooks/exhaustive-deps

    const productos = ops?.productos || [];
    const categorias = ops?.categorias || [];
    // Con una sola categoría el rótulo no dice nada: se muestra solo cuando hay varias.
    const grupos = categorias.length > 1
        ? categorias.map(c => ({ id: c.id, name: c.name, items: productos.filter(p => p.category_id === c.id) })).filter(g => g.items.length)
        : [{ id: "todos", name: null, items: productos }];
    const elegido = productos.find(p => p.id === pid);
    // Entregar ahora necesita que esté en la sucursal; apartar, que quede libre (no apartado).
    const tope = elegido ? Math.floor(modo === "ahora" ? Math.min(elegido.stock, elegido.disponible) : elegido.disponible) : 0;
    const alcanza = elegido && qty <= tope;

    const dar = async () => {
        try {
            const r = await api.cobranza.darRegalo(cliente.id, {
                product_id: pid, qty, sale_id: venta ? parseInt(venta) : null,
                entregar: modo === "ahora", notes: notas.trim() || null,
            });
            notify(`${r.data.code} · ${r.data.product_name} ${modo === "ahora" ? "entregado" : "apartado"}`);
            onDone?.(r.data);
        } catch (e) { notify(e.message, "err"); }
    };

    return (
        <Modal open onClose={onClose} title="Dar regalo" width={480}>
            <div className="space-y-4">
                <p className="text-[13px] text-content-subtle">
                    Para <span className="font-semibold text-content dark:text-white">{toNameCase(cliente.name)}</span> · {cliente.sector_name}
                </p>

                {ganados.length > 0 && (
                    <div>
                        <p className="text-[12px] text-content-subtle mb-1.5">Por la factura</p>
                        <CustomSelect value={venta} onChange={setVenta}
                            options={[
                                ...ganados.map(g => ({ value: String(g.id), label: `${g.invoice_number} · ${fmtDateShort(g.day)}` })),
                                { value: "", label: "Sin factura (regalo suelto)" },
                            ]} />
                    </div>
                )}

                <div>
                    <p className="text-[12px] text-content-subtle mb-1.5">Regalo</p>
                    {ops === null ? (
                        <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-12 rounded-lg bg-surface-2 dark:bg-white/[0.04] animate-pulse" />)}</div>
                    ) : categorias.length === 0 ? (
                        <p className="text-[13px] text-warning">Falta elegir las categorías de los regalos en Cobranza → Sectores.</p>
                    ) : productos.length === 0 ? (
                        <p className="text-[13px] text-content-subtle">{categorias.map(c => c.name).join(", ")} no tiene productos. Créalos en Catálogo y carga su existencia.</p>
                    ) : (
                        <div className="rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06] lg:max-h-64 lg:overflow-y-auto custom-scrollbar">
                            {grupos.map(g => (<div key={g.id}>
                            {g.name && <p className="px-3.5 pt-2.5 pb-1 text-[12px] font-medium text-content-subtle bg-surface-2/50 dark:bg-white/[0.02]">{g.name}</p>}
                            {g.items.map(p => {
                                const libre = Math.max(0, p.disponible);
                                const sin = libre <= 0;
                                const on = pid === p.id;
                                return (
                                    <button key={p.id} type="button" disabled={sin} onClick={() => { setPid(p.id); setQty(1); }}
                                        className={`w-full px-3.5 py-3 flex items-center justify-between gap-3 text-left transition-colors disabled:opacity-50 ${on ? "bg-brand-500/[0.06]" : "hover:bg-surface-2/60 dark:hover:bg-white/[0.03]"}`}>
                                        <span className="flex items-center gap-3 min-w-0">
                                            <span className={`w-4 h-4 shrink-0 rounded-full border-2 ${on ? "border-brand-600 bg-brand-600 shadow-[inset_0_0_0_2px_white] dark:shadow-[inset_0_0_0_2px_#111]" : "border-content-subtle/50"}`} />
                                            <span className="text-[13px] font-medium text-content dark:text-white truncate">{p.name}</span>
                                        </span>
                                        <span className={`shrink-0 text-[12px] tabular-nums ${sin ? "text-red-600 dark:text-red-400" : "text-content-subtle"}`}>
                                            {sin ? "Agotado" : `${fmtCant(libre)} ${libre === 1 ? "libre" : "libres"}`}{p.apartado > 0 ? ` · ${fmtCant(p.apartado)} ${p.apartado === 1 ? "apartado" : "apartados"}` : ""}
                                        </span>
                                    </button>
                                );
                            })}
                            </div>))}
                        </div>
                    )}
                </div>

                {elegido && (
                    <>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <Segmented value={modo} onChange={setModo} className="self-start"
                                options={[{ key: "ahora", label: "Lo entrego ahora" }, { key: "despues", label: "Queda por entregar" }]} />
                            <div className="flex items-center gap-2 sm:ml-auto">
                                <button type="button" aria-label="Uno menos" disabled={qty <= 1} onClick={() => setQty(q => Math.max(1, q - 1))}
                                    className="w-10 h-10 rounded-lg border border-border dark:border-white/10 text-content dark:text-white disabled:opacity-40">−</button>
                                <span className="w-8 text-center text-[18px] font-bold tabular-nums text-content dark:text-white">{qty}</span>
                                <button type="button" aria-label="Uno más" disabled={qty >= Math.min(MAX, tope)} onClick={() => setQty(q => Math.min(MAX, q + 1))}
                                    className="w-10 h-10 rounded-lg border border-border dark:border-white/10 text-content dark:text-white disabled:opacity-40">+</button>
                            </div>
                        </div>
                        <p className="text-[12px] text-content-subtle">
                            {modo === "ahora"
                                ? "Sale de la existencia de la sucursal en este momento."
                                : "Queda apartado: no sale todavía, pero ya no se le puede prometer a otro cliente."}
                        </p>
                        {!alcanza && <p className="text-[12px] text-red-600 dark:text-red-400">No alcanza: quedan {fmtCant(Math.max(0, tope))}.</p>}
                        <div>
                            <p className="flex justify-between text-[12px] text-content-subtle mb-1.5"><span>Notas</span><span>Opcional</span></p>
                            <input value={notas} onChange={e => setNotas(e.target.value)} autoComplete="off" placeholder="Ej. color azul"
                                className="h-10 w-full px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                        </div>
                    </>
                )}

                <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
                    <button type="button" onClick={onClose} className="btn-outline h-12 sm:h-10 sm:flex-1 rounded-lg text-[13px] font-medium">Cancelar</button>
                    {elegido && alcanza && (
                        <Button onClick={dar} className="!h-12 sm:!h-10 sm:flex-1">
                            {modo === "ahora" ? "Entregar" : "Apartar"} {qty > 1 ? `${qty} × ` : ""}{elegido.name.toLowerCase()}
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
