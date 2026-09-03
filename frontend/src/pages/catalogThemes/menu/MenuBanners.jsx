import { resolveImageUrl } from "../../../helpers";

// Franja de avisos sobre los mosaicos. A diferencia del carrusel de boutique, aquí son
// tarjetas apiladas y quietas —la referencia de este tema muestra un aviso fijo, no una
// promoción que se desliza sola—, y encajan mejor con la calma de un menú que se lee, no se
// hojea. Con más de un banner activo se apilan uno debajo del otro; no hay límite artificial
// porque el mismo tope de 8 que ya existe en el panel de Ajustes alcanza de sobra.
export default function MenuBanners({ banners }) {
    if (!banners?.length) return null;

    return (
        <div className="max-w-5xl mx-auto px-4 pt-6 space-y-3">
            {banners.map((b) => (
                <a
                    key={b.id}
                    href={b.link_url || undefined}
                    tabIndex={b.link_url ? 0 : -1}
                    className={`block rounded-2xl overflow-hidden border border-white/[0.08] ${b.link_url ? "hover:border-brand-500/40 transition-colors" : "cursor-default"}`}
                >
                    <picture>
                        <source media="(min-width: 768px)" srcSet={resolveImageUrl(b.image_url)} />
                        <img
                            src={resolveImageUrl(b.image_mobile_url || b.image_url)}
                            alt={b.alt_text || ""}
                            className="w-full h-auto block"
                            loading="lazy"
                        />
                    </picture>
                </a>
            ))}
        </div>
    );
}
