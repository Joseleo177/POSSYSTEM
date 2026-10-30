import { useEffect, useState } from "react";
import { publicApi } from "../../../services/api";
import { swr, peek, claveProductos } from "../../../services/publicCache";

// Los productos de un carril de la portada (ofertas, una categoría, "Nuestros productos").
//
// - Arranca con lo guardado de la visita anterior, si lo hay: el carril aparece lleno al
//   instante y se actualiza solo cuando llega lo fresco (ver publicCache).
// - `activo`: el carril no pide nada hasta que está por entrar en pantalla. Antes los cinco
//   carriles de la portada pedían a la vez al abrir la página, compitiendo con la tienda y el
//   banner por lo que sí se veía, aunque el último quedara a tres pantallas de distancia.
// - Al cambiar de parámetros (otra pestaña) NO vacía la lista: la anterior queda a la vista
//   hasta que llega la nueva (`loading` permite atenuarla), salvo que la nueva ya esté guardada.
export default function useCarril(token, params, activo = true) {
    const clave = claveProductos(token, params);
    const desde = (r) => (r ? { products: r.data?.products || [], total: r.data?.total || 0 } : null);
    // Lo guardado se muestra aunque el carril aún no esté activo: no cuesta nada y evita el
    // esqueleto; lo que espera a estar cerca es la petición.
    const [res, setRes] = useState(() => desde(peek(clave)));
    const [loading, setLoading] = useState(!res);

    useEffect(() => {
        if (!activo) return;
        let vivo = true;
        const { cached, fresh } = swr(clave, () => publicApi.getProducts(token, params));
        if (cached) { setRes(desde(cached)); setLoading(false); } else setLoading(true);
        fresh
            .then((r) => { if (vivo) setRes(desde(r)); })
            .catch(() => { if (vivo && !cached) setRes({ products: [], total: 0 }); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
        // La clave ya resume los parámetros; el objeto params es nuevo en cada render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clave, activo]);

    return { products: res ? res.products : null, total: res ? res.total : 0, loading };
}
