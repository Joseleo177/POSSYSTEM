// src/layout/RateBanner.jsx
import React from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import { todayISO } from "../helpers";
import { Spinner } from "../components/ui/Spinner";
import { useBcvRate, checkBcvRate, clearBcvManual, getBcvState } from "../hooks/useBcvRate";

// Aviso de que el BCV publicó una tasa distinta de la que se está usando.
//
// El BCV publica en la tarde la tasa del próximo día hábil, y muchos comercios cobran con ella
// desde que sale —sobre todo el fin de semana—, mientras otros siguen con la del día hasta que
// rija. Por eso no se aplica sola: se ofrece con su fecha valor y quien maneja la tasa decide.
//
// Descartarla vale para ESA tasa mientras su fecha no llega. El día que empieza a regir el
// aviso vuelve (una vez por día), porque ahí ya no es adelantarse: es estar cobrando con una
// tasa vieja. Lo descartado se guarda por empresa, como todo lo que vive en el navegador.
const POLL_MS = 15 * 60 * 1000;
const MIN_GAP_MS = 5 * 60 * 1000;

const fmtRate = (n) => Number(n || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const dismissKey = (companyId) => `bcv-rate-dismissed:${companyId ?? 0}`;

function fechaValor(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return {
        dia: date.toLocaleDateString("es-VE", { weekday: "long" }),
        corta: date.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit" }),
    };
}

export default function RateBanner() {
    const { can, company, currencies, baseCurrency, loadCurrencies, notify } = useApp();
    const { data, manual } = useBcvRate();
    const [applying, setApplying] = React.useState(false);
    const [dismissed, setDismissed] = React.useState(null);

    // El BCV da bolívares por dólar: solo tiene sentido con base USD y el bolívar activo.
    const ves = currencies.find(c => c.code === "VES" && c.active && !c.is_base);
    const enabled = can("currencies.manage") && !!ves && baseCurrency?.code === "USD";

    React.useEffect(() => {
        try { setDismissed(localStorage.getItem(dismissKey(company?.id))); } catch { setDismissed(null); }
    }, [company?.id]);

    React.useEffect(() => {
        if (!enabled) return;
        const check = () => checkBcvRate().catch(() => { /* sin red o sin BCV: se reintenta luego */ });
        check();
        const id = setInterval(check, POLL_MS);
        // Al volver a la pestaña, pero sin repetir si se consultó hace poco: el servidor ya
        // guarda la respuesta unos minutos y no vale la pena ni preguntarle.
        const onVisible = () => {
            if (document.visibilityState === "visible" && Date.now() - getBcvState().at > MIN_GAP_MS) check();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
    }, [enabled]);

    if (!enabled || !data?.rate) return null;

    const actual = parseFloat(ves.exchange_rate) || 0;
    if (Math.abs(data.rate - actual) < 0.00005) return null;

    const hoy = todayISO();
    const futura = !!data.value_date && data.value_date > hoy;
    // Mientras la fecha no llega, descartarla dura hasta ese día; desde que rige, solo hoy.
    const key = `${data.rate}|${data.value_date || ""}|${futura ? "futura" : hoy}`;
    if (!manual && dismissed === key) return null;

    const fv = fechaValor(data.value_date);
    const sym = ves.symbol || "Bs.";

    const keep = () => {
        try { localStorage.setItem(dismissKey(company?.id), key); } catch {}
        setDismissed(key);
        clearBcvManual();
    };

    const apply = async () => {
        if (applying) return;
        setApplying(true);
        try {
            await api.currencies.updateRate(ves.id, { exchange_rate: data.rate });
            await loadCurrencies();
            notify(`Tasa aplicada: ${sym} ${fmtRate(data.rate)}`);
            clearBcvManual();
        } catch (e) { notify(e.message, "err"); }
        finally { setApplying(false); }
    };

    return (
        <div role="status" className="shrink-0 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200/80 dark:border-amber-500/20">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <p className="flex-1 min-w-[220px] text-[13px] leading-snug text-amber-900 dark:text-amber-200">
                    {futura ? (
                        <>El BCV publicó la tasa del <span className="font-semibold">{fv.dia} {fv.corta}</span>: </>
                    ) : fv && data.value_date === hoy ? (
                        <>Tasa BCV de hoy: </>
                    ) : (
                        <>Tasa BCV vigente{fv ? ` desde el ${fv.corta}` : ""}: </>
                    )}
                    <span className="font-semibold tabular-nums">{sym} {fmtRate(data.rate)}</span>
                    <span className="text-amber-800/80 dark:text-amber-200/70">
                        {" · "}{futura ? "hoy cobras con" : "sigues cobrando con"} <span className="tabular-nums">{fmtRate(actual)}</span>
                    </span>
                </p>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={keep}
                        disabled={applying}
                        className="h-8 px-3 rounded-lg text-[12px] font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                    >
                        Seguir con {fmtRate(actual)}
                    </button>
                    <button
                        onClick={apply}
                        disabled={applying}
                        className="btn-accent h-8 px-3 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-60"
                    >
                        {applying && <Spinner />}
                        Aplicar {fmtRate(data.rate)}
                    </button>
                </div>
            </div>
        </div>
    );
}
