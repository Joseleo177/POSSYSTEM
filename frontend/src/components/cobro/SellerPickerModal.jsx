import { useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import { api } from "../../services/api";
import { toNameCase } from "../../helpers";

// Vendedores activos, guardados un rato: la caja abre esta lista en cada venta y cambian poco.
// Se vuelven a pedir pasados 5 minutos (un vendedor nuevo aparece sin recargar la página).
let cache = { at: 0, data: null };
const VIDA_MS = 5 * 60 * 1000;
export const olvidarVendedores = () => { cache = { at: 0, data: null }; };

const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Quién vendió (comisiones). Se teclea el código corto ("07") o parte del nombre: con un código
 * exacto, Enter lo elige en el acto. Los de la sucursal de la caja van primero.
 */
export default function SellerPickerModal({ open, onClose, onPick, selected, warehouseId, notify }) {
    const [sellers, setSellers] = useState(cache.data || []);
    const [q, setQ] = useState("");
    const [idx, setIdx] = useState(0);

    useEffect(() => {
        if (!open) return;
        setQ(""); setIdx(0);
        if (cache.data && Date.now() - cache.at < VIDA_MS) { setSellers(cache.data); return; }
        api.commissions.sellers()
            .then(r => { cache = { at: Date.now(), data: r.data || [] }; setSellers(cache.data); })
            .catch(e => notify?.(e.message || "No se pudo cargar la lista de vendedores", "err"));
    }, [open, notify]);

    const lista = useMemo(() => {
        const t = sinAcentos(q.trim());
        const propios = (s) => (warehouseId && s.warehouse_id === warehouseId ? 0 : s.warehouse_id ? 2 : 1);
        return sellers
            .filter(s => !t || sinAcentos(s.code).startsWith(t) || sinAcentos(s.name).includes(t))
            .sort((a, b) => propios(a) - propios(b) || String(a.code).localeCompare(String(b.code), "es", { numeric: true }));
    }, [sellers, q, warehouseId]);

    const elegir = (s) => { onPick(s ? { id: s.id, name: s.name, code: s.code } : null); onClose(); };

    const onKeyDown = (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, lista.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
        else if (e.key === "Enter") {
            e.preventDefault();
            const exacto = sellers.find(s => sinAcentos(s.code) === sinAcentos(q.trim()));
            const s = exacto || lista[idx];
            if (s) elegir(s);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="¿Quién vendió?" width={440}>
            <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                    data-autofocus
                    autoComplete="off"
                    spellCheck={false}
                    value={q}
                    onChange={e => { setQ(e.target.value); setIdx(0); }}
                    onKeyDown={onKeyDown}
                    placeholder="Código o nombre del vendedor"
                    className="w-full h-12 sm:h-11 pl-9 pr-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[14px] text-content dark:text-white placeholder:text-content-subtle/60 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
            </div>

            <div className="mt-3 rounded-xl border border-border/70 dark:border-white/[0.08] overflow-hidden">
                <div className="max-h-[50vh] overflow-y-auto divide-y divide-border/60 dark:divide-white/[0.06]">
                    {lista.length === 0 ? (
                        <div className="px-4 py-8 text-center">
                            <p className="text-[13px] font-medium text-content dark:text-white">
                                {sellers.length ? "Ningún vendedor con ese código o nombre" : "Todavía no hay vendedores"}
                            </p>
                            <p className="text-[12px] text-content-subtle mt-1">
                                {sellers.length ? "Revisa el código que te dio el vendedor." : "Se cargan en la app Comisiones → Vendedores."}
                            </p>
                        </div>
                    ) : lista.map((s, i) => {
                        const activo = selected?.id === s.id;
                        return (
                            <button
                                key={s.id}
                                onClick={() => elegir(s)}
                                onMouseEnter={() => setIdx(i)}
                                className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors ${i === idx ? "bg-brand-500/10" : "hover:bg-surface-2 dark:hover:bg-white/[0.04]"}`}
                            >
                                <span className="min-w-[38px] h-8 px-2 rounded-lg bg-surface-2 dark:bg-white/[0.06] text-[13px] font-semibold tabular-nums text-content dark:text-white flex items-center justify-center shrink-0">{s.code}</span>
                                <span className="flex-1 min-w-0 text-[14px] font-medium text-content dark:text-white truncate">{toNameCase(s.name)}</span>
                                {activo && (
                                    <svg className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 mt-4">
                <p className="hidden sm:block text-[12px] text-content-subtle">Enter elige · Esc cierra</p>
                {selected && (
                    <button onClick={() => elegir(null)} className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-medium">
                        Venta sin vendedor
                    </button>
                )}
            </div>
        </Modal>
    );
}
