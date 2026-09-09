import { resolveImageUrl, imgRetryOnError } from "../../helpers";

// Logo de un método de pago o de un banco. Sin imagen cargada cae a un ícono genérico —no a
// un hueco— para que la botonera se vea pareja aunque falten logos.
export default function MethodBankLogo({ src, size = 40, rounded = "rounded-lg", className = "" }) {
    const url = resolveImageUrl(src);
    return (
        <div
            className={`${rounded} bg-white dark:bg-white/10 border border-border/20 dark:border-white/10 flex items-center justify-center overflow-hidden shrink-0 ${className}`}
            style={{ width: size, height: size }}
        >
            {url ? (
                <img src={url} alt="" onError={imgRetryOnError} className="w-full h-full object-contain p-1" />
            ) : (
                <svg className="w-1/2 h-1/2 text-content-subtle dark:text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2zm2 9h3" />
                </svg>
            )}
        </div>
    );
}
