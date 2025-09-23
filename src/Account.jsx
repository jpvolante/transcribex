// src/Account.jsx
import React, { useEffect, useState } from "react";
import { auth, files } from "./api";

const Field = (p) => (
  <label className="text-sm w-full">
    <div className="mb-1 text-slate-600">{p.label}</div>
    <input {...p} className={"border rounded-lg px-3 py-2 w-full " + (p.className || "")} />
  </label>
);

// helper: checa se o nome do arquivo parece imagem suportada pelo OCR local
const isImgName = (n) => /\.(png|jpe?g|webp)$/i.test(n || "");

export default function Account({ onUseInOCR }) {
  const [user, setUser] = useState(null);
  const [list, setList] = useState([]);
  const [tab, setTab] = useState("login"); // 'login' | 'register'
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const u = await auth.me();
        setUser(u);
        if (u) setList(await files.list());
      } catch {
        // silencia erro de sessão ausente
      }
    })();
  }, []);

  async function doRegister(e) {
    e?.preventDefault();
    setMsg("");
    try {
      const u = await auth.register({ ...form });
      setUser(u);
      setList(await files.list());
      setMsg("Conta criada e sessão iniciada ✅");
    } catch (err) {
      setMsg(err?.response?.data?.error || "Erro ao registrar");
    }
  }

  async function doLogin(e) {
    e?.preventDefault();
    setMsg("");
    try {
      const u = await auth.login({ email: form.email, password: form.password });
      setUser(u);
      setList(await files.list());
      setMsg("Login ok ✅");
    } catch (err) {
      setMsg(err?.response?.data?.error || "Erro ao entrar");
    }
  }

  async function doLogout() {
    setMsg("");
    await auth.logout();
    setUser(null);
    setList([]);
  }

  async function onUpload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setMsg("Enviando arquivo…");
    try {
      await files.upload(f);
      setList(await files.list());
      setMsg("Arquivo enviado ✅");
    } catch {
      setMsg("Falha no upload");
    } finally {
      e.target.value = "";
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Coluna esquerda: Sessão / Login / Registro */}
      <div className="bg-white/80 backdrop-blur border border-slate-200 shadow-sm rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Conta</h2>
          {user ? (
            <span className="text-sm px-2 py-1 rounded-full bg-green-50 border border-green-200 text-green-700">logado</span>
          ) : (
            <span className="text-sm px-2 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-600">offline</span>
          )}
        </div>

        {!user && (
          <>
            <div className="mb-3 flex gap-2">
              <button
                className={`px-3 py-1.5 rounded-lg border ${
                  tab === "login" ? "bg-slate-900 text-white border-slate-900" : "bg-white"
                }`}
                onClick={() => setTab("login")}
              >
                Entrar
              </button>
              <button
                className={`px-3 py-1.5 rounded-lg border ${
                  tab === "register" ? "bg-slate-900 text-white border-slate-900" : "bg-white"
                }`}
                onClick={() => setTab("register")}
              >
                Criar conta
              </button>
            </div>

            <form onSubmit={tab === "login" ? doLogin : doRegister} className="space-y-3">
              {tab === "register" && (
                <Field
                  label="Nome"
                  placeholder="Seu nome"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              )}
              <Field
                label="Email"
                type="email"
                placeholder="voce@exemplo.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <Field
                label="Senha"
                type="password"
                placeholder="•••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button className="px-4 py-2 rounded-lg bg-black text-white border border-black">
                {tab === "login" ? "Entrar" : "Registrar"}
              </button>
            </form>
          </>
        )}

        {user && (
          <div className="space-y-2">
            <div className="text-sm text-slate-600">Logado como</div>
            <div className="font-medium">{user.name || "Usuário"}</div>
            <div className="text-sm text-slate-600">{user.email}</div>
            <button onClick={doLogout} className="mt-3 px-4 py-2 rounded-lg border">
              Sair
            </button>
          </div>
        )}

        {msg && <p className="mt-4 text-sm text-slate-700">{msg}</p>}
      </div>

      {/* Coluna direita: Upload + lista */}
      <div className="bg-white/80 backdrop-blur border border-slate-200 shadow-sm rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Arquivos</h2>
          {user ? (
            <span className="text-sm text-slate-500">seus uploads</span>
          ) : (
            <span className="text-sm text-slate-500">entre para enviar</span>
          )}
        </div>

        {!user ? (
          <p className="text-sm text-slate-600">Faça login para enviar e listar arquivos.</p>
        ) : (
          <>
            <input type="file" onChange={onUpload} className="block mb-4" />
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-2">Nome</th>
                    <th className="py-2 pr-2">Tamanho</th>
                    <th className="py-2 pr-2">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-2">{row.originalName}</td>
                      <td className="py-2 pr-2">{(row.size / 1024).toFixed(1)} KB</td>
                      <td className="py-2 pr-2 space-x-3">
                        <a
                          href={files.url(row.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          abrir
                        </a>
                        <button
                          className="px-2 py-1 border rounded disabled:opacity-50"
                          disabled={!isImgName(row.originalName)}
                          onClick={() => onUseInOCR?.(row)}
                          title={
                            isImgName(row.originalName)
                              ? "Carregar este arquivo na tela de OCR"
                              : "Somente imagens (PNG/JPG/WEBP) podem ir direto para o OCR"
                          }
                        >
                          Usar no OCR
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!list.length && (
                    <tr>
                      <td className="py-2 text-slate-500" colSpan={3}>
                        Nenhum arquivo enviado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
