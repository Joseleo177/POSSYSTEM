import { fmtMoney } from "../../helpers";

// Elegir los adicionales de un plato: un bloque por grupo ("Término de la carne · Elige 1"),
// con las opciones como filas táctiles. Con tope de 1 se comporta como radio (tocar otra la
// cambia); con más, como casillas hasta el tope. La regla final la valida el servidor
// (services/addons.js resolver); aquí solo se guía y se bloquea lo evidente.
//
// `value` es la lista de opciones elegidas: [{ id, name, price, group_id }].
// `tone`: "app" sigue el tema claro/oscuro del sistema; "catalog" es la ficha del tema de menú
// del catálogo público, que tiene fondo claro fijo y no debe cambiar con el modo oscuro.

/** Primer grupo obligatorio sin completar, o null si ya se puede pedir. */
export function faltante(groups, value) {
    for (const g of groups || []) {
        const n = (value || []).filter(o => o.group_id === g.id).length;
        if (n < g.min_select) return g;
    }
    return null;
}

/** Suma de los extras con precio de una lista de opciones elegidas. */
export const precioExtras = (value) => (value || []).reduce((s, o) => s + (Math.round((parseFloat(o.price) || 0) * 100) / 100), 0);

const TONOS = {
    app: {
        titulo: "text-content dark:text-white",
        sub: "text-content-subtle",
        pide: "text-amber-700 dark:text-amber-400",
        fila: "border-border dark:border-white/10 bg-white dark:bg-white/[0.03]",
        filaOn: "border-brand-500 bg-brand-500/[0.08] dark:border-brand-400",
        texto: "text-content dark:text-white",
        marca: "border-border dark:border-white/25",
        marcaOn: "border-brand-600 bg-brand-600 dark:border-brand-400 dark:bg-brand-400",
    },
    catalog: {
        titulo: "text-neutral-900",
        sub: "text-neutral-500",
        pide: "text-amber-700",
        fila: "border-black/10 bg-white",
        filaOn: "border-brand-500 bg-brand-500/[0.08]",
        texto: "text-neutral-900",
        marca: "border-black/20",
        marcaOn: "border-brand-500 bg-brand-500",
    },
};

// `fmtPrice`: cómo se escribe el precio de un extra; la caja lo pasa en la moneda que tiene en
// pantalla (puede ser bolívares). Sin él, en moneda base con `sym`.
export default function AddonPicker({ groups, value = [], onChange, sym = "Ref.", tone = "app", fmtPrice }) {
    const t = TONOS[tone] || TONOS.app;

    const tocar = (g, o) => {
        if (o.agotado) return;
        const delGrupo = value.filter(v => v.group_id === g.id);
        const ya = delGrupo.some(v => v.id === o.id);
        const resto = value.filter(v => v.group_id !== g.id);
        if (ya) return onChange([...resto, ...delGrupo.filter(v => v.id !== o.id)]);
        // Se guarda la opción entera: la caja necesita el producto del extra y su existencia.
        if (g.max_select === 1) return onChange([...resto, { ...o, group_id: g.id }]);
        if (g.max_select && delGrupo.length >= g.max_select) return;
        onChange([...resto, ...delGrupo, { ...o, group_id: g.id }]);
    };

    return (
        <div className="space-y-4">
            {groups.map(g => {
                const n = value.filter(v => v.group_id === g.id).length;
                const lleno = g.max_select && g.max_select > 1 && n >= g.max_select;
                const pide = g.min_select > 0 && n < g.min_select;
                return (
                    <section key={g.id}>
                        <header className="flex items-baseline justify-between gap-3 mb-1.5">
                            <h4 className={`text-[14px] font-semibold ${t.titulo}`}>{g.name}</h4>
                            <span className={`text-[12px] whitespace-nowrap ${pide ? `${t.pide} font-medium` : t.sub}`}>
                                {g.min_select > 0 ? `${g.rule} · obligatorio` : g.rule}
                            </span>
                        </header>
                        <div className="space-y-1.5">
                            {g.options.map(o => {
                                const on = value.some(v => v.id === o.id);
                                const bloqueada = o.agotado || (!on && lleno);
                                return (
                                    <button key={o.id} type="button" onClick={() => tocar(g, o)} disabled={bloqueada}
                                        className={`w-full min-h-[48px] px-3.5 py-2 rounded-xl border flex items-center gap-3 text-left transition-colors disabled:opacity-45 ${on ? t.filaOn : t.fila}`}>
                                        <span className={`w-5 h-5 shrink-0 border-2 flex items-center justify-center ${g.max_select === 1 ? "rounded-full" : "rounded-md"} ${on ? t.marcaOn : t.marca}`}>
                                            {on && (g.max_select === 1
                                                ? <span className="w-2 h-2 rounded-full bg-white" />
                                                : <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" /></svg>)}
                                        </span>
                                        <span className={`flex-1 min-w-0 text-[14px] ${t.texto}`}>{o.name}</span>
                                        <span className={`text-[13px] tabular-nums whitespace-nowrap ${t.sub}`}>
                                            {o.agotado ? "Agotado" : o.price > 0 ? `+ ${fmtPrice ? fmtPrice(o.price) : fmtMoney(o.price, sym)}` : ""}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
