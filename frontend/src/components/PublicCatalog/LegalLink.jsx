import { getPublicCatalogRoute, legalHref } from "../../publicRoutes";

// Enlace a la privacidad y el aviso legal de la tienda que se está viendo. Saca la tienda de
// la dirección, así no hay que pasarla por props a cada hoja de la vitrina.
//
// `nueva`: dentro de un paso del pedido (identificarse, enviar) se abre en otra pestaña, para
// no sacar al cliente de lo que estaba haciendo. En el pie va en la misma.
export default function LegalLink({ children = "Privacidad y aviso legal", nueva = false, className = "" }) {
    const slug = getPublicCatalogRoute()?.slug;
    if (!slug) return null;
    return (
        <a
            href={legalHref(slug)}
            {...(nueva ? { target: "_blank", rel: "noopener" } : {})}
            className={`underline underline-offset-2 decoration-current/30 hover:decoration-current transition-colors ${className}`}
        >
            {children}
        </a>
    );
}
