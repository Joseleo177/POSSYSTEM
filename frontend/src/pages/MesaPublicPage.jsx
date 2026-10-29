import { useCallback, useEffect, useRef, useState } from "react";
import { publicApi } from "../services/api";
import { fmtTime } from "../helpers/dates";
import { resolveImageUrl } from "../helpers/image";

// La página del QR de la mesa (/mesa/<código>): el cliente, desde su teléfono, ve cómo va cada
// ronda en la cocina, lo que lleva pedido y cuánto va la cuenta, y la pide sin levantar la
// mano. Va fuera de la sesión del sistema, como el catálogo público (ver App.jsx). Se refresca
// sola cada 15 s: en Vercel no hay conexiones abiertas, así que no hay aviso en vivo.

const CADA = 15000;

// Cómo se le dice al cliente cada estado de la cocina.
const ESTADO = {
    nueva:      { txt: "Recibido",        paso: 1, tono: "text-content-subtle" },
    preparando: { txt: "En preparación",  paso: 2, tono: "text-amber-700" },
    lista:      { txt: "Listo, ya sale",  paso: 3, tono: "text-emerald-700" },
    entregada:  { txt: "Servido",         paso: 4, tono: "text-content-subtle" },
};
const PASOS = ["Recibido", "En preparación", "Listo"];

const cant = (q) => {
    const n = Number(q || 0);
    return Number.isInteger(n) ? String(n) : n.toLocaleString("es-VE", { maximumFractionDigits: 3 });
};
const dinero = (n, sym) => `${sym}${sym.length > 1 ? " " : ""}${Number(n || 0).toFixed(2)}`;

const Check = ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
);

function Ronda({ r }) {
    const e = ESTADO[r.status] || ESTADO.nueva;
    const servida = r.status === "entregada";
    return (
        <div className={`rounded-2xl border bg-white px-4 py-3.5 ${r.status === "lista" ? "border-emerald-500/50" : "border-border/70"}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] text-content-subtle">Ronda {r.n} · {fmtTime(r.sent_at)}</div>
                <div className={`text-[13px] font-semibold flex items-center gap-1.5 ${e.tono}`}>
                    {r.status === "preparando" && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
                    {(r.status === "lista" || servida) && <Check className="w-3.5 h-3.5" />}
                    {e.txt}
                </div>
            </div>

            {/* Recibido → En preparación → Listo. Servido ya no necesita la barra. */}
            {!servida && (
                <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                    {PASOS.map((p, i) => (
                        <div key={p}>
                            <div className={`h-1.5 rounded-full ${i < e.paso ? (e.paso === 3 ? "bg-emerald-500" : "bg-brand-500") : "bg-surface-3"}`} />
                            <div className={`mt-1 text-[11px] ${i < e.paso ? "text-content" : "text-content-subtle"}`}>{p}</div>
                        </div>
                    ))}
                </div>
            )}

            <ul className={`mt-3 space-y-1.5 ${servida ? "opacity-70" : ""}`}>
                {r.items.map((it, i) => (
                    <li key={i} className="flex gap-3 text-[14px] text-content">
                        <span className="font-semibold tabular-nums w-6 text-right shrink-0">{cant(it.quantity)}</span>
                        <span className="min-w-0">
                            {it.name}
                            {it.modifiers && <span className="block text-[12px] text-content-subtle">{it.modifiers}</span>}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default function MesaPublicPage({ token }) {
    const [d, setD] = useState(null);
    const [error, setError] = useState(null);
    const [pidiendo, setPidiendo] = useState(false);
    const [avisoError, setAvisoError] = useState(null);

    const yaCargo = useRef(false);
    const cargar = useCallback(async () => {
        try {
            const r = await publicApi.mesa(token);
            setD(r.data);
            setError(null);
            yaCargo.current = true;
        } catch (e) {
            // Sin conexión un momento no borra lo que ya se ve; un código malo sí.
            if (e?.status === 404) setError(e.message || "Esta mesa no existe");
            else if (!yaCargo.current) setError(e?.message || "No se pudo cargar la mesa");
        }
    }, [token]);

    useEffect(() => {
        cargar();
        const t = setInterval(() => { if (document.visibilityState === "visible") cargar(); }, CADA);
        const alVolver = () => { if (document.visibilityState === "visible") cargar(); };
        document.addEventListener("visibilitychange", alVolver);
        return () => { clearInterval(t); document.removeEventListener("visibilitychange", alVolver); };
    }, [cargar]);

    useEffect(() => {
        if (d?.table?.name) document.title = `${d.table.name} · ${d.store?.name || ""}`;
    }, [d?.table?.name, d?.store?.name]);

    const pedirCuenta = async () => {
        setPidiendo(true);
        setAvisoError(null);
        try {
            const r = await publicApi.pedirCuenta(token);
            setD(r.data);
        } catch (e) {
            setAvisoError(e?.message || "No se pudo avisar. Intenta de nuevo.");
        } finally { setPidiendo(false); }
    };

    if (error) {
        return (
            <div className="min-h-[100dvh] bg-surface-1 flex items-center justify-center px-6 text-center">
                <div>
                    <div className="text-[16px] font-semibold text-content">{error}</div>
                    <div className="text-[14px] text-content-subtle mt-1">Pídele ayuda al mesonero.</div>
                </div>
            </div>
        );
    }
    if (!d) {
        return (
            <div className="min-h-[100dvh] bg-surface-1 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const sym = d.currency?.symbol || "Ref.";
    const enBs = d.currency?.bs_rate && d.currency?.bs_symbol ? d.total * d.currency.bs_rate : null;
    const hayListas = d.rounds.some(r => r.status === "lista");

    return (
        <div className="min-h-[100dvh] bg-surface-1 text-content">
            <div className="max-w-[560px] mx-auto px-4 pb-10">
                {/* Cabecera: la tienda y la mesa */}
                <header className="pt-6 pb-4 flex items-center gap-3">
                    {d.store.logo_url && (
                        <img src={resolveImageUrl(d.store.logo_url)} alt="" className="h-12 w-auto max-w-[120px] object-contain rounded-lg" />
                    )}
                    <div className="min-w-0">
                        <div className="text-[13px] text-content-subtle truncate">{d.store.name}</div>
                        <h1 className="text-[22px] font-bold tracking-tight leading-tight">
                            {d.table.name}{d.table.area ? <span className="text-content-subtle font-semibold"> · {d.table.area}</span> : null}
                        </h1>
                    </div>
                </header>

                {!d.open ? (
                    <div className="rounded-2xl border border-border/70 bg-white px-5 py-8 text-center">
                        <div className="text-[16px] font-semibold">Todavía no hay un pedido en esta mesa</div>
                        <div className="text-[14px] text-content-subtle mt-1.5">
                            Cuando el mesonero tome tu pedido, aquí vas a ver cómo va en la cocina.
                        </div>
                        {d.store.menu_url && (
                            <a href={d.store.menu_url} className="btn-accent inline-flex items-center justify-center h-12 px-6 rounded-xl text-[15px] font-semibold mt-5">Ver el menú</a>
                        )}
                    </div>
                ) : (
                    <div className="space-y-5">
                        {hayListas && (
                            <div className="rounded-2xl bg-emerald-50 border border-emerald-500/40 px-4 py-3 text-[14px] text-emerald-800 flex items-center gap-2">
                                <Check /> Tu pedido está listo: ya te lo llevan a la mesa.
                            </div>
                        )}

                        <section>
                            <h2 className="text-[15px] font-semibold mb-2">Tu pedido</h2>
                            {d.rounds.length === 0 ? (
                                <div className="rounded-2xl border border-border/70 bg-white px-4 py-4 text-[14px] text-content-subtle">
                                    Tu pedido todavía no llega a la cocina.
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {[...d.rounds].reverse().map(r => <Ronda key={r.n} r={r} />)}
                                </div>
                            )}
                        </section>

                        <section>
                            <h2 className="text-[15px] font-semibold mb-2">Tu cuenta</h2>
                            <div className="rounded-2xl border border-border/70 bg-white px-4 py-3.5">
                                <ul className="space-y-1.5">
                                    {d.lines.map((l, i) => (
                                        <li key={i} className="flex items-baseline justify-between gap-3 text-[14px]">
                                            <span className="min-w-0"><span className="tabular-nums text-content-subtle">{cant(l.quantity)} × </span>{l.name}</span>
                                            <span className="tabular-nums shrink-0">{dinero(l.subtotal, sym)}</span>
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-3 pt-3 border-t border-border/70 flex items-baseline justify-between">
                                    <span className="text-[14px] text-content-subtle">Total</span>
                                    <span className="text-right">
                                        <span className="block text-[22px] font-bold tracking-tight tabular-nums">{dinero(d.total, sym)}</span>
                                        {enBs != null && <span className="block text-[13px] text-content-subtle tabular-nums">{dinero(enBs, d.currency.bs_symbol)}</span>}
                                    </span>
                                </div>
                                <p className="mt-2 text-[12px] text-content-subtle">El monto final te lo confirma el mesonero al cobrar.</p>
                            </div>
                        </section>

                        {d.bill_requested ? (
                            <div className="rounded-2xl bg-white border border-border/70 px-4 py-4 text-center">
                                <div className="text-[15px] font-semibold flex items-center justify-center gap-2"><Check /> Ya pediste la cuenta</div>
                                <div className="text-[13px] text-content-subtle mt-1">El mesonero viene en camino.</div>
                            </div>
                        ) : (
                            <div>
                                <button onClick={pedirCuenta} disabled={pidiendo}
                                    className="btn-accent w-full h-12 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                                    {pidiendo && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                                    Pedir la cuenta
                                </button>
                                {avisoError && <p className="mt-2 text-[13px] text-red-600 text-center">{avisoError}</p>}
                            </div>
                        )}

                        {d.store.menu_url && (
                            <a href={d.store.menu_url} className="block text-center text-[14px] font-medium text-brand-700 py-2">Ver el menú</a>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
