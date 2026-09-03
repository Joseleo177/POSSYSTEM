// Redes de la tienda, en la forma que consumen StorefrontHeader (la franja siempre visible)
// y StoreFooter (el pie). Un solo lugar para los trazos del ícono: repetirlos en los dos
// componentes es el tipo de duplicado que se desincroniza el día que uno de los dos cambie.
export function getSocialLinks(store) {
    return [
        store?.socials?.instagram && {
            href: store.socials.instagram, label: "Instagram",
            d: "M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37zM17.5 6.5h.01M7 3h10a4 4 0 014 4v10a4 4 0 01-4 4H7a4 4 0 01-4-4V7a4 4 0 014-4z",
        },
        store?.socials?.facebook && {
            href: store.socials.facebook, label: "Facebook",
            d: "M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z",
        },
    ].filter(Boolean);
}
