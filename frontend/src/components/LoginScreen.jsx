import { useState } from "react";
import { api } from "../services/api";
import { useTheme } from "../hooks/useTheme";

export default function LoginScreen({ onLogin }) {
 const { dark, toggle } = useTheme();
 const [form, setForm] = useState({ username: "", password: "" });
 const [error, setError] = useState("");
 const [loading, setLoading] = useState(false);
 const [showPass, setShowPass] = useState(false);

 const handleSubmit = async () => {
 if (!form.username || !form.password) return;
 setError("");
 setLoading(true);
 try {
 const res = await api.auth.login(form);
 localStorage.setItem("pos_token", res.token);
 onLogin(res.employee);
 } catch (e) {
 setError(e.message);
 } finally {
 setLoading(false);
 }
 };

 const onKey = e => e.key === "Enter" && handleSubmit();

 return (
 <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-2 to-brand-50 dark:from-surface-dark dark:to-surface-dark-2 p-4 transition-colors duration-200">

 {/* Toggle dark/light — esquina superior derecha */}
 <button
 onClick={toggle}
 className="fixed top-4 right-4 p-2 rounded-lg btn-ghost text-content-muted dark:text-content-dark-muted"
 title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
 >
 {dark ? (
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
 d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
 </svg>
 ) : (
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
 d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
 </svg>
 )}
 </button>

 <div className="w-full max-w-sm">

 {/* Logo */}
 <div className="text-center mb-5">
 <div className="inline-flex items-center justify-center w-14 rounded-2xl bg-brand-500 shadow-card-md mb-4">
 <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
 d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
 </svg>
 </div>
 <h1 className="text-2xl font-bold text-content dark:text-content-dark tracking-tight">
 POS System
 </h1>
 <p className="text-sm text-content-muted dark:text-content-dark-muted mt-1">
 Ingresa tus credenciales para continuar
 </p>
 </div>

 {/* Card */}
 <div className="card-md p-5 sm:p-5">

 <div className="space-y-5">
 {/* Usuario */}
 <div>
 <label className="label">Usuario</label>
 <div className="relative">
 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-subtle dark:text-content-dark-muted">
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
 d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
 </svg>
 </div>
 <input
 className="input pl-9"
 placeholder="Ej: admin"
 value={form.username}
 onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
 onKeyDown={onKey}
 autoFocus
 autoComplete="username"
 />
 </div>
 </div>

 {/* Contraseña */}
 <div>
 <label className="label">Contraseña</label>
 <div className="relative">
 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-subtle dark:text-content-dark-muted">
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
 d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
 </svg>
 </div>
 <input
 className="input pl-9 pr-10"
 type={showPass ? "text" : "password"}
 placeholder="••••••••"
 value={form.password}
 onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
 onKeyDown={onKey}
 autoComplete="current-password"
 />
 <button
 type="button"
 onClick={() => setShowPass(s => !s)}
 className="absolute inset-y-0 right-0 pr-3 flex items-center text-content-subtle hover:text-content-muted dark:text-content-dark-muted dark:hover:text-content-dark transition-colors"
 >
 {showPass ? (
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
 d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
 </svg>
 ) : (
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
 d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
 d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
 </svg>
 )}
 </button>
 </div>
 </div>

 {/* Error */}
 {error && (
 <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-danger/10 border border-danger/30 text-danger text-sm">
 <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
 <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
 </svg>
 {error}
 </div>
 )}

 {/* Botón */}
 <button
 onClick={handleSubmit}
 disabled={loading || !form.username || !form.password}
 className="btn-md btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
 >
 {loading ? (
 <>
 <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
 </svg>
 Ingresando...
 </>
 ) : "Ingresar"}
 </button>
 </div>

 </div>

 <p className="mt-6 text-center text-xs text-content-subtle dark:text-content-dark-muted">
 Sistema de Punto de Venta · v3
 </p>
 </div>
 </div>
 );
}
