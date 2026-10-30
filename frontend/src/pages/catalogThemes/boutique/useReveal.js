import { useEffect, useRef, useState } from "react";

// Avisa UNA vez cuando el elemento entra en pantalla, para que las animaciones de entrada
// (palabras del lema, tarjetas de categorías) corran cuando el cliente llega a verlas y no al
// cargar la página, con la sección todavía fuera de vista. Sin IntersectionObserver se da por
// visto de entrada: mejor sin animación que con la sección invisible.
export default function useReveal({ margin = "0px 0px -12% 0px" } = {}) {
    const ref = useRef(null);
    const [visto, setVisto] = useState(() => typeof IntersectionObserver === "undefined");

    useEffect(() => {
        const el = ref.current;
        if (visto || !el) return;
        const io = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) { setVisto(true); io.disconnect(); }
        }, { rootMargin: margin });
        io.observe(el);
        return () => io.disconnect();
    }, [visto, margin]);

    return [ref, visto];
}
