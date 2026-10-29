// Logo oficial de NXUS ERP (antes Nexus): letras de trazo fino y una N de un solo trazo cuyo
// diagonal se quiebra como un rayo.
//
// X, U y S usan `currentColor`: oscuro en modo claro y blanco en oscuro, según el color de texto
// donde se ponga. La N va en el rosa de la marca, fijo: no cambia con el tema ni con el color que
// cada empresa elige para su sistema. No se combina con cian.
//
// Las puntas de la N (los ingletes del trazo) sobresalen por arriba a la izquierda y por abajo a
// la derecha de las demás letras. Es a propósito: ese desequilibrio es lo que se eligió del
// boceto. No "corregirlo" igualando alturas.

export const NXUS_ROSA = "#FB7185";

// La N: sube por la izquierda, baja en diagonal con el quiebre del rayo y sube por la derecha.
const N = "M262 822V696L316 768L328 750L382 822V696";
const X = "M420 696L540 822M540 696L420 822";
const U = "M576 696V795Q576 822 603 822H669Q696 822 696 795V696";
const S = "M842 696H759Q732 696 732 723V732Q732 759 759 759H815Q842 759 842 786V795Q842 822 815 822H732";

// Logo completo: NXUS.
export function NxusLogo({ className = "h-8 w-auto", title = "NXUS ERP" }) {
    return (
        <svg viewBox="248 682 606 154" className={className} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
            <title>{title}</title>
            <path d={N} fill="none" stroke={NXUS_ROSA} strokeWidth="14" strokeLinejoin="miter" />
            <path d={X} fill="none" stroke="currentColor" strokeWidth="14" />
            <path d={U} fill="none" stroke="currentColor" strokeWidth="14" />
            <path d={S} fill="none" stroke="currentColor" strokeWidth="14" />
        </svg>
    );
}

// Solo la N: para espacios cuadrados y chicos (ícono de app, avatar, favicon). El trazo es más
// grueso que en el logo completo para que el rayo se siga leyendo en tamaño pequeño.
export function NxusMark({ className = "w-8 h-8", title = "NXUS ERP" }) {
    return (
        <svg viewBox="222 659 200 200" className={className} role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
            <title>{title}</title>
            <path d={N} fill="none" stroke={NXUS_ROSA} strokeWidth="22" strokeLinejoin="miter" />
        </svg>
    );
}
