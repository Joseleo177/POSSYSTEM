// src/ErpApp.jsx
import { AppProvider } from "./context/AppContext";
import { CartProvider } from "./context/CartContext";
import PosApp from "./components/PosApp";

// El ERP completo (sesión, carrito del POS y todos los módulos) en un solo punto de entrada.
// App.jsx lo carga con lazy(): así el catálogo público y el QR de la mesa no descargan
// contabilidad, fábrica ni reportes para mostrar una vitrina.
export default function ErpApp() {
    return (
        <AppProvider>
            <CartProvider>
                <PosApp />
            </CartProvider>
        </AppProvider>
    );
}
