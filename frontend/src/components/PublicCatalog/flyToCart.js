import { resolveImageUrl } from "../../helpers";

// "El plato vuela al carrito": al agregar, una miniatura redonda de la foto sale de donde el
// cliente tocó y cae en el carrito flotante (FloatingCart), que rebota al recibirla. Es la
// confirmación que se entiende sin leer: no hace falta un "Agregado" en texto para saber que
// entró, se ve entrar.
//
// Sin dependencias: Web Animations API sobre un nodo fijo que se crea y se borra. El arco sale
// de animar X e Y por separado —X lineal en el contenedor, Y con aceleración en el hijo—, que
// es más barato que calcular una curva y se ve igual de natural.
//
// El carrito avisa con un evento de ventana y no con props: el que agrega (la ficha del plato)
// y el que recibe (la burbuja) viven en ramas distintas del árbol y no tienen por qué
// conocerse. Si no hay burbuja montada, el evento simplemente no lo escucha nadie.

export const CART_TARGET_ATTR = "data-cart-target";
export const CART_BUMP_EVENT = "catalog:cart-bump";

const avisar = (detail) => window.dispatchEvent(new CustomEvent(CART_BUMP_EVENT, { detail }));

/**
 * @param {Element|DOMRect|null} from  De dónde sale (la foto de la ficha), o su rectángulo ya
 *                     medido si la ficha se cierra antes de que el carrito exista.
 * @param {object} info         { image_url, name, qty } — lo que muestra el aviso al llegar.
 */
export function flyToCart(from, info = {}) {
    const target = document.querySelector(`[${CART_TARGET_ATTR}]`);
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!from || !target || reducido || !Element.prototype.animate) {
        avisar(info);
        return;
    }

    const a = typeof from.getBoundingClientRect === "function" ? from.getBoundingClientRect() : from;
    const b = target.getBoundingClientRect();
    const size = 64;
    const x0 = a.left + a.width / 2 - size / 2;
    const y0 = a.top + a.height / 2 - size / 2;
    const dx = b.left + b.width / 2 - size / 2 - x0;
    const dy = b.top + b.height / 2 - size / 2 - y0;

    const box = document.createElement("div");
    box.setAttribute("aria-hidden", "true");
    Object.assign(box.style, {
        position: "fixed", left: `${x0}px`, top: `${y0}px`, width: `${size}px`, height: `${size}px`,
        zIndex: 80, pointerEvents: "none",
    });
    const ball = document.createElement("div");
    Object.assign(ball.style, {
        width: "100%", height: "100%", borderRadius: "9999px", overflow: "hidden",
        boxShadow: "0 10px 30px rgba(0,0,0,.35), 0 0 0 3px #fff",
        backgroundColor: "rgb(var(--c-brand-500))",
        backgroundSize: "cover", backgroundPosition: "center",
    });
    if (info.image_url) ball.style.backgroundImage = `url("${resolveImageUrl(info.image_url)}")`;
    box.appendChild(ball);
    document.body.appendChild(box);

    const ms = 720;
    // Primero sube un poco (el plato "salta" de la ficha) y luego cae en el carrito.
    const sube = Math.min(120, Math.abs(dy) * 0.35 + 40);
    box.animate(
        [{ transform: "translateX(0)" }, { transform: `translateX(${dx}px)` }],
        { duration: ms, easing: "cubic-bezier(.4, 0, .6, 1)", fill: "forwards" },
    );
    const vuelo = ball.animate(
        // La aceleración va por tramo: frena al subir y acelera al caer, como algo lanzado.
        [
            { transform: "translateY(0) scale(1.15)", opacity: 1, easing: "cubic-bezier(.2, .7, .4, 1)" },
            { transform: `translateY(${-sube}px) scale(1)`, opacity: 1, offset: 0.3, easing: "cubic-bezier(.55, 0, .85, .35)" },
            { transform: `translateY(${dy}px) scale(.3)`, opacity: 0.9 },
        ],
        { duration: ms, fill: "forwards" },
    );
    vuelo.onfinish = () => { box.remove(); avisar(info); };
    vuelo.oncancel = () => box.remove();
}
