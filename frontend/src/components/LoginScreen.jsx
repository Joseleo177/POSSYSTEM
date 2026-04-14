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
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-[#0a0a0a]">
      
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-500/20 blur-[120px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
      
      {/* Overlay Mesh */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <button
        onClick={toggle}
        className="fixed top-6 right-6 p-2.5 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all z-50"
      >
        {dark ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
        )}
      </button>

      <div className="w-full max-w-sm relative z-10 px-6">
        
        {/* Brand Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-[28px] bg-gradient-to-br from-brand-400 to-brand-600 shadow-[0_0_50px_rgba(20,184,166,0.3)] mb-6 rotate-3 hover:rotate-0 transition-transform duration-500">
            <svg className="w-10 h-10 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter mb-2">
            NEXUS <span className="text-brand-500">ERP</span>
          </h1>
          <p className="text-[11px] font-bold text-white/30 uppercase tracking-[0.2em]">
            Ecosistema de Gestión Inteligente
          </p>
        </div>

        {/* Glass Card */}
        <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 shadow-2xl overflow-hidden relative group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
          
          <div className="space-y-6">
            <div className="space-y-2">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Identidad de Acceso</label>
                <div className="relative group/input">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/20 group-focus-within/input:text-brand-500 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <input 
                        className="w-full h-14 bg-white/5 border border-white/5 rounded-2xl pl-12 pr-4 text-white placeholder-white/20 outline-none focus:border-brand-500/50 focus:bg-white/10 transition-all font-medium"
                        placeholder="Nombre de usuario"
                        value={form.username}
                        onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                        onKeyDown={onKey}
                        autoFocus
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest ml-1">Clave de Seguridad</label>
                <div className="relative group/input">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/20 group-focus-within/input:text-brand-500 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    </div>
                    <input 
                        className="w-full h-14 bg-white/5 border border-white/5 rounded-2xl pl-12 pr-12 text-white placeholder-white/20 outline-none focus:border-brand-500/50 focus:bg-white/10 transition-all font-medium"
                        type={showPass ? "text" : "password"}
                        placeholder="••••••••"
                        value={form.password}
                        onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                        onKeyDown={onKey}
                    />
                    <button 
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/20 hover:text-white transition-colors"
                    >
                        {showPass ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        )}
                    </button>
                </div>
            </div>

            {error && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-danger/10 border border-danger/20 text-danger text-[11px] font-bold uppercase tracking-wider animate-shake">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || !form.username || !form.password}
              className="group relative w-full h-14 bg-brand-500 hover:bg-brand-400 disabled:bg-white/5 rounded-2xl text-black font-black uppercase tracking-widest text-xs transition-all shadow-[0_0_30px_rgba(20,184,166,0.2)] active:scale-95 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  <span>Sincronizando...</span>
                </div>
              ) : "Autorizar Entrada"}
            </button>
          </div>
        </div>

        <div className="mt-8 text-center space-y-1">
          <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">
            Versión Enterprise 3.1.5
          </p>
          <p className="text-[9px] font-medium text-white/10 uppercase tracking-widest">
            © 2026 Nexus Global Technologies
          </p>
        </div>
      </div>
    </div>
  );
}
