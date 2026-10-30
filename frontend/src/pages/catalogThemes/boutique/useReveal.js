import { useEffect, useState } from "react";

// Avisa UNA vez cuando el elemento entra en pantalla, para que las animaciones de entrada
// (palabras del lema, tarjetas de categorías) corran cuando el cliente llega a verlas y no al
// cargar la página, con la sección todavía fuera de vista. Sin IntersectionObserver se da por
// visto de entrada: mejor sin animación que con la sección invisible.
//
// Devuelve una ref de FUNCIÓN, no un useRef: la sección puede montarse después que el
// componente (CategoryStrip no dibuja nada hasta que llegan las categorías). Con useRef el
// efecto corría una sola vez con la ref vacía, nunca observaba nada y las tarjetas se quedaban
// en opacidad 0: el título y las flechas, sin categorías debajo.
export default function useReveal({ margin = "0px 0px -12% 0px" } = {}) {
    const [nodo, setNodo] = useState(null);
    const [visto, setVisto] = useState(() => typeof IntersectionObserver === "undefined");

    useEffect(() => {
        if (visto || !nodo) return;
        const io = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) { setVisto(true); io.disconnect(); }
        }, { rootMargin: margin });
        io.observe(nodo);
        return () => io.disconnect();
    }, [visto, nodo, margin]);

    return [setNodo, visto];
}
