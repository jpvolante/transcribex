// src/Account.jsx
import React, { useEffect, useState } from "react";
import { auth, files } from "./api";

const Field = (p) => (
  <label className="text-xs w-full">
    <div className="mb-1 text-slate-800">{p.label}</div>
    <input
      {...p}
      className={
        "border border-slate-300 bg-white text-slate-900 placeholder-slate-400 " +
        "rounded-lg px-3 py-2 w-full text-xs focus:outline-none focus:ring-2 focus:ring-cyan-400 " +
        (p.className || "")
      }
    />
  </label>
);

// helper para detectar se o nome parece imagem
const isImgName = (n) => /\.(png|jpe?g|webp)$/i.test(n || "");

export default function Account({ onUseInOCR }) {
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [msg, setMsg] = useState("");
  const [list, setList] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    auth.me().then(setUser).catch(() => {});
    files.list().then(setList).catch(() => {});
  }, []);

  function onChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function doRegister(e) {
    e?.preventDefault();
    setMsg("");

    const email = form.email.trim();
    const password = form.password.trim();
    const name = form.name.trim();

    if (!email || !password) {
      setMsg("Preencha pelo menos email e senha.");
      return;
    }

    if (password.length < 8) {
      setMsg("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    try {
      const u = await auth.register({ email, password, name });
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

    const email = form.email.trim();
    const password = form.password.trim();

    if (!email || !password) {
      setMsg("Preencha email e senha para entrar.");
      return;
    }

    try {
      const u = await auth.login({ email, password });
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
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg("");
    setUploading(true);

    try {
      const saved = await files.upload(file);
      setList((prev) => [saved, ...prev]);
      setMsg("Arquivo enviado com sucesso ☑️");
    } catch (err) {
      setMsg(err?.response?.data?.error || "Falha ao enviar arquivo");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

async function onDelete(id) {
  if (!window.confirm("Excluir este arquivo?")) return;
  setMsg("");

  try {
    const res = await files.remove(id);

    if (!res || res.error) {
      throw new Error(res?.error || "Falha ao excluir");
    }

    // atualiza lista local
    setList((prev) => prev.filter((f) => f.id !== id));

    setMsg("Arquivo excluído com sucesso.");
  } catch (err) {
    console.error(err);
    setMsg(err?.message || "Erro ao excluir o arquivo.");
  }
}


  return (
    <div className="rounded-2xl p-4 bg-slate-100 border border-slate-300 shadow-xl flex flex-col gap-4">
      {/* Cabeçalho com mini ilustração temática */}
      <div className="flex justify-between gap-4">
        <div className="flex-1">
          <div className="font-semibold text-slate-900 text-sm">
            Conta e Arquivos
          </div>
          <div className="text-[11px] text-slate-600">
            Faça login para salvar imagens, testar o OCR em diferentes documentos
            e acessar seus arquivos depois.
          </div>
        </div>

        {/* “Imagem”/ilustração do tema do sistema */}
        <div className="hidden md:flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-slate-700 flex items-center justify-center text-white text-xs font-bold shadow-md">
            Tx
          </div>
          <div className="flex flex-col gap-1">
            <div className="w-16 h-2 rounded-full bg-slate-300" />
            <div className="w-10 h-2 rounded-full bg-slate-200" />
            <div className="w-14 h-2 rounded-full bg-cyan-300/80" />
          </div>
        </div>

        {user && (
          <button
            className="text-[11px] text-slate-600 hover:text-red-500 ml-2"
            type="button"
            onClick={doLogout}
          >
            Sair
          </button>
        )}
      </div>

      {/* Área de login/cadastro */}
      {!user && (
        <div className="rounded-xl bg-white border border-slate-200 p-3 mt-1">
          <form
            onSubmit={doLogin}
            className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
          >
            <Field
              label="Nome (opcional)"
              name="name"
              value={form.name}
              onChange={onChange}
              placeholder="Seu nome"
            />

            <Field
              label="E-mail"
              name="email"
              type="email"
              value={form.email}
              onChange={onChange}
              placeholder="voce@exemplo.com"
            />

            <Field
              label="Senha"
              name="password"
              type="password"
              value={form.password}
              onChange={onChange}
              placeholder="mínimo 8 caracteres"
            />

            <div className="flex gap-2 mt-2">
              <button
                type="submit"
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-slate-50 hover:bg-slate-800 transition"
              >
                Entrar
              </button>

              <button
                type="button"
                onClick={doRegister}
                className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-400 text-slate-800 hover:bg-slate-100 transition"
              >
                Criar conta
              </button>
            </div>
          </form>

          {msg && (
            <div className="mt-2 text-[11px] text-slate-700">
              {msg}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">
              i
            </span>
            Seus dados são usados apenas para este protótipo local de OCR.
          </div>
        </div>
      )}

      {/* Área de arquivos (quando logado) */}
      {user && (
        <div className="rounded-xl bg-white border border-slate-200 p-3 mt-1 flex flex-col gap-3">
          <div className="flex justify-between items-center gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Olá, {user.name || user.email}
              </div>
              <div className="text-[11px] text-slate-600">
                Envie imagens (JPG, PNG, WEBP) para usar depois no OCR.
              </div>
            </div>

            <label className="cursor-pointer text-[11px] px-3 py-2 rounded-lg bg-cyan-500 text-slate-900 font-semibold hover:bg-cyan-400 transition shadow-sm">
              {uploading ? "Enviando..." : "Enviar arquivo"}
              <input
                type="file"
                className="hidden"
                onChange={onUpload}
                disabled={uploading}
              />
            </label>
          </div>

          {msg && (
            <div className="text-[11px] text-slate-700">
              {msg}
            </div>
          )}

          <div className="mt-1 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-1 pr-2 font-medium">Nome</th>
                  <th className="py-1 pr-2 font-medium">Tipo</th>
                  <th className="py-1 pr-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((f) => (
                  <tr key={f.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-1 pr-2">
                      <div
                        className="max-w-xs truncate text-slate-900"
                        title={f.filename}
                      >
                        {f.filename}
                      </div>
                    </td>
                    <td className="py-1 pr-2 text-slate-500">
                      {f.mime}
                    </td>
                    <td className="py-1 pr-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="text-[11px] text-cyan-600 hover:underline"
                        onClick={() =>
                          onUseInOCR({
                            id: f.id,
                            filename: f.filename,
                            mime: f.mime,
                            isImage: isImgName(f.filename),
                          })
                        }
                      >
                        Usar no OCR
                      </button>
                      <button
                        type="button"
                        className="text-[11px] text-red-500 hover:underline"
                        onClick={() => onDelete(f.id)}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr>
                    <td className="py-2 text-slate-500" colSpan={3}>
                      Nenhum arquivo enviado ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mini “imagem” do sistema na parte de baixo */}
          <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
            <div className="flex gap-1">
              <div className="w-6 h-6 rounded-md bg-slate-200 flex items-center justify-center text-[10px] text-slate-700">
                JPG
              </div>
              <div className="w-6 h-6 rounded-md bg-slate-200 flex items-center justify-center text-[10px] text-slate-700">
                PNG
              </div>
              <div className="w-6 h-6 rounded-md bg-slate-200 flex items-center justify-center text-[10px] text-slate-700">
                WEBP
              </div>
            </div>
            <span>Formatos recomendados para melhor resultado no OCR.</span>
          </div>
        </div>
      )}
    </div>
  );
}
