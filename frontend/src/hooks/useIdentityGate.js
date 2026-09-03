import { useState } from "react";
import { publicApi } from "../services/api";

// Lógica de la puerta de identificación, separada de cómo se dibuja.
//
// Nació dentro de components/PublicCatalog/IdentityGate.jsx como estado local del propio
// componente. Se saca a un hook porque el tema boutique necesita la MISMA secuencia de
// cuatro pasos —documento, confirmación, teléfono si falta, alta si es la primera vez— pero
// con otra cara: sin esto, la única forma de darle una presentación distinta habría sido
// copiar entero el flujo (fetch, validaciones, orden de pasos) y arriesgarse a que las dos
// copias se desincronicen el día que uno de los pasos cambie.
export function useIdentityGate(token, onIdentified) {
    const [step, setStep] = useState("doc"); // doc | confirm | phone | register
    const [prefix, setPrefix] = useState("V");
    const [number, setNumber] = useState("");
    const [match, setMatch] = useState(null); // ficha encontrada
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const fullDocument = `${prefix}-${number}`;
    const phoneOk = phone.replace(/\D/g, "").length >= 7;

    const lookup = async () => {
        if (number.length < 6 || busy) return;
        setBusy(true); setErr(null);
        try {
            const r = await publicApi.identify(token, fullDocument);
            if (r.data.found) {
                setMatch(r.data);
                if (r.data.phone) {
                    onIdentified({ document: fullDocument, name: r.data.name, phone: r.data.phone });
                } else {
                    setPhone("");
                    setStep("phone");
                }
            } else {
                setStep("register");
            }
        } catch (e) {
            setErr(e.message || "No se pudo verificar. Intenta de nuevo.");
        } finally {
            setBusy(false);
        }
    };

    const restart = () => { setStep("doc"); setMatch(null); setName(""); setPhone(""); setErr(null); };

    const confirmMatch = () => {
        if (!match?.phone) { setStep("phone"); return; }
        onIdentified({ document: fullDocument, name: match.name, phone: match.phone });
    };

    const submitPhone = () => {
        if (!phoneOk) return;
        onIdentified({ document: fullDocument, name: match.name, phone: phone.trim() });
    };

    const submitRegister = () => {
        if (name.trim().length < 2 || !phoneOk) return;
        onIdentified({ document: fullDocument, name: name.trim(), phone: phone.trim() });
    };

    return {
        step, prefix, setPrefix, number, setNumber, match, name, setName, phone, setPhone,
        busy, err, fullDocument, phoneOk,
        lookup, restart, confirmMatch, submitPhone, submitRegister,
    };
}
