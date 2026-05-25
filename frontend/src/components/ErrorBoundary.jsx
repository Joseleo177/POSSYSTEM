// src/components/ErrorBoundary.jsx
import { Component } from "react";

/**
 * Captura cualquier error de render de React y muestra una pantalla de
 * recuperación en lugar de dejar la aplicación en blanco.
 */
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        // Registro en consola para diagnóstico; integrable con un servicio externo.
        console.error("[ErrorBoundary]", error, info?.componentStack);
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-5 p-10 text-center bg-[#f8f9fc] dark:bg-[#080808] animate-in fade-in duration-500">
                <div className="w-24 h-24 rounded-[40px] bg-danger/10 flex items-center justify-center text-danger shadow-inner mb-2">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                    </svg>
                </div>
                <div className="font-black text-xl tracking-wide text-danger uppercase">
                    Ocurrió un error inesperado
                </div>
                <p className="text-sm text-content-subtle dark:text-white/50 max-w-sm leading-relaxed font-medium">
                    La aplicación encontró un problema y no pudo continuar. Tus datos están a salvo.
                    Puedes recargar para volver a intentarlo.
                </p>
                {this.state.error?.message && (
                    <code className="text-[10px] font-mono text-content-subtle/70 dark:text-white/30 max-w-md break-words">
                        {this.state.error.message}
                    </code>
                )}
                <button
                    onClick={this.handleReload}
                    className="mt-2 h-10 px-6 rounded-xl bg-brand-500 text-white text-[12px] font-black uppercase tracking-wide hover:bg-brand-600 active:scale-95 transition-all shadow-lg"
                >
                    Recargar aplicación
                </button>
            </div>
        );
    }
}
