// src/App.jsx
import { AppProvider } from "./context/AppContext";
import { CartProvider } from "./context/CartContext";
import ErrorBoundary from "./components/ErrorBoundary";
import PosApp from "./components/PosApp";

export default function App() {
    return (
        <ErrorBoundary>
            <AppProvider>
                <CartProvider>
                    <PosApp />
                </CartProvider>
            </AppProvider>
        </ErrorBoundary>
    );
}
