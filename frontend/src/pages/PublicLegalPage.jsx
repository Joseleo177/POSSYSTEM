import { useEffect, useState } from "react";
import { publicApi } from "../services/api";
import { swr } from "../services/publicCache";
import { resolveImageUrl, imgRetryOnError, toNameCase } from "../helpers";

// Privacidad y aviso legal de una tienda (/catalogo/<tienda>/legal). Una plantilla igual para
// todas, llenada con los datos de la tienda: ninguna tiene que redactar nada.
//
// Responsable de los datos es CADA TIENDA (los clientes son suyos); NXUS aparece como la
// plataforma que los guarda por cuenta de ella. Decisión del usuario, 31-10-2026.
//
// El texto describe lo que el sistema hace de verdad. Si la vitrina empieza a pedir otro dato
// o a usar otro servicio externo, hay que agregarlo aquí:
//   - identificación: cédula o RIF, nombre y teléfono (crea la ficha de cliente);
//   - pedidos web con entrega y pago (checkout.enabled): dirección, punto en el mapa,
//     referencia; y del pago reportado, banco, teléfono, referencia, monto y fecha;
//   - en el navegador (localStorage): carrito, sucursal, identidad y dirección;
//   - terceros: Vercel y Supabase (alojamiento), OpenStreetMap (mapa y búsqueda de
//     direcciones), Google Fonts y WhatsApp (solo al pulsar el botón).
//
// Base legal: el habeas data del artículo 28 de la Constitución. Venezuela no tiene una ley
// general de protección de datos; el usuario quedó en que lo revise un abogado.
const VIGENTE = "31 de octubre de 2026";

export default function PublicLegalPage({ token }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let vivo = true;
        // La misma clave que la vitrina: si el cliente viene de ella, la página sale al instante.
        const { cached, fresh } = swr(`s:${token}`, () => publicApi.getStore(token));
        if (cached) setData(cached.data);
        fresh.then((r) => vivo && setData(r.data)).catch(() => { if (vivo && !cached) setError(true); });
        return () => { vivo = false; };
    }, [token]);

    useEffect(() => {
        if (data?.store?.name) document.title = `Privacidad y aviso legal · ${toNameCase(data.store.name)}`;
    }, [data?.store?.name]);

    const volver = `/catalogo/${token}`;

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-2 px-6 text-center bg-surface-2 dark:bg-surface-dark">
                <p className="text-[15px] font-semibold text-content dark:text-white">Este catálogo no está disponible.</p>
                <p className="text-[13px] text-content-subtle">Verifica el enlace con la tienda.</p>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-surface-2 dark:bg-surface-dark">
                <span className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const { store, checkout } = data;
    const nombre = toNameCase(store.name || "la tienda");
    const conEntregaYPago = !!checkout?.enabled;
    const contacto = [
        store.whatsapp && { href: `https://wa.me/${store.whatsapp}`, texto: "WhatsApp", externo: true },
        store.phone && { href: `tel:${store.phone.split(" / ")[0]}`, texto: store.phone },
    ].filter(Boolean);

    return (
        <div className="min-h-screen bg-surface-2 dark:bg-surface-dark text-content dark:text-white">
            <header className="sticky top-0 z-10 bg-white/90 dark:bg-surface-dark/90 backdrop-blur border-b border-border/60 dark:border-white/[0.06]">
                <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
                    <a href={volver} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-content-muted hover:text-content dark:hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                        Volver a la tienda
                    </a>
                    {store.logo_url ? (
                        <img src={resolveImageUrl(store.logo_url)} onError={imgRetryOnError} alt={store.name} className="ml-auto h-8 w-auto max-w-[140px] object-contain" />
                    ) : (
                        <span className="ml-auto text-[14px] font-semibold truncate">{nombre}</span>
                    )}
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-4 py-8 sm:py-10">
                <h1 className="text-[24px] sm:text-[26px] font-bold tracking-tight">Privacidad y aviso legal</h1>
                <p className="mt-1 text-[13px] text-content-subtle">{nombre} · Vigente desde el {VIGENTE}</p>

                <nav className="mt-5 flex flex-wrap gap-2 text-[13px]">
                    <a href="#privacidad" className="h-9 px-3.5 inline-flex items-center rounded-full border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] hover:border-brand-500 transition-colors">Política de privacidad</a>
                    <a href="#aviso-legal" className="h-9 px-3.5 inline-flex items-center rounded-full border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] hover:border-brand-500 transition-colors">Aviso legal</a>
                </nav>

                <Seccion id="privacidad" titulo="Política de privacidad">
                    <Apartado titulo="Quién es responsable de tus datos">
                        <p>
                            <strong>{nombre}</strong>{store.rif && <>, RIF {store.rif}</>}{store.address && <>, con dirección en {store.address}</>}.
                            Es quien recibe tus pedidos y decide sobre tus datos.
                        </p>
                        <p>
                            La tienda usa NXUS ERP, una plataforma de gestión que guarda y procesa estos datos por
                            cuenta de la tienda. NXUS no los usa para fines propios.
                        </p>
                    </Apartado>

                    <Apartado titulo="Qué datos recogemos">
                        <ul>
                            <li><strong>Al identificarte:</strong> tu cédula o RIF, tu nombre y tu teléfono. Con ellos se crea o se actualiza tu ficha de cliente en la tienda.</li>
                            <li><strong>En tus pedidos:</strong> los productos, las cantidades, las notas que escribas y el historial de tus pedidos.</li>
                            {conEntregaYPago && (
                                <>
                                    <li><strong>Si eliges delivery:</strong> tu dirección, el punto que marques en el mapa y las referencias para llegar.</li>
                                    <li><strong>Si reportas un pago:</strong> el banco, el teléfono desde el que pagaste, el número de referencia, el monto y la fecha.</li>
                                </>
                            )}
                        </ul>
                        <p>No te pedimos datos de tarjetas ni claves bancarias.</p>
                    </Apartado>

                    <Apartado titulo="Para qué los usamos">
                        <ul>
                            <li>Preparar tu pedido{conEntregaYPago ? ", entregarlo y verificar tus pagos" : " y coordinar contigo el pago y la entrega"}.</li>
                            <li>Facturarte: la cédula o el RIF los exige la normativa fiscal.</li>
                            <li>Contactarte sobre tus pedidos.</li>
                        </ul>
                        <p>No vendemos tus datos ni los usamos para publicidad de terceros.</p>
                    </Apartado>

                    <Apartado titulo="Con quién se comparten">
                        <ul>
                            <li><strong>NXUS ERP</strong> y sus proveedores de alojamiento, Vercel y Supabase, con servidores en Estados Unidos.</li>
                            {conEntregaYPago && <li><strong>OpenStreetMap</strong>, cuando usas el mapa: recibe tu dirección IP y el lugar que buscas.</li>}
                            <li><strong>Google Fonts</strong>, que sirve las tipografías de la página y recibe tu dirección IP.</li>
                            <li><strong>WhatsApp</strong>, solo si decides escribirle a la tienda desde el botón.</li>
                            <li>Las autoridades, cuando la ley lo exija.</li>
                        </ul>
                    </Apartado>

                    <Apartado titulo="Lo que se guarda en tu dispositivo">
                        <p>
                            Para no pedirte los datos cada vez, la página guarda en tu navegador tu carrito, la sucursal que
                            elegiste, tu identificación{conEntregaYPago ? " y tu dirección de entrega" : ""}. No usamos cookies de
                            rastreo ni de publicidad.
                        </p>
                        <p>
                            Con <strong>Cerrar sesión</strong> se borran tu identificación, la sucursal y el carrito de ese
                            dispositivo. También puedes borrar los datos del sitio desde la configuración de tu navegador.
                        </p>
                    </Apartado>

                    <Apartado titulo="Cuánto tiempo los conservamos">
                        <p>
                            Tu ficha de cliente se conserva mientras tengas relación con la tienda. Las facturas y demás
                            documentos fiscales se guardan el tiempo que exige la ley, y esos no pueden borrarse.
                        </p>
                    </Apartado>

                    <Apartado titulo="Tus derechos">
                        <p>
                            Conforme al artículo 28 de la Constitución (habeas data), puedes pedirle a la tienda que te diga
                            qué datos tiene de ti, que los corrija o actualice, o que los elimine, salvo los que la ley la
                            obliga a conservar. Tu nombre y tu teléfono también los puedes cambiar tú mismo en tu perfil.
                        </p>
                        {contacto.length > 0 && (
                            <p>
                                Para cualquier solicitud, escríbele a la tienda:{" "}
                                {contacto.map((c, i) => (
                                    <span key={c.href}>
                                        {i > 0 && " o "}
                                        <a href={c.href} {...(c.externo ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="font-medium text-brand-600 dark:text-brand-400 underline underline-offset-2">{c.texto}</a>
                                    </span>
                                ))}.
                            </p>
                        )}
                    </Apartado>

                    <Apartado titulo="Cambios en esta política">
                        <p>Si esta política cambia, se publicará aquí con su nueva fecha de vigencia.</p>
                    </Apartado>
                </Seccion>

                <Seccion id="aviso-legal" titulo="Aviso legal">
                    <Apartado titulo="Titular">
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                            <Dato k="Nombre">{nombre}</Dato>
                            {store.rif && <Dato k="RIF">{store.rif}</Dato>}
                            {store.address && <Dato k="Dirección">{store.address}</Dato>}
                            {store.phone && <Dato k="Teléfono"><span className="tabular-nums">{store.phone}</span></Dato>}
                        </dl>
                    </Apartado>

                    <Apartado titulo="Pedidos">
                        <p>
                            Enviar un pedido no es una compra cerrada: la tienda lo revisa y lo confirma según su
                            disponibilidad. Las existencias y los precios pueden cambiar hasta esa confirmación.
                        </p>
                    </Apartado>

                    <Apartado titulo="Precios">
                        <p>
                            Los precios se muestran en la moneda de la tienda. Cuando ves el equivalente en otra moneda,
                            se calcula con la tasa de cambio vigente que aplica la tienda ese día.
                        </p>
                    </Apartado>

                    <Apartado titulo="Fotos e información">
                        <p>
                            Las imágenes son ilustrativas y pueden no coincidir exactamente con el producto. Las marcas
                            y fotos pertenecen a sus titulares.
                        </p>
                    </Apartado>

                    <Apartado titulo="Plataforma">
                        <p>
                            Este catálogo funciona sobre NXUS ERP. NXUS provee la plataforma, pero no es parte de la
                            compraventa: el trato es directamente con {nombre}.
                        </p>
                    </Apartado>
                </Seccion>

                <a href={volver} className="mt-10 h-12 sm:h-10 w-full sm:w-auto px-5 inline-flex items-center justify-center rounded-xl btn-accent text-[14px] font-semibold">
                    Volver a la tienda
                </a>
            </main>
        </div>
    );
}

function Seccion({ id, titulo, children }) {
    return (
        <section id={id} className="mt-8 scroll-mt-20 bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none px-5 sm:px-7 py-6">
            <h2 className="text-[20px] font-semibold tracking-tight">{titulo}</h2>
            <div className="mt-2 divide-y divide-border/60 dark:divide-white/[0.06]">{children}</div>
        </section>
    );
}

function Apartado({ titulo, children }) {
    return (
        <div className="py-4 text-[14px] leading-relaxed text-content-muted space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:font-semibold [&_strong]:text-content dark:[&_strong]:text-white">
            <h3 className="text-[14px] font-semibold text-content dark:text-white">{titulo}</h3>
            {children}
        </div>
    );
}

function Dato({ k, children }) {
    return (
        <>
            <dt className="text-[12px] text-content-subtle pt-0.5">{k}</dt>
            <dd className="text-content dark:text-white">{children}</dd>
        </>
    );
}
