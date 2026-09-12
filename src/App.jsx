import { useState, useEffect } from "react";
import { LogIn, UserPlus, LogOut, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function supaAuth(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || data.error || "Erro na autenticação.");
  return data;
}

async function supaRest(path, accessToken, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && (data.message || data.hint)) || "Erro ao acessar o banco de dados.");
  return data;
}

export default function App() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [accounts, setAccounts] = useState(null);
  const [newAccountName, setNewAccountName] = useState("");
  const [testError, setTestError] = useState("");

  useEffect(() => {
    if (session) loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function handleAuth() {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (mode === "signup") {
        const data = await supaAuth("/signup", { email, password });
        if (data.access_token) {
          setSession(data);
        } else {
          setNotice("Cadastro criado! Verifique seu e-mail para confirmar antes de entrar (ou desative a confirmação por e-mail nas configurações do Supabase para testar mais rápido).");
          setMode("login");
        }
      } else {
        const data = await supaAuth("/token?grant_type=password", { email, password });
        setSession(data);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSignOut() {
    setSession(null);
    setAccounts(null);
    setEmail("");
    setPassword("");
  }

  async function loadAccounts() {
    setTestError("");
    try {
      const data = await supaRest("/accounts?select=*&order=created_at.desc", session.access_token);
      setAccounts(data);
    } catch (e) {
      setTestError(e.message);
    }
  }

  async function addTestAccount() {
    if (!newAccountName.trim()) return;
    setTestError("");
    try {
      await supaRest("/accounts", session.access_token, {
        method: "POST",
        body: JSON.stringify({
          user_id: session.user.id,
          name: newAccountName.trim(),
          kind: "corrente",
          currency: "BRL",
        }),
      });
      setNewAccountName("");
      loadAccounts();
    } catch (e) {
      setTestError(e.message);
    }
  }

  async function deleteTestAccount(id) {
    setTestError("");
    try {
      await supaRest(`/accounts?id=eq.${id}`, session.access_token, { method: "DELETE" });
      loadAccounts();
    } catch (e) {
      setTestError(e.message);
    }
  }

  return (
    <div className="bc-root">
      <style>{`
        .bc-root {
          --paper: #F6F2E9; --paper-card: #FBF9F3; --ink: #23281F; --ink-soft: #6B6A5C;
          --rule: #D9D2BE; --rule-strong: #C3BA9F; --income: #2F6F4F; --income-soft: #E3EEE6;
          --expense: #A6432C; --expense-soft: #F3E3DC;
          font-family: 'Inter', sans-serif; color: var(--ink); background: var(--paper);
          padding: 28px; border-radius: 14px; max-width: 480px; margin: 0 auto;
        }
        .bc-root * { box-sizing: border-box; }
        .bc-title { font-family: Georgia, serif; font-weight: 700; font-size: 24px; margin: 0 0 4px; }
        .bc-subtitle { font-size: 12.5px; color: var(--ink-soft); margin-bottom: 20px; }
        .bc-card { background: var(--paper-card); border: 1px solid var(--rule); border-radius: 12px; padding: 20px; }
        .bc-field { margin-bottom: 12px; }
        .bc-field label { display: block; font-size: 11px; color: var(--ink-soft); margin-bottom: 4px; text-transform: uppercase; letter-spacing: .03em; }
        .bc-field input {
          width: 100%; padding: 9px 11px; border-radius: 7px; border: 1px solid var(--rule-strong);
          background: var(--paper); font-size: 13.5px; color: var(--ink);
        }
        .bc-btn-primary {
          width: 100%; background: var(--ink); color: var(--paper); border: none; border-radius: 8px;
          padding: 11px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: flex;
          align-items: center; justify-content: center; gap: 8px; margin-top: 6px;
        }
        .bc-btn-primary:disabled { opacity: 0.6; cursor: default; }
        .bc-switch { text-align: center; margin-top: 14px; font-size: 12.5px; color: var(--ink-soft); }
        .bc-switch button { background: none; border: none; color: var(--ink); text-decoration: underline; cursor: pointer; font-size: 12.5px; padding: 0; }
        .bc-error {
          background: var(--expense-soft); color: var(--expense); border: 1px solid var(--expense);
          border-radius: 8px; padding: 10px 12px; font-size: 12.5px; margin-bottom: 14px; display: flex; gap: 8px; align-items: flex-start;
        }
        .bc-notice {
          background: var(--income-soft); color: var(--income); border: 1px solid var(--income);
          border-radius: 8px; padding: 10px 12px; font-size: 12.5px; margin-bottom: 14px; display: flex; gap: 8px; align-items: flex-start;
        }
        .bc-session-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .bc-session-email { font-size: 13px; }
        .bc-signout { display: flex; align-items: center; gap: 6px; background: none; border: 1px solid var(--rule-strong); border-radius: 7px; padding: 7px 12px; font-size: 12px; cursor: pointer; color: var(--ink-soft); }
        .bc-test-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
        .bc-test-desc { font-size: 12px; color: var(--ink-soft); margin-bottom: 12px; line-height: 1.5; }
        .bc-add-row { display: flex; gap: 8px; margin-bottom: 14px; }
        .bc-add-row input { flex: 1; padding: 8px 10px; border-radius: 7px; border: 1px solid var(--rule-strong); background: var(--paper); font-size: 13px; }
        .bc-add-row button { background: var(--income); color: white; border: none; border-radius: 7px; padding: 0 14px; cursor: pointer; font-size: 13px; }
        .bc-acc-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border: 1px solid var(--rule); border-radius: 7px; margin-bottom: 6px; font-size: 13px; }
        .bc-acc-row button { background: none; border: none; color: var(--rule-strong); cursor: pointer; font-size: 12px; }
        .bc-acc-row button:hover { color: var(--expense); }
        .bc-empty { font-size: 12.5px; color: var(--ink-soft); padding: 10px 0; }
        .bc-spin { animation: bc-spin-kf 0.8s linear infinite; }
        @keyframes bc-spin-kf { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <p className="bc-title">Balancete</p>
      <p className="bc-subtitle">Teste de conexão real com o Supabase</p>

      {!session ? (
        <div className="bc-card">
          {error && <div className="bc-error"><XCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />{error}</div>}
          {notice && <div className="bc-notice"><CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />{notice}</div>}
          <div className="bc-field">
            <label>E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
          </div>
          <div className="bc-field">
            <label>Senha</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 6 caracteres" />
          </div>
          <button className="bc-btn-primary" disabled={loading || !email || !password} onClick={handleAuth}>
            {loading ? <Loader2 size={15} className="bc-spin" /> : mode === "login" ? <LogIn size={15} /> : <UserPlus size={15} />}
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>
          <div className="bc-switch">
            {mode === "login" ? (
              <>Ainda não tem conta? <button onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>Criar conta</button></>
            ) : (
              <>Já tem conta? <button onClick={() => { setMode("login"); setError(""); setNotice(""); }}>Entrar</button></>
            )}
          </div>
        </div>
      ) : (
        <div className="bc-card">
          <div className="bc-session-head">
            <span className="bc-session-email">✅ Logado como <strong>{session.user.email}</strong></span>
            <button className="bc-signout" onClick={handleSignOut}><LogOut size={13} /> Sair</button>
          </div>

          <p className="bc-test-title">Teste de leitura e escrita</p>
          <p className="bc-test-desc">
            Isso grava e lê direto da tabela <code>accounts</code> do seu Supabase, só pra confirmar que tudo está
            conectado antes de migrarmos o app inteiro.
          </p>

          {testError && <div className="bc-error"><XCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />{testError}</div>}

          <div className="bc-add-row">
            <input
              type="text" placeholder="nome de uma conta de teste (ex: Nubank)"
              value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addTestAccount(); }}
            />
            <button onClick={addTestAccount}>Adicionar</button>
          </div>

          {accounts === null ? (
            <p className="bc-empty">Carregando...</p>
          ) : accounts.length === 0 ? (
            <p className="bc-empty">Nenhuma conta ainda — adicione uma acima para testar.</p>
          ) : (
            accounts.map((a) => (
              <div className="bc-acc-row" key={a.id}>
                <span>{a.name}</span>
                <button onClick={() => deleteTestAccount(a.id)}>excluir</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
