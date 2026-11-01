import { useEffect, useState } from "react";

// TEMPORAL (31-10-2026): medidor para entender en el iPhone del usuario (Brave) por qué la
// página de la mesa se puede desplazar y la cabecera queda bajo la hora. Solo aparece con
// ?debug=1 en el enlace. Borrar cuando se resuelva.
export default function MedidorDebug() {
    const [v, setV] = useState({});
    useEffect(() => {
        const sonda = document.createElement("div");
        sonda.style.cssText = "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none";
        document.body.appendChild(sonda);
        const medir = () => {
            const se = document.scrollingElement || document.documentElement;
            const carta = document.querySelector(".fixed.inset-0.z-50");
            const mesa = [...document.querySelectorAll(".fixed.inset-0.overflow-y-auto")].find(el => !el.classList.contains("z-50"));
            // Qué elementos son más altos que la pantalla (los candidatos a "pisar").
            const altos = [...document.body.querySelectorAll("body > div *")]
                .filter(el => el.getBoundingClientRect().bottom > window.innerHeight + 2 && getComputedStyle(el).position !== "fixed")
                .slice(0, 3)
                .map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} b=${Math.round(el.getBoundingClientRect().bottom)}`);
            setV({
                innerH: window.innerHeight,
                vvH: Math.round(window.visualViewport?.height || 0),
                vvTop: Math.round(window.visualViewport?.offsetTop || 0),
                screenH: window.screen.height,
                docH: se.scrollHeight,
                scrollY: Math.round(window.scrollY),
                bodyH: document.body.scrollHeight,
                envTop: sonda.offsetHeight,
                carta: carta ? `${carta.scrollTop}/${carta.scrollHeight - carta.clientHeight}` : "cerrada",
                mesa: mesa ? `${mesa.scrollTop}/${mesa.scrollHeight - mesa.clientHeight}` : "-",
                altos,
            });
        };
        medir();
        const t = setInterval(medir, 500);
        window.addEventListener("scroll", medir, { passive: true });
        return () => { clearInterval(t); window.removeEventListener("scroll", medir); sonda.remove(); };
    }, []);
    return (
        <div className="fixed left-2 bottom-24 z-[200] max-w-[92vw] rounded-xl bg-black/85 text-white text-[11px] leading-snug p-2.5 font-medium pointer-events-none whitespace-pre-wrap break-all">
            {`pantalla ${v.screenH} · ventana ${v.innerH} · visible ${v.vvH} (arriba ${v.vvTop})
página ${v.docH} · body ${v.bodyH} · desplazada ${v.scrollY}
env-top ${v.envTop} · mesa ${v.mesa} · carta ${v.carta}
${(v.altos || []).join("\n")}`}
        </div>
    );
}
