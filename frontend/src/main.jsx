import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { handleImgError } from "./helpers/image";

// El evento error de una <img> no burbujea, pero sí se captura: un solo listener cubre todas
// las fotos de la app, tengan o no su propio onError.
document.addEventListener("error", (e) => handleImgError(e.target), true);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
