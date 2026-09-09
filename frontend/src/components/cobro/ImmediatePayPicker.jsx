import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";
import { journalsForWarehouse } from "../../helpers";
import MethodBankLogo from "./MethodBankLogo";

// Botonera de cobro rápido para "Pago Inmediato". Dos o tres toques, botones grandes y
// numerados como el autopago del banco, para operar con el teclado sin buscar el ratón:
//
//   1. Método de pago  (Efectivo, Punto de venta, Pago móvil, Transferencia…)
//   2. Banco           — o moneda, cuando el método no lleva banco (Efectivo)
//   3. Caja            — solo si el banco/moneda tiene más de una caja para ese método
//
// Al llegar a una sola caja se cierra y se abre "Registrar pago" con ella ya fijada.

function ordenar(a, b) {
    return (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name));
}

function BotonGrande({ n, name, image, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="group relative flex flex-col items-center justify-center gap-2 h-28 rounded-2xl border border-border/30 dark:border-white/10 bg-white/[0.02] dark:bg-white/[0.03] px-3 text-center transition-all hover:border-brand-500/60 hover:bg-brand-500/5 focus:outline-none focus:border-brand-500/70 focus:bg-brand-500/5"
        >
            <span className="absolute top-2 left-2 min-w-[16px] h-4 px-1 rounded border border-current/30 text-[9px] font-black leading-[15px] text-center text-content-subtle dark:text-white/40">
                {n}
            </span>
            <MethodBankLogo src={image} size={44} rounded="rounded-xl" />
            <span className="text-[12px] font-black uppercase tracking-wide text-content dark:text-white leading-tight line-clamp-2">
                {name}
            </span>
        </button>
    );
}

export default function ImmediatePayPicker({ warehouseId, onPick, onClose }) {
    const { activePaymentMethods, activeJournals, activeBanks, activeCurrencies, baseCurrency } = useApp();

    const journals = useMemo(
        () => journalsForWarehouse(activeJournals, warehouseId),
        [activeJournals, warehouseId],
    );

    const journalsOfMethod = (code) => journals.filter(j => j.type === code).sort(ordenar);

    // Agrupa los diarios de un método: por banco si lo tienen, si no por moneda. Una caja de
    // efectivo no tiene banco pero sí moneda (Bs / divisa), que es la decisión que importa ahí.
    const grupos = (js) => {
        const conBanco = js.filter(j => j.bank_id);
        if (conBanco.length) {
            const ids = [...new Set(conBanco.map(j => j.bank_id))];
            return ids
                .map(id => {
                    const propios = js.filter(j => j.bank_id === id);
                    const banco = (activeBanks || []).find(b => b.id === id);
                    return {
                        key: `b${id}`, kind: "bank",
                        name: banco?.name || "Banco",
                        sort_order: banco?.sort_order ?? 0,
                        image: banco?.image_url || null,
                        journals: propios,
                    };
                })
                .sort(ordenar);
        }
        // Sin banco: por moneda. currency_id vacío = moneda base.
        const monedaDe = (j) => j.currency_id || baseCurrency?.id || 0;
        const ids = [...new Set(js.map(monedaDe))];
        return ids
            .map(id => {
                const propios = js.filter(j => monedaDe(j) === id);
                const cur = (activeCurrencies || []).find(c => c.id === id);
                return {
                    key: `c${id}`, kind: "currency",
                    name: cur?.name || cur?.code || "Moneda",
                    sort_order: cur?.is_base ? -1 : (cur?.sort_order ?? 0),
                    image: null,
                    journals: propios,
                };
            })
            .sort(ordenar);
    };

    // Navegación: método elegido y, dentro, grupo (banco/moneda) elegido.
    const [sel, setSel] = useState({ method: null, group: null });

    const methods = useMemo(
        () => (activePaymentMethods || [])
            .filter(m => journals.some(j => j.type === m.code))
            .sort(ordenar),
        [activePaymentMethods, journals],
    );

    const method = methods.find(m => m.code === sel.method) || null;
    const groups = useMemo(
        () => (sel.method ? grupos(journalsOfMethod(sel.method)) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [sel.method, journals, activeBanks, activeCurrencies],
    );
    const group = groups.find(g => g.key === sel.group) || null;

    // Baja tantos niveles como se pueda sin preguntar: método con una sola caja, o banco con
    // una sola caja, entran directo al cobro.
    const elegirMetodo = (m) => {
        const js = journalsOfMethod(m.code);
        if (js.length === 1) return onPick(js[0]);
        const gs = grupos(js);
        if (gs.length === 1) {
            if (gs[0].journals.length === 1) return onPick(gs[0].journals[0]);
            return setSel({ method: m.code, group: gs[0].key });
        }
        setSel({ method: m.code, group: null });
    };

    const elegirGrupo = (g) => {
        if (g.journals.length === 1) return onPick(g.journals[0]);
        setSel(s => ({ ...s, group: g.key }));
    };

    const step = !sel.method ? "method" : !sel.group ? "group" : "journal";

    // La imagen que se muestra en cada botón: el logo del método o del banco. La moneda y la
    // caja no tienen logo propio, así que heredan el del banco del grupo o el del método.
    const items = step === "method"
        ? methods.map(m => ({ key: m.code, name: m.name, image: m.image_url, run: () => elegirMetodo(m) }))
        : step === "group"
            ? groups.map(g => ({ key: g.key, name: g.name, image: g.image || method?.image_url, run: () => elegirGrupo(g) }))
            : (group?.journals || []).map(j => ({ key: j.id, name: j.name, image: group?.image || method?.image_url, run: () => onPick(j) }));

    const volver = () => {
        if (step === "journal") return setSel(s => ({ ...s, group: null }));
        if (step === "group") return setSel({ method: null, group: null });
        return onClose();
    };

    const header = step === "method"
        ? { tag: "Cobro inmediato", title: "¿Cómo paga el cliente?" }
        : step === "group"
            ? { tag: groups[0]?.kind === "bank" ? "Elige el banco" : "Elige la moneda", title: method?.name || "" }
            : { tag: "Elige la caja", title: group?.name || "" };

    // Atajos: dígitos disparan el botón de esa posición, Escape retrocede un paso (y desde el
    // primero, cierra). En captura para adelantarse al handler de SaleConfirmModal, que además
    // se inhibe mientras este selector está abierto.
    useEffect(() => {
        const handler = (e) => {
            if (e.key === "Escape") {
                e.preventDefault(); e.stopPropagation();
                volver();
                return;
            }
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            const tag = e.target?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
            const n = parseInt(e.key, 10);
            if (Number.isInteger(n) && n >= 1 && n <= items.length) {
                e.preventDefault(); e.stopPropagation();
                items[n - 1].run();
            }
        };
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, items.length, sel.method, sel.group]);

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150" onKeyDown={e => e.stopPropagation()}>
            <div className="w-full max-w-md bg-white dark:bg-surface-dark-2 border border-border/30 dark:border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-3 duration-200 ease-out">

                <div className="px-5 py-4 border-b border-border/20 dark:border-white/5 flex items-center gap-3">
                    <button
                        type="button"
                        onClick={volver}
                        className="w-8 h-8 shrink-0 rounded-lg border border-border/30 dark:border-white/10 flex items-center justify-center text-content-subtle dark:text-white/40 hover:text-content dark:hover:text-white transition-all"
                        title={step === "method" ? "Cancelar" : "Volver"}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">
                            {header.tag}
                        </div>
                        <div className="text-sm font-black text-content dark:text-white truncate">
                            {header.title}
                        </div>
                    </div>
                </div>

                <div className="px-5 py-5">
                    {items.length === 0 ? (
                        <p className="text-[12px] font-bold text-content-subtle dark:text-white/40 text-center py-6">
                            No hay cajas de cobro configuradas para esta sucursal.
                        </p>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                            {items.map((it, idx) => (
                                <BotonGrande key={it.key} n={idx + 1} name={it.name} image={it.image} onClick={it.run} />
                            ))}
                        </div>
                    )}

                    <div className="flex items-center justify-center gap-3 pt-4 text-[9px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">
                        <span>1 – {items.length} elegir</span>
                        <span className="opacity-40">·</span>
                        <span>Esc {step === "method" ? "cancelar" : "volver"}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
