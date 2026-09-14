import { useState } from "react";
import { LogIn, UserPlus, XCircle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "./lib/supabaseClient";

export default function Auth() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleAuth() {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice("Cadastro criado! Verifique seu e-mail para confirmar antes de entrar.");
          setMode("login");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bc-auth-root">
      <style>{`
        .bc-auth-root {
          --paper: #F6F2E9; --paper-card: #FBF9F3; --ink: #23281F; --ink-soft: #6B6A5C;
          --rule: #D9D2BE; --rule-strong: #C3BA9F; --income: #2F6F4F; --income-soft: #E3EEE6;
          --expense: #A6432C; --expense-soft: #F3E3DC;
          font-family: 'Inter', sans-serif; color: var(--ink); background: var(--paper);
          padding: 28px; border-radius: 14px; max-width: 420px; margin: 60px auto;
        }
        .bc-auth-root * { box-sizing: border-box; }
        .bc-auth-title { font-family: Georgia, serif; font-weight: 700; font-size: 26px; margin: 0 0 4px; }
        .bc-auth-subtitle { font-size: 12.5px; color: var(--ink-soft); margin-bottom: 20px; }
        .bc-auth-card { background: var(--paper-card); border: 1px solid var(--rule); border-radius: 12px; padding: 20px; }
        .bc-auth-field { margin-bottom: 12px; }
        .bc-auth-field label { display: block; font-size: 11px; color: var(--ink-soft); margin-bottom: 4px; text-transform: uppercase; letter-spacing: .03em; }
        .bc-auth-field input {
          width: 100%; padding: 9px 11px; border-radius: 7px; border: 1px solid var(--rule-strong);
          background: var(--paper); font-size: 13.5px; color: var(--ink);
        }
        .bc-auth-btn {
          width: 100%; background: var(--ink); color: var(--paper); border: none; border-radius: 8px;
          padding: 11px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: flex;
          align-items: center; justify-content: center; gap: 8px; margin-top: 6px;
        }
        .bc-auth-btn:disabled { opacity: 0.6; cursor: default; }
        .bc-auth-switch { text-align: center; margin-top: 14px; font-size: 12.5px; color: var(--ink-soft); }
        .bc-auth-switch button { background: none; border: none; color: var(--ink); text-decoration: underline; cursor: pointer; font-size: 12.5px; padding: 0; }
        .bc-auth-error {
          background: var(--expense-soft); color: var(--expense); border: 1px solid var(--expense);
          border-radius: 8px; padding: 10px 12px; font-size: 12.5px; margin-bottom: 14px; display: flex; gap: 8px; align-items: flex-start;
        }
        .bc-auth-notice {
          background: var(--income-soft); color: var(--income); border: 1px solid var(--income);
          border-radius: 8px; padding: 10px 12px; font-size: 12.5px; margin-bottom: 14px; display: flex; gap: 8px; align-items: flex-start;
        }
        .bc-auth-dev-banner {
          background: var(--paper-card); border: 1px solid var(--rule-strong); color: var(--ink-soft);
          border-radius: 8px; padding: 9px 12px; font-size: 12px; margin-bottom: 16px; text-align: center;
        }
        .bc-auth-spin { animation: bc-auth-spin-kf 0.8s linear infinite; }
        @keyframes bc-auth-spin-kf { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <p className="bc-auth-title">Balancete</p>
      <p className="bc-auth-subtitle">Seu livro-caixa pessoal.</p>
      <div className="bc-auth-dev-banner">🚧 Este site ainda está em desenvolvimento.</div>
      <div className="bc-auth-card">
        {error && <div className="bc-auth-error"><XCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />{error}</div>}
        {notice && <div className="bc-auth-notice"><CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />{notice}</div>}
        <div className="bc-auth-field">
          <label>E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
        </div>
        <div className="bc-auth-field">
          <label>Senha</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 6 caracteres"
            onKeyDown={(e) => { if (e.key === "Enter" && email && password) handleAuth(); }} />
        </div>
        <button className="bc-auth-btn" disabled={loading || !email || !password} onClick={handleAuth}>
          {loading ? <Loader2 size={15} className="bc-auth-spin" /> : mode === "login" ? <LogIn size={15} /> : <UserPlus size={15} />}
          {mode === "login" ? "Entrar" : "Criar conta"}
        </button>
        <div className="bc-auth-switch">
          {mode === "login" ? (
            <>Ainda não tem conta? <button onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>Criar conta</button></>
          ) : (
            <>Já tem conta? <button onClick={() => { setMode("login"); setError(""); setNotice(""); }}>Entrar</button></>
          )}
        </div>
      </div>
    </div>
  );
}
