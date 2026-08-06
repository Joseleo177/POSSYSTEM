// src/Layout/MainContent.jsx
import React from "react";
import { PAGE_COMPONENTS } from "../constants/pages";

export default function MainContent({ safeTab }) {
    const Page = PAGE_COMPONENTS[safeTab];

    // Un rol sin ningún módulo marcado no tiene a dónde entrar. Antes caía al Dashboard por
    // descarte; ahora ese tablero pide permiso de reportes, así que se le dice qué pasa en
    // vez de mostrarle una página que va a fallar sola.
    if (!Page) {
        return (
            <main className="flex-1 min-h-0 w-full h-full flex items-center justify-center p-8">
                <div className="text-center max-w-sm">
                    <div className="text-sm font-black uppercase tracking-widest text-content dark:text-content-dark mb-2">
                        Sin módulos asignados
                    </div>
                    <p className="text-xs text-content-muted dark:text-content-dark-muted">
                        Tu usuario no tiene permisos sobre ningún módulo. Pídele al administrador
                        que revise los permisos de tu rol.
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 min-h-0 w-full h-full overflow-hidden">
            <Page />
        </main>
    );
}
