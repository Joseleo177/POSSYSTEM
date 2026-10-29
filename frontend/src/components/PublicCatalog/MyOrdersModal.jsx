import OrderCard, { EN_CURSO } from "./OrderCard";
import CatalogSheet, { SheetHeader, sheetSkin } from "./CatalogSheet";
import { toNameCase } from "../../helpers";

// Lista de pedidos que este navegador envió. Los rechazados no vienen del servidor —se borran
// al rechazarlos— así que llegan aparte en rejectedIds y se muestran igual, para que el cliente
// no se quede esperando algo que ya no va a llegar.
//
// Ordenada como la piensa el cliente (29-10-2026, "se puede organizar mejor"): arriba un
// resumen —cuántos siguen en curso y cuánto falta pagar—, después "En curso" y al final el
// historial agrupado por día ("Hoy", "Ayer", "26 de octubre"). Antes era una sola lista
// cronológica donde lo pagado hace dos días tapaba lo que se estaba preparando.
//
// En el teléfono sube como hoja desde abajo; en escritorio es un diálogo centrado. `panel` (el
// color del panel de la tienda) la pinta con la piel de la carta: ver CatalogSheet.

const diaDe = (iso) => {
    if (!iso) return "Sin fecha";
    const d = new Date(iso);
    const hoy = new Date();
    const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
    const mismo = (a, b) => a.toDateString() === b.toDateString();
    if (mismo(d, hoy)) return "Hoy";
    if (mismo(d, ayer)) return "Ayer";
    return d.toLocaleDateString("es-VE", { day: "numeric", month: "long", ...(d.getFullYear() !== hoy.getFullYear() ? { year: "numeric" } : {}) });
};

function Grupo({ titulo, cuenta, skin, children }) {
    return (
        <section>
            <h3 className={`flex items-center gap-2 px-1 mb-2 text-[13px] font-semibold ${skin.muted}`}>
                {titulo}
                {cuenta != null && <span className={`h-5 min-w-[20px] px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center tabular-nums ${skin.carta ? "bg-black/[0.06]" : "bg-surface-3 dark:bg-white/10"}`}>{cuenta}</span>}
            </h3>
            <div className={skin.carta ? "space-y-2.5" : `rounded-xl border ${skin.line} divide-y ${skin.divide} overflow-hidden`}>{children}</div>
        </section>
    );
}

export default function MyOrdersModal({
    open, onClose, orders, loading, error, rejectedIds,
    onSelectOrder, onReload, fmt, baseCur, identity, panel = null,
}) {
    if (!open) return null;
    const skin = sheetSkin(panel);
    const lista = [
        ...(orders || []),
        ...rejectedIds.map(id => ({
            id,
            stage: "rechazado",
            stage_label: "No procesado",
            stage_detail: "La tienda no procesó este pedido. Consúltalo con ellos.",
            items: [],
            _rechazado: true,
        })),
    ];
    const enCurso = lista.filter(o => EN_CURSO.includes(o.stage));
    const historial = lista.filter(o => !EN_CURSO.includes(o.stage));
    const porDia = [];
    for (const o of historial) {
        const dia = o._rechazado ? "No procesados" : diaDe(o.created_at);
        const g = porDia.find(x => x.dia === dia);
        if (g) g.items.push(o); else porDia.push({ dia, items: [o] });
    }
    const falta = enCurso.reduce((a, o) => a + (o.owed > 0.009 ? o.owed : 0), 0);
    let i = 0;
    const card = (o) => (
        <OrderCard key={o._rechazado ? `rej-${o.id}` : o.id} order={o} index={i++}
            fmt={fmt} baseCur={baseCur} onSelect={onSelectOrder} skin={skin} />
    );

    return (
        <CatalogSheet skin={skin} onClose={() => onClose()} label="Mis pedidos" z="z-40" width="sm:max-w-md">
            <SheetHeader
                skin={skin}
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 7h12l-1 12.2a2 2 0 01-2 1.8H9a2 2 0 01-2-1.8L6 7z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10V6a3 3 0 016 0v4" /></svg>}
                title="Mis pedidos"
                subtitle={[toNameCase(identity?.name), identity?.document].filter(Boolean).join(" · ")}
                border={!skin.carta}
                onClose={() => onClose()}
                actions={
                    <button type="button" onClick={onReload} title="Actualizar" aria-label="Actualizar"
                        className={`w-9 h-9 flex items-center justify-center transition-colors ${skin.iconBtn}`}>
                        <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                }
            />

            <div className={`flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${skin.carta ? "" : "pt-3"}`}>
                {loading && !orders ? (
                    <div className="space-y-2.5">
                        {Array.from({ length: 3 }).map((_, k) => (
                            <div key={k} className={`${skin.carta ? skin.card : `rounded-xl border ${skin.line}`} px-4 py-4 flex gap-3`}>
                                <span className="w-11 h-11 rounded-2xl bg-black/[0.06] animate-pulse shrink-0" />
                                <span className="flex-1 space-y-2.5 pt-1">
                                    <span className="block h-3.5 w-1/2 rounded-full bg-black/[0.07] animate-pulse" />
                                    <span className="block h-3 w-3/4 rounded-full bg-black/[0.05] animate-pulse" />
                                </span>
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    <p className="py-16 px-6 text-center text-[13px] font-medium text-red-600 dark:text-red-400">{error}</p>
                ) : lista.length === 0 ? (
                    <div className="py-14 px-6 text-center">
                        <div className={`w-16 h-16 mx-auto flex items-center justify-center ${skin.carta ? "rounded-3xl bg-brand-500/10 text-brand-500" : "rounded-full bg-surface-2 dark:bg-white/[0.06] text-content-subtle"}`}>
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                        </div>
                        <p className={`mt-4 ${skin.section}`}>Todavía no has pedido nada</p>
                        <p className={`mt-1 text-[13px] ${skin.subtle}`}>Cuando envíes tu primer pedido lo verás aquí, con su avance.</p>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {/* Resumen: lo que el cliente quiere saber antes de leer la lista. */}
                        <div className="grid grid-cols-2 gap-2.5">
                            <div className={`${skin.carta ? skin.card : `rounded-xl border ${skin.line}`} px-3.5 py-3`}>
                                <div className={`text-[12px] ${skin.subtle}`}>En curso</div>
                                <div className={`mt-0.5 flex items-center gap-2 font-display text-[22px] font-bold ${skin.ink} tabular-nums leading-tight`}>
                                    {enCurso.length}
                                    {enCurso.length > 0 && <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" aria-hidden="true" />}
                                </div>
                            </div>
                            <div className={`${skin.carta ? skin.card : `rounded-xl border ${skin.line}`} px-3.5 py-3`}>
                                <div className={`text-[12px] ${skin.subtle}`}>Por pagar</div>
                                <div className={`mt-0.5 font-display text-[22px] font-bold tabular-nums leading-tight ${falta > 0 ? "text-amber-700" : skin.ink}`}>
                                    {falta > 0 ? fmt(falta, baseCur) : "Al día"}
                                </div>
                            </div>
                        </div>

                        {enCurso.length > 0 && (
                            <Grupo titulo="En curso" cuenta={enCurso.length} skin={skin}>{enCurso.map(card)}</Grupo>
                        )}
                        {porDia.map(g => (
                            <Grupo key={g.dia} titulo={g.dia} skin={skin}>{g.items.map(card)}</Grupo>
                        ))}
                    </div>
                )}
            </div>
        </CatalogSheet>
    );
}
