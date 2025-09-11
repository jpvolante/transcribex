import React, { useRef, useState, useEffect } from "react";
import * as Tesseract from "tesseract.js";

// -----------------------------------------------------------------------------
// TRANSCRIBEX – SPA + OCR (Tesseract.js) – manuscritos turbo (Sauvola/PSM/linhas)
// -----------------------------------------------------------------------------

// Paleta
const BRAND = {
  base: "#7B2E2E",
  baseDark: "#692626",
  tint: "#F3E5E5",
  ring: "shadow-[0_0_0_4px_rgba(123,46,46,0.12)]",
};

// UI primitives
const Card = ({ children, className = "" }) => (
  <div className={`bg-white/80 backdrop-blur border border-slate-200 shadow-sm rounded-2xl transition-all duration-200 hover:shadow-lg hover:border-slate-300 ${className}`}>{children}</div>
);

const Section = ({ title, actions, children }) => (
  <Card className="p-6">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-semibold tracking-tight" style={{ color: BRAND.base }}>{title}</h2>
      {actions}
    </div>
    <div className="prose max-w-none">{children}</div>
  </Card>
);

const Button = ({ children, onClick, type = "button", disabled, variant = "primary" }) => {
  const base = "px-4 py-2 rounded-xl text-sm font-medium shadow-sm transition border active:scale-[0.98] disabled:opacity-50";
  const styles =
    variant === "primary"
      ? { class: `text-white`, style: { background: BRAND.base, borderColor: BRAND.base } }
      : variant === "outline"
      ? { class: `bg-transparent`, style: { color: BRAND.base, borderColor: BRAND.base } }
      : { class: `bg-white text-slate-700 hover:bg-slate-50 border-slate-200` };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${base} ${styles.class}`} style={styles.style}>
      {children}
    </button>
  );
};

const Tag = ({ children }) => (
  <span className="px-2 py-1 rounded-full text-xs border" style={{ background: BRAND.tint, color: BRAND.base, borderColor: `${BRAND.base}33` }}>
    {children}
  </span>
);

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------
const ACCEPTED_TYPES = ["application/pdf"];
const isImage = (f) => f?.type?.startsWith("image/");

function bytesToSize(bytes) {
  if (bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function downloadTxt(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (filename || "transcricao") + ".txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Image loader (respeita EXIF quando possível)
async function loadImageFromFile(file) {
  if (window.createImageBitmap) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const c = document.createElement("canvas");
      c.width = bitmap.width; c.height = bitmap.height;
      const cx = c.getContext("2d");
      cx.drawImage(bitmap, 0, 0);
      const img = new Image();
      img.src = c.toDataURL();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      return img;
    } catch {}
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Otsu
function otsuThreshold(hist, total) {
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, wF = 0, varMax = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (wB === 0) continue;
    wF = total - wB; if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > varMax) { varMax = between; threshold = t; }
  }
  return threshold;
}

/**
 * Pré-processamento poderoso para manuscritos:
 *  - cortes em todos os lados (%, 0-100)
 *  - escolha de canal (r/g/b/auto)
 *  - binarização: 'sauvola' (adaptativa) | 'otsu' | 'none'
 *  - deskew leve (graus)
 *  - inverter
 */
async function preprocessImageToCanvas(file, { crop, binarize, channel, invert, skew }) {
  const img = await loadImageFromFile(file);

  const maxW = 2200;
  const scale = img.width > maxW ? maxW / img.width : 1;
  const W = Math.round(img.width * scale);
  const H = Math.round(img.height * scale);

  const src = document.createElement("canvas");
  src.width = W; src.height = H;
  const sctx = src.getContext("2d");
  sctx.drawImage(img, 0, 0, W, H);

  // cortes %
  const x0 = Math.round((crop.left / 100) * W);
  const y0 = Math.round((crop.top / 100) * H);
  const x1 = Math.round(W - (crop.right / 100) * W);
  const y1 = Math.round(H - (crop.bottom / 100) * H);
  const sw = Math.max(1, x1 - x0);
  const sh = Math.max(1, y1 - y0);

  const dst = document.createElement("canvas");
  dst.width = sw; dst.height = sh;
  const dctx = dst.getContext("2d");

  // deskew
  if (skew !== 0) {
    dctx.translate(sw / 2, sh / 2);
    dctx.rotate((skew * Math.PI) / 180);
    dctx.translate(-sw / 2, -sh / 2);
  }
  dctx.drawImage(src, x0, y0, sw, sh, 0, 0, sw, sh);

  if (binarize === "none") {
    if (invert) {
      const im = dctx.getImageData(0, 0, sw, sh), a = im.data;
      for (let i = 0; i < a.length; i += 4) { a[i] = 255 - a[i]; a[i + 1] = 255 - a[i + 1]; a[i + 2] = 255 - a[i + 2]; }
      dctx.putImageData(im, 0, 0);
    }
    return dst;
  }

  // cinza a partir do canal
  const im = dctx.getImageData(0, 0, sw, sh);
  const a = im.data;
  const gray = new Uint8ClampedArray(sw * sh);
  for (let i = 0, p = 0; i < a.length; i += 4, p++) {
    let g;
    if (channel === "r") g = a[i];
    else if (channel === "g") g = a[i + 1];
    else if (channel === "b") g = a[i + 2];
    else g = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
    gray[p] = g;
  }

  if (binarize === "otsu") {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const t = otsuThreshold(hist, gray.length);
    for (let p = 0, j = 0; p < a.length; p += 4, j++) {
      const v = gray[j] <= t ? 0 : 255;
      a[p] = a[p + 1] = a[p + 2] = invert ? 255 - v : v;
      a[p + 3] = 255;
    }
  } else {
    // Sauvola (janela 25, k=0.34)
    const win = 25, r = (win - 1) >> 1, k = 0.34, R = 128;
    const S = new Float32Array((sw + 1) * (sh + 1));
    const SQ = new Float32Array((sw + 1) * (sh + 1));
    const idx = (x, y) => y * (sw + 1) + x;
    for (let y = 1, i = 0; y <= sh; y++) {
      let row = 0, rowQ = 0;
      for (let x = 1; x <= sw; x++, i++) {
        row += gray[i];
        rowQ += gray[i] * gray[i];
        S[idx(x, y)] = S[idx(x, y - 1)] + row;
        SQ[idx(x, y)] = SQ[idx(x, y - 1)] + rowQ;
      }
    }
    const area = (x0, y0, x1, y1) => (x1 - x0) * (y1 - y0);
    const sum = (I, x0, y0, x1, y1) => I[idx(x1, y1)] - I[idx(x0, y1)] - I[idx(x1, y0)] + I[idx(x0, y0)];
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const xA = Math.max(0, x - r), yA = Math.max(0, y - r);
        const xB = Math.min(sw, x + r + 1), yB = Math.min(sh, y + r + 1);
        const A = area(xA, yA, xB, yB);
        const m = sum(S, xA, yA, xB, yB) / A;
        const sq = sum(SQ, xA, yA, xB, yB) / A;
        const v = Math.sqrt(Math.max(0, sq - m * m));
        const T = m * (1 + k * ((v / R) - 1));
        const g = gray[y * sw + x];
        const bin = g < T ? 0 : 255;
        const p = (y * sw + x) * 4;
        a[p] = a[p + 1] = a[p + 2] = invert ? 255 - bin : bin;
        a[p + 3] = 255;
      }
    }
  }
  dctx.putImageData(im, 0, 0);
  return dst;
}

// OCR em faixas horizontais (linhas largas) com PSM 7
async function recognizeInStrips(file, opts, lang, setProgress) {
  const strips = 12, overlap = 0.02; // 12 tiras, 2% sobreposição
  let out = "", processed = 0;

  for (let i = 0; i < strips; i++) {
    const seg = { ...opts.crop };
    const hFrac = 1 / strips;
    seg.top = Math.round(100 * (i * hFrac));
    seg.bottom = Math.round(100 * (1 - (i + 1) * hFrac));
    if (i > 0) seg.top -= overlap * 100;
    if (i < strips - 1) seg.bottom -= overlap * 100;

    const canvas = await preprocessImageToCanvas(file, { ...opts, crop: seg });
    const { data } = await Tesseract.recognize(canvas, lang, { tessedit_pageseg_mode: 7, logger: (m) => {
      if (m.status === "recognizing text" && m.progress != null) {
        // progresso aproximado entre as faixas
        setProgress(Math.min(99, Math.round(((i + m.progress) / strips) * 100)));
      }
    }});
    out += data.text.trim() + "\n";
    processed++;
    setProgress(Math.round((processed / strips) * 100));
  }
  return out;
}

// -----------------------------------------------------------------------------
// App
// -----------------------------------------------------------------------------
export default function App() {
  const [route, setRoute] = useState("home");
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState("");
  const [transcription, setTranscription] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [lang, setLang] = useState("por");
  const [enhance, setEnhance] = useState(true);
  const [cropTopPct, setCropTopPct] = useState(40); // (mantive para compatibilidade)
  const [docMode, setDocMode] = useState("typed"); // 'typed' | 'hand'

  // NOVOS estados avançados (manuscrito)
  const [crop, setCrop] = useState({ top: 35, bottom: 5, left: 5, right: 5 }); // %
  const [binarize, setBinarize] = useState("sauvola"); // 'sauvola' | 'otsu' | 'none'
  const [channel, setChannel] = useState("auto");      // 'auto' | 'r' | 'g' | 'b'
  const [invert, setInvert] = useState(false);
  const [skew, setSkew] = useState(0);                 // graus
  const [psm, setPsm] = useState(6);                   // 6 bloco, 7 linha…
  const [lineMode, setLineMode] = useState(false);     // OCR por faixas

  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);

  function handleSelectFile(e) {
    setError("");
    const f = e?.target?.files?.[0];
    if (!f) return;
    const isPdf = ACCEPTED_TYPES.includes(f.type);
    const isImg = isImage(f);
    if (!isPdf && !isImg) { setError("Formato não suportado. Envie PDF ou imagem (PNG/JPG/JPEG/WEBP)."); return; }
    const url = URL.createObjectURL(f);
    setFile(f); setFileUrl(url); setStatus("ready"); setTranscription(""); setRoute("doc");
  }

  function handleDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    const isPdf = ACCEPTED_TYPES.includes(f.type);
    const isImg = isImage(f);
    if (!isPdf && !isImg) { setError("Formato não suportado. Envie PDF ou imagem (PNG/JPG/JPEG/WEBP)."); return; }
    const url = URL.createObjectURL(f);
    setFile(f); setFileUrl(url); setStatus("ready"); setTranscription(""); setRoute("doc");
  }

  // OCR
  async function handleTranscribe() {
    if (!file) { setError("Selecione um arquivo antes de transcrever."); return; }
    if (!isImage(file)) { setError("O OCR funciona apenas com imagens (PNG/JPG/JPEG/WEBP). Para PDF, exporte a página como imagem."); return; }

    setError(""); setStatus("transcribing"); setProgress(0);

    try {
      if (docMode === "hand" && enhance) {
        // modo manuscrito
        if (lineMode) {
          const text = await recognizeInStrips(file, { crop, binarize, channel, invert, skew }, lang, setProgress);
          setTranscription(text);
        } else {
          const canvas = await preprocessImageToCanvas(file, { crop, binarize, channel, invert, skew });
          const { data } = await Tesseract.recognize(canvas, lang, {
            tessedit_pageseg_mode: psm,
            logger: (m) => { if (m.status === "recognizing text" && m.progress != null) setProgress(Math.round(m.progress * 100)); },
          });
          setTranscription(data.text || "");
        }
      } else {
        // datilografado simples
        const { data } = await Tesseract.recognize(file, lang, {
          tessedit_pageseg_mode: 6,
          logger: (m) => { if (m.status === "recognizing text" && m.progress != null) setProgress(Math.round(m.progress * 100)); },
        });
        setTranscription(data.text || "");
      }
    } catch (e) {
      console.error(e);
      setError("Falha ao transcrever a imagem. Tente ajustar as opções ou outra imagem.");
    } finally {
      setStatus("ready");
    }
  }

  function clearDoc() {
    setFile(null); setFileUrl(""); setTranscription(""); setStatus("idle"); setError(""); setProgress(0); setRoute("home");
  }

  const Nav = (
    <nav className="sticky top-0 z-10 border-b" style={{ borderColor: BRAND.base, background: "linear-gradient(90deg, rgba(123,46,46,0.96) 0%, rgba(105,38,38,0.96) 100%)" }}>
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl grid place-content-center font-bold" style={{ background: "white", color: BRAND.base }}>TX</div>
            <div className="text-white font-semibold tracking-tight">TRANSCRIBEX</div>
          </div>
          <div className="flex items-center gap-2">
            {[
              ["home", "Início"],
              ["doc", "Documento / Transcrição"],
              ["about", "Sobre o sistema"],
              ["docs", "Sobre documentos"],
            ].map(([r, label]) => (
              <button key={r} onClick={() => setRoute(r)}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${route === r ? "bg-white text-slate-900" : "text-white hover:bg-white/10"}`}
                style={route === r ? { color: BRAND.base } : undefined}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen text-slate-800" style={{ background: "radial-gradient(1200px 600px at 20% -10%, #f7ecec 0%, transparent 60%), radial-gradient(1200px 600px at 100% 0%, #f6f6f6 0%, transparent 40%), linear-gradient(#fafafa,#f7f7f7)" }}>
      {Nav}
      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        {route === "home" && <Home onSelectFile={handleSelectFile} onDrop={handleDrop} error={error} />}

        {route === "doc" && (
          <DocumentTranscribe
            file={file} fileUrl={fileUrl}
            status={status} progress={progress}
            transcription={transcription}
            onTranscribe={handleTranscribe}
            onClear={clearDoc}
            setTranscription={setTranscription}
            // básicos
            enhance={enhance} setEnhance={setEnhance}
            lang={lang} setLang={setLang}
            cropTopPct={cropTopPct} setCropTopPct={setCropTopPct}
            docMode={docMode} setDocMode={setDocMode}
            // avançados manuscrito
            crop={crop} setCrop={setCrop}
            binarize={binarize} setBinarize={setBinarize}
            channel={channel} setChannel={setChannel}
            invert={invert} setInvert={setInvert}
            skew={skew} setSkew={setSkew}
            psm={psm} setPsm={setPsm}
            lineMode={lineMode} setLineMode={setLineMode}
          />
        )}

        {route === "about" && <AboutSystem />}
        {route === "docs" && <AboutDocuments />}
      </main>
      <footer className="max-w-5xl mx-auto px-4 py-10 text-xs text-slate-500 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full border bg-white/70 backdrop-blur">
          <span>🖋️</span>
          <span>Protótipo – OCR local com Tesseract.js. Para manuscritos difíceis, use “Manuscrito” + Sauvola/linhas.</span>
        </div>
      </footer>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Screens
// -----------------------------------------------------------------------------
function Home({ onSelectFile, onDrop, error }) {
  const inputRef = useRef(null);
  return (
    <>
      <Section title="Bem-vindo ao TRANSCRIBEX">
        <p>Envie um documento para iniciar. Formatos: <strong>PDF</strong> e <strong>imagens</strong> (PNG/JPG/JPEG/WEBP).</p>
      </Section>

      <Card className="p-6">
        <div
          className={`border-2 border-dashed rounded-2xl p-10 grid place-content-center text-center bg-white/70 hover:bg-white transition cursor-pointer ${BRAND.ring}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={onDrop}
          style={{ borderColor: `${BRAND.base}33` }}
        >
          <div className="space-y-3">
            <div className="text-3xl">📄</div>
            <div className="text-lg font-medium">Clique ou arraste o arquivo aqui</div>
            <div className="text-sm text-slate-500">PDF ou imagem</div>
          </div>
          <input ref={inputRef} className="hidden" type="file" accept="application/pdf,image/*" onChange={onSelectFile}/>
        </div>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </Card>
    </>
  );
}

function DocumentTranscribe({
  file, fileUrl, transcription, status, progress,
  onTranscribe, onClear, setTranscription,
  enhance, setEnhance, lang, setLang, cropTopPct, setCropTopPct,
  docMode, setDocMode,
  // novos
  crop, setCrop, binarize, setBinarize, channel, setChannel,
  invert, setInvert, skew, setSkew, psm, setPsm, lineMode, setLineMode,
}) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className="p-0 overflow-hidden">
        <div className="p-4 flex items-center justify-between border-b border-slate-200">
          <div>
            <div className="text-sm text-slate-500">Documento</div>
            <div className="font-medium">{file ? file.name : "Nenhum arquivo"}</div>
          </div>
          {file && <Tag>{bytesToSize(file.size)}</Tag>}
        </div>
        <div className="aspect-[4/3] bg-slate-100 grid place-content-center">
          {!file && <span className="text-slate-500 text-sm">Carregue um arquivo para visualizar</span>}
          {file && file.type === "application/pdf" && (
            <object data={fileUrl} type="application/pdf" className="w-full h-full">
              <p className="p-4 text-sm">Pré-visualização de PDF indisponível. <a href={fileUrl} target="_blank" rel="noreferrer" className="underline">Abrir em nova aba</a>.</p>
            </object>
          )}
          {file && isImage(file) && (<img src={fileUrl} alt="Pré-visualização" className="w-full h-full object-contain" />)}
        </div>

        <div className="p-4 flex items-center gap-3 border-t border-slate-200 flex-wrap">
          <Button onClick={onTranscribe} disabled={!file || status === "transcribing"}>
            {status === "transcribing" ? "Transcrevendo…" : "Transcrever"}
          </Button>
          <Button variant="ghost" onClick={onClear}>Limpar</Button>

          {status === "transcribing" && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Progresso: {progress}%</span>
              <div className="w-40 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${BRAND.base}, ${BRAND.baseDark})` }} />
              </div>
            </div>
          )}

          <Button variant="outline" disabled={!transcription.trim()} onClick={() => downloadTxt((file?.name?.replace(/\.\w+$/, "") || "transcricao"), transcription)}>Baixar TXT</Button>
          <Button variant="outline" disabled={!transcription.trim()} onClick={async () => { try { await navigator.clipboard.writeText(transcription); alert("Transcrição copiada ✅"); } catch { alert("Não foi possível copiar."); } }}>Copiar</Button>

          {/* Básicos */}
          <div className="flex items-center gap-3 flex-wrap mt-2">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              Modo:
              <label className="flex items-center gap-1"><input type="radio" name="docmode" value="typed" checked={docMode === "typed"} onChange={() => setDocMode("typed")} className="accent-[rgb(123,46,46)]" />Datilografado</label>
              <label className="flex items-center gap-1"><input type="radio" name="docmode" value="hand" checked={docMode === "hand"} onChange={() => setDocMode("hand")} className="accent-[rgb(123,46,46)]" />Manuscrito</label>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">Idioma:
              <select className="border rounded-lg px-2 py-1 text-sm" value={lang} onChange={(e) => setLang(e.target.value)}>
                <option value="por">Português (por)</option>
                <option value="por+eng">Português + Inglês</option>
                <option value="eng">Inglês (eng)</option>
              </select>
            </label>
            {docMode === "hand" && (
              <>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="accent-[rgb(123,46,46)]" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} />Pré-processar</label>
                <label className="flex items-center gap-2 text-sm text-slate-700">PSM:
                  <select className="border rounded-lg px-2 py-1 text-sm" value={psm} onChange={(e)=>setPsm(parseInt(e.target.value))}>
                    <option value={6}>6 (bloco)</option>
                    <option value={7}>7 (linha)</option>
                    <option value={3}>3 (auto)</option>
                    <option value={4}>4 (colunas)</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={lineMode} onChange={(e)=>setLineMode(e.target.checked)} className="accent-[rgb(123,46,46)]" />
                  Ler em faixas
                </label>
              </>
            )}
          </div>

          {/* Avançados – só mostram em manuscrito */}
          {docMode === "hand" && (
            <div className="w-full grid md:grid-cols-2 gap-3 mt-2">
              <Card className="p-3">
                <div className="text-xs font-medium mb-2" style={{color: BRAND.base}}>Binarização & Canal</div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">Binarização:
                    <select className="border rounded-lg px-2 py-1 text-sm" value={binarize} onChange={(e)=>setBinarize(e.target.value)}>
                      <option value="sauvola">Sauvola (recom.)</option>
                      <option value="otsu">Otsu</option>
                      <option value="none">Nenhuma</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">Canal:
                    <select className="border rounded-lg px-2 py-1 text-sm" value={channel} onChange={(e)=>setChannel(e.target.value)}>
                      <option value="auto">Auto</option>
                      <option value="r">Vermelho</option>
                      <option value="g">Verde</option>
                      <option value="b">Azul</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={invert} onChange={(e)=>setInvert(e.target.checked)} className="accent-[rgb(123,46,46)]" />Inverter</label>
                </div>
              </Card>

              <Card className="p-3">
                <div className="text-xs font-medium mb-2" style={{color: BRAND.base}}>Cortes & Deskew</div>
                <div className="flex flex-col gap-2 text-sm">
                  <label className="flex items-center gap-2">Topo
                    <input type="range" min="0" max="60" value={crop.top} onChange={(e)=>setCrop({...crop, top: parseInt(e.target.value)})} className="flex-1 accent-[rgb(123,46,46)]"/>
                    <span className="w-10 text-right">{crop.top}%</span>
                  </label>
                  <label className="flex items-center gap-2">Base
                    <input type="range" min="0" max="40" value={crop.bottom} onChange={(e)=>setCrop({...crop, bottom: parseInt(e.target.value)})} className="flex-1 accent-[rgb(123,46,46)]"/>
                    <span className="w-10 text-right">{crop.bottom}%</span>
                  </label>
                  <label className="flex items-center gap-2">Esq
                    <input type="range" min="0" max="40" value={crop.left} onChange={(e)=>setCrop({...crop, left: parseInt(e.target.value)})} className="flex-1 accent-[rgb(123,46,46)]"/>
                    <span className="w-10 text-right">{crop.left}%</span>
                  </label>
                  <label className="flex items-center gap-2">Dir
                    <input type="range" min="0" max="40" value={crop.right} onChange={(e)=>setCrop({...crop, right: parseInt(e.target.value)})} className="flex-1 accent-[rgb(123,46,46)]"/>
                    <span className="w-10 text-right">{crop.right}%</span>
                  </label>
                  <label className="flex items-center gap-2">Deskew
                    <input type="range" min="-5" max="5" step="0.5" value={skew} onChange={(e)=>setSkew(parseFloat(e.target.value))} className="flex-1 accent-[rgb(123,46,46)]"/>
                    <span className="w-10 text-right">{skew}°</span>
                  </label>
                </div>
              </Card>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 flex items-center justify-between border-b-2" style={{ borderColor: `${BRAND.base}33` }}>
          <div>
            <div className="text-sm text-slate-500">Transcrição</div>
            <div className="font-medium">Resultado automático (editável)</div>
          </div>
          <div className="flex gap-2">
            <Tag>Beta</Tag>
            <Tag>Somente local</Tag>
          </div>
        </div>
        <div className="p-4">
          <textarea
            placeholder="A transcrição aparecerá aqui…"
            className="w-full h-80 md:h-[28rem] resize-none rounded-xl border border-slate-300 p-4 focus:ring-2 outline-none font-mono leading-6"
            style={{ boxShadow: "inset 0 1px 0 #fff", caretColor: BRAND.base }}
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
          />
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-3">
            <span>{transcription ? transcription.trim().split(/\s+/).filter(Boolean).length : 0} palavras</span>
            <span>•</span>
            <span>{transcription.length} caracteres</span>
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Dica: Manuscritos → use Sauvola, canal verde, ajuste cortes e teste “Ler em faixas”.
          </p>
        </div>
      </Card>

      <Section title="Comportamento & Regras de Negócio">
        <p>Para manuscritos, o sistema permite cortes, binarização adaptativa e leitura por faixas para melhorar a acurácia do OCR local.</p>
      </Section>
    </div>
  );
}

function AboutSystem() {
  return (
    <Section title="Sobre o Sistema">
      <p>Protótipo para transcrição de documentos históricos. OCR local via Tesseract.js; para casos difíceis, recomenda-se HTR (kraken/TrOCR) em backend.</p>
    </Section>
  );
}

function AboutDocuments() {
  return (
    <Section title="Sobre Documentos">
      <p>Digitalização e transcrição ampliam o acesso a fontes históricas e facilitam pesquisa e preservação do patrimônio.</p>
    </Section>
  );
}
