// src/App.jsx
import { AppProvider } from "./context/AppContext";
import { CartProvider } from "./context/CartContext";
import PosApp from "./components/PosApp";

export default function App() {
    return (
        <AppProvider>
            <CartProvider>
                <PosApp />
            </CartProvider>
        </AppProvider>
    );
}
