// src/App.js
import React, { useRef, useState, useEffect } from "react";
import * as Tesseract from "tesseract.js";
import Account from "./Account";
import { files as filesApi } from "./api";

// -----------------------------------------------------------------------------
// TEMA / ESTILO: cinza futurista / tecnológico
// -----------------------------------------------------------------------------
const BRAND = {
  base: "#111827",      // cinza bem escuro
  baseDark: "#020617",  // quase preto
  accent: "#38bdf8",    // ciano (detalhes futuristas)
  tint: "#0f172a",      // fundo de cards escuros
};

// Componentes básicos
const Section = ({ title, children }) => (
  <section className="rounded-2xl bg-slate-900/40 border border-slate-700/60 p-4 shadow-sm flex flex-col gap-3 backdrop-blur-sm">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-slate-50">{title}</h2>
    </div>
    {children}
  </section>
);

const Button = ({ children, variant = "ghost", type = "button", onClick, disabled }) => {
  const base =
    "inline-flex items-center justify-center rounded-xl text-xs px-3 py-2 border transition disabled:opacity-60 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? {
          class: "text-white shadow-[0_0_0_1px_rgba(148,163,184,0.4)]",
          style: {
            background: `linear-gradient(135deg, ${BRAND.accent}, ${BRAND.base})`,
            borderColor: BRAND.accent,
          },
        }
      : variant === "outline"
      ? {
          class: "bg-transparent text-slate-100 hover:bg-slate-800/70",
          style: { borderColor: BRAND.accent },
        }
      : {
          class: "bg-slate-900/60 text-slate-100 hover:bg-slate-800/70 border-slate-700",
          style: {},
        };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${styles.class}`}
      style={styles.style}
    >
      {children}
    </button>
  );
};

const Tag = ({ children }) => (
  <span className="px-2 py-1 rounded-full text-[10px] border border-slate-600 bg-slate-900/80 text-slate-200">
    {children}
  </span>
);

// Util: checa se file é imagem
function isImage(file) {
  return file && /^image\//.test(file.type);
}

// -----------------------------------------------------------------------------
// Pré-processamento de imagem (crop + binarização + canal + inversão + skew)
// -----------------------------------------------------------------------------
async function preprocessImageToCanvas(file, opts) {
  const { crop, binarize, channel, invert, skew } = opts;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const w = img.naturalWidth;
        const h = img.naturalHeight;

        const leftPx = Math.round((crop.left / 100) * w);
        const rightPx = Math.round((crop.right / 100) * w);
        const topPx = Math.round((crop.top / 100) * h);
        const bottomPx = Math.round((crop.bottom / 100) * h);

        const cw = w - leftPx - rightPx;
        const ch = h - topPx - bottomPx;

        canvas.width = cw;
        canvas.height = ch;

        ctx.drawImage(img, leftPx, topPx, cw, ch, 0, 0, cw, ch);

        // Skew simples (rotação)
        if (skew && Math.abs(skew) > 0.1) {
          const rad = (skew * Math.PI) / 180;
          const rotated = document.createElement("canvas");
          const rctx = rotated.getContext("2d");
          rotated.width = cw;
          rotated.height = ch;
          rctx.translate(cw / 2, ch / 2);
          rctx.rotate(rad);
          rctx.drawImage(canvas, -cw / 2, -ch / 2);
          canvas.width = cw;
          canvas.height = ch;
          ctx.clearRect(0, 0, cw, ch);
          ctx.drawImage(rotated, 0, 0);
        }

        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let data = imageData.data;

        // Seleção de canal
        if (channel !== "auto") {
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            let v = 0;
            if (channel === "r") v = r;
            else if (channel === "g") v = g;
            else if (channel === "b") v = b;
            data[i] = data[i + 1] = data[i + 2] = v;
          }
        }

        // Binarização simples (Otsu) ou adaptativa (Sauvola aproximado)
        if (binarize !== "none") {
          const gray = new Uint8ClampedArray(data.length / 4);
          for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            gray[j] = data[i];
          }

          if (binarize === "otsu") {
            const hist = new Array(256).fill(0);
            for (let i = 0; i < gray.length; i++) hist[gray[i]]++;

            const total = gray.length;
            let sum = 0;
            for (let t = 0; t < 256; t++) sum += t * hist[t];

            let sumB = 0;
            let wB = 0;
            let maxVar = 0;
            let thresh = 127;

            for (let t = 0; t < 256; t++) {
              wB += hist[t];
              if (wB === 0) continue;
              const wF = total - wB;
              if (wF === 0) break;
              sumB += t * hist[t];
              const mB = sumB / wB;
              const mF = (sum - sumB) / wF;
              const varBetween = wB * wF * (mB - mF) * (mB - mF);
              if (varBetween > maxVar) {
                maxVar = varBetween;
                thresh = t;
              }
            }

            for (let i = 0, j = 0; i < data.length; i += 4, j++) {
              const v = gray[j] > thresh ? 255 : 0;
              data[i] = data[i + 1] = data[i + 2] = v;
            }
          } else if (binarize === "sauvola") {
            const wSize = 25;
            const k = 0.2;
            const out = new Uint8ClampedArray(gray.length);
            const width = canvas.width;
            const height = canvas.height;

            function idx(x, y) {
              return y * width + x;
            }

            for (let y = 0; y < height; y++) {
              for (let x = 0; x < width; x++) {
                let sumLocal = 0;
                let sumSq = 0;
                let count = 0;
                for (let dy = -wSize; dy <= wSize; dy++) {
                  for (let dx = -wSize; dx <= wSize; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    const val = gray[idx(nx, ny)];
                    sumLocal += val;
                    sumSq += val * val;
                    count++;
                  }
                }
                const mean = sumLocal / count;
                const varLocal = sumSq / count - mean * mean;
                const std = Math.sqrt(Math.max(0, varLocal));
                const R = 128;
                const thresh = mean * (1 + k * ((std / R) - 1));
                out[idx(x, y)] = gray[idx(x, y)] > thresh ? 255 : 0;
              }
            }

            for (let i = 0, j = 0; i < data.length; i += 4, j++) {
              const v = out[j];
              data[i] = data[i + 1] = data[i + 2] = v;
            }
          }

          imageData.data.set(data);
          ctx.putImageData(imageData, 0, 0);
        }

        // Inversão final
        if (invert) {
          imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];
            data[i + 1] = 255 - data[i + 1];
            data[i + 2] = 255 - data[i + 2];
          }
          ctx.putImageData(imageData, 0, 0);
        }

        URL.revokeObjectURL(url);
        resolve(canvas);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };

    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };

    img.src = url;
  });
}

// -----------------------------------------------------------------------------
// OCR em faixas horizontais (modo linha / manuscrito)
// -----------------------------------------------------------------------------
async function recognizeInStrips(file, opts, lang, setProgress) {
  const strips = 8;          // menos faixas
  const overlap = 0.08;      // mais sobreposição
  let out = "";
  let processed = 0;

  for (let i = 0; i < strips; i++) {
    const seg = { ...opts.crop };
    const hFrac = 1 / strips;

    seg.top = Math.round(100 * (i * hFrac));
    seg.bottom = Math.round(100 * (1 - (i + 1) * hFrac));

    if (i > 0) seg.top -= overlap * 100;
    if (i < strips - 1) seg.bottom -= overlap * 100;

    const canvas = await preprocessImageToCanvas(file, { ...opts, crop: seg });

    const { data } = await Tesseract.recognize(canvas, lang, {
      tessedit_pageseg_mode: 7, // linha única
      logger: (m) => {
        if (m.status === "recognizing text" && m.progress != null) {
          setProgress(
            Math.min(99, Math.round(((i + m.progress) / strips) * 100))
          );
        }
      },
    });

    out += (data.text || "").trim() + "\n";
    processed++;
    setProgress(Math.round((processed / strips) * 100));
  }

  return out;
}

// -----------------------------------------------------------------------------
// App principal
// -----------------------------------------------------------------------------
export default function App() {
  const [route, setRoute] = useState("home");
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState("");
  const [status, setStatus] = useState("idle"); // idle | ready | transcribing
  const [error, setError] = useState("");
  const [transcription, setTranscription] = useState("");
  const [progress, setProgress] = useState(0);

  // opções
  const [lang, setLang] = useState("por");
  const [enhance, setEnhance] = useState(true);       // melhorar imagem (impresso + manuscrito)
  const [docMode, setDocMode] = useState("typed");    // 'typed' | 'hand'

  // estados avançados (manuscrito)
  const [crop, setCrop] = useState({ top: 35, bottom: 5, left: 5, right: 5 });
  const [binarize, setBinarize] = useState("sauvola"); // 'sauvola' | 'otsu' | 'none'
  const [channel, setChannel] = useState("auto");      // 'auto' | 'r' | 'g' | 'b'
  const [invert, setInvert] = useState(false);
  const [skew, setSkew] = useState(0);
  const [psm, setPsm] = useState(7);                   // manuscrito: default 7 (linha)
  const [lineMode, setLineMode] = useState(true);      // OCR por faixas

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  const inputRef = useRef(null);

  function onSelectFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!isImage(f)) {
      setError("O OCR local funciona com imagens (PNG/JPG/JPEG/WEBP). Para PDF, exporte como imagem.");
      return;
    }
    setError("");
    setFile(f);
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    const url = URL.createObjectURL(f);
    setFileUrl(url);
    setStatus("ready");
    setTranscription("");
    setProgress(0);
  }

  function clearDoc() {
    setFile(null);
    setFileUrl("");
    setTranscription("");
    setStatus("idle");
    setError("");
    setProgress(0);
    setRoute("home");
  }

async function handleUseUploadedInOCR(row) {
  try {
    setError("");
    setStatus("ready");
    setTranscription("");
    setProgress(0);

    // 1) baixar o arquivo do servidor (usando o id)
    const url = filesApi.url(row.id);
    const res = await fetch(url, { credentials: "include" });

    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }

    const blob = await res.blob();

    // 2) garantir que é imagem
    if (!/^image\//.test(blob.type || "")) {
      setError(
        "Este arquivo não é imagem. Para o OCR local, use PNG, JPG, JPEG ou WEBP."
      );
      return;
    }

    // 3) criar um File a partir do blob (evita problemas no canvas)
    const fname = row.filename || row.originalName || "documento.png";
    const fileLike = new File([blob], fname, {
      type: blob.type || "image/png",
    });

    // 4) preparar preview e estado
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    const objUrl = URL.createObjectURL(fileLike);

    setFile(fileLike);
    setFileUrl(objUrl);
    setStatus("ready");
    // se você tiver algum controle de rota, aqui pode manter na tela principal de OCR
    // por ex: setRoute("home");
  } catch (e) {
    console.error(e);
    setError(
      "Falha ao carregar arquivo do servidor para o OCR. Verifique se você ainda está logado e tente novamente."
    );
  }
}


  function onPresetBasic() {
    setDocMode("typed");
    setEnhance(true);
  }

  function onPresetHand() {
    setDocMode("hand");
    setEnhance(true);
    setCrop({ top: 35, bottom: 5, left: 5, right: 5 });
    setBinarize("sauvola");
    setChannel("auto");
    setInvert(false);
    setSkew(0);
    setPsm(7);
    setLineMode(true);
  }

  // ---------------------------------------------------------------------------
  // Lógica de transcrição (melhorada)
  // ---------------------------------------------------------------------------
  async function handleTranscribe() {
    if (!file) {
      setError("Selecione um arquivo antes de transcrever.");
      return;
    }

    if (!isImage(file)) {
      setError(
        "O OCR funciona apenas com imagens (PNG/JPG/JPEG/WEBP). Para PDF, exporte a página como imagem."
      );
      return;
    }

    setError("");
    setStatus("transcribing");
    setProgress(0);

    try {
      // ---------------------- MANUSCRITO ----------------------
      if (docMode === "hand") {
        if (enhance) {
          if (lineMode) {
            const text = await recognizeInStrips(
              file,
              { crop, binarize, channel, invert, skew },
              lang,
              setProgress
            );
            setTranscription(text);
          } else {
            const canvas = await preprocessImageToCanvas(file, {
              crop,
              binarize,
              channel,
              invert,
              skew,
            });

            const { data } = await Tesseract.recognize(canvas, lang, {
              tessedit_pageseg_mode: psm,
              logger: (m) => {
                if (m.status === "recognizing text" && m.progress != null) {
                  setProgress(Math.round(m.progress * 100));
                }
              },
            });

            setTranscription(data.text || "");
          }
        } else {
          // manuscrito SEM pré-processamento pesado, mas usando PSM escolhido
          const { data } = await Tesseract.recognize(file, lang, {
            tessedit_pageseg_mode: psm,
            logger: (m) => {
              if (m.status === "recognizing text" && m.progress != null) {
                setProgress(Math.round(m.progress * 100));
              }
            },
          });

          setTranscription(data.text || "");
        }
      } else {
        // ---------------------- IMPRESSO ----------------------
        if (enhance) {
          // Pré-processamento simples para textos impressos: Otsu + crop 0
          const canvas = await preprocessImageToCanvas(file, {
            crop: { top: 0, bottom: 0, left: 0, right: 0 },
            binarize: "otsu",
            channel: "auto",
            invert: false,
            skew: 0,
          });

          const { data } = await Tesseract.recognize(canvas, lang, {
            tessedit_pageseg_mode: 6,
            logger: (m) => {
              if (m.status === "recognizing text" && m.progress != null) {
                setProgress(Math.round(m.progress * 100));
              }
            },
          });

          setTranscription(data.text || "");
        } else {
          const { data } = await Tesseract.recognize(file, lang, {
            tessedit_pageseg_mode: 6,
            logger: (m) => {
              if (m.status === "recognizing text" && m.progress != null) {
                setProgress(Math.round(m.progress * 100));
              }
            },
          });
          setTranscription(data.text || "");
        }
      }
    } catch (e) {
      console.error(e);
      setError(
        "Falha ao transcrever a imagem. Tente ajustar as opções ou testar outra imagem."
      );
    } finally {
      setStatus("ready");
    }
  }

  const isBusy = status === "transcribing";

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-cyan-500/20 border border-slate-700"
              style={{
                background: `radial-gradient(circle at 0 0, ${BRAND.accent}, ${BRAND.baseDark})`,
              }}
            >
              Tx
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide text-slate-50">
                Transcribex
              </div>
              <div className="text-[11px] text-slate-400">
                OCR local para documentos históricos – manuscritos e impressos.
              </div>
            </div>
          </div>
          <nav className="flex gap-2 text-xs">
            <button
              className={`px-2 py-1 rounded-lg ${
                route === "home"
                  ? "bg-slate-800 text-slate-50"
                  : "text-slate-400 hover:bg-slate-900"
              }`}
              onClick={() => setRoute("home")}
            >
              OCR
            </button>
            <button
              className={`px-2 py-1 rounded-lg ${
                route === "about"
                  ? "bg-slate-800 text-slate-50"
                  : "text-slate-400 hover:bg-slate-900"
              }`}
              onClick={() => setRoute("about")}
            >
              Sobre
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-4">
        {route === "home" && (
          <>
            <div className="grid md:grid-cols-[2fr_1.4fr] gap-4 items-start">
              <Section title="Seleção da imagem">
                <div className="flex flex-col gap-3 text-xs">
                  <div className="flex gap-2 items-center">
                    <input
                      ref={inputRef}
                      type="file"
                      accept="image/*"
                      onChange={onSelectFile}
                      className="text-xs text-slate-200 file:text-xs file:px-2 file:py-1 file:rounded-lg file:border-none file:bg-slate-700 file:text-slate-100"
                    />
                    {file && (
                      <Button variant="ghost" onClick={clearDoc}>
                        Limpar
                      </Button>
                    )}
                  </div>
                  {file && (
                    <div className="flex flex-col gap-2">
                      <div className="text-xs text-slate-300">
                        <span className="font-medium">Arquivo:</span> {file.name}{" "}
                        <span className="text-slate-500">
                          ({Math.round(file.size / 1024)} KB)
                        </span>
                      </div>
                      {fileUrl && (
                        <div className="border border-slate-700 rounded-xl overflow-hidden bg-slate-900 max-h-80">
                          <img
                            src={fileUrl}
                            alt="preview"
                            className="w-full h-full object-contain bg-slate-950"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {!file && (
                    <div className="text-xs text-slate-400">
                      Dica: use uma foto com boa luz, página inteira, sem cortes.
                    </div>
                  )}
                </div>
              </Section>

              <Account onUseInOCR={handleUseUploadedInOCR} />
            </div>

            <div className="grid md:grid-cols-[1.4fr_1.8fr] gap-4">
              <Section title="Configurações de OCR">
                <div className="flex flex-col gap-3 text-xs">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-[11px] text-slate-400">Idioma:</span>
                    <select
                      className="border border-slate-700 bg-slate-900 rounded-lg px-2 py-1 text-xs text-slate-100"
                      value={lang}
                      onChange={(e) => setLang(e.target.value)}
                    >
                      <option value="por">Português</option>
                      <option value="eng">Inglês</option>
                      <option value="spa">Espanhol</option>
                      <option value="fra">Francês</option>
                      <option value="lat">Latim</option>
                    </select>

                    <span className="ml-3 text-[11px] text-slate-400">
                      Tipo de documento:
                    </span>
                    <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
                      <button
                        type="button"
                        className={`px-2 py-1 text-[11px] ${
                          docMode === "typed"
                            ? "bg-slate-100 text-slate-900"
                            : "text-slate-300"
                        }`}
                        onClick={() => setDocMode("typed")}
                      >
                        Impresso
                      </button>
                      <button
                        type="button"
                        className={`px-2 py-1 text-[11px] ${
                          docMode === "hand"
                            ? "bg-slate-100 text-slate-900"
                            : "text-slate-300"
                        }`}
                        onClick={() => setDocMode("hand")}
                      >
                        Manuscrito
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-[11px] text-slate-400">Presets:</span>
                    <Button variant="ghost" onClick={onPresetBasic}>
                      Básico (impresso)
                    </Button>
                    <Button variant="ghost" onClick={onPresetHand}>
                      Manuscrito (linhas + Sauvola)
                    </Button>
                    <label className="flex items-center gap-2 ml-2 text-[11px] text-slate-300">
                      <input
                        type="checkbox"
                        checked={enhance}
                        onChange={(e) => setEnhance(e.target.checked)}
                      />
                      Melhorar imagem antes do OCR
                    </label>
                  </div>

                  {docMode === "hand" && (
                    <div className="mt-2 flex flex-col gap-2">
                      <div className="text-[11px] text-slate-400">
                        Para manuscritos, use recorte + binarização adaptativa e,
                        se necessário, modo linha.
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="font-medium text-[11px] mb-1 text-slate-200">
                            Recorte (%)
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-slate-400">
                                Topo
                              </span>
                              <input
                                type="number"
                                className="w-16 border border-slate-700 bg-slate-900 rounded px-1 py-0.5 text-[11px] text-slate-100"
                                value={crop.top}
                                onChange={(e) =>
                                  setCrop((c) => ({
                                    ...c,
                                    top: Number(e.target.value) || 0,
                                  }))
                                }
                              />
                            </label>
                            <label className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-slate-400">
                                Base
                              </span>
                              <input
                                type="number"
                                className="w-16 border border-slate-700 bg-slate-900 rounded px-1 py-0.5 text-[11px] text-slate-100"
                                value={crop.bottom}
                                onChange={(e) =>
                                  setCrop((c) => ({
                                    ...c,
                                    bottom: Number(e.target.value) || 0,
                                  }))
                                }
                              />
                            </label>
                            <label className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-slate-400">
                                Esquerda
                              </span>
                              <input
                                type="number"
                                className="w-16 border border-slate-700 bg-slate-900 rounded px-1 py-0.5 text-[11px] text-slate-100"
                                value={crop.left}
                                onChange={(e) =>
                                  setCrop((c) => ({
                                    ...c,
                                    left: Number(e.target.value) || 0,
                                  }))
                                }
                              />
                            </label>
                            <label className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-slate-400">
                                Direita
                              </span>
                              <input
                                type="number"
                                className="w-16 border border-slate-700 bg-slate-900 rounded px-1 py-0.5 text-[11px] text-slate-100"
                                value={crop.right}
                                onChange={(e) =>
                                  setCrop((c) => ({
                                    ...c,
                                    right: Number(e.target.value) || 0,
                                  }))
                                }
                              />
                            </label>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <div>
                            <div className="font-medium text-[11px] mb-1 text-slate-200">
                              Binarização
                            </div>
                            <select
                              className="border border-slate-700 bg-slate-900 rounded px-2 py-1 text-[11px] w-full text-slate-100"
                              value={binarize}
                              onChange={(e) => setBinarize(e.target.value)}
                            >
                              <option value="sauvola">
                                Sauvola (adaptativa)
                              </option>
                              <option value="otsu">Otsu</option>
                              <option value="none">Nenhuma</option>
                            </select>
                          </div>

                          <div>
                            <div className="font-medium text-[11px] mb-1 text-slate-200">
                              Canal
                            </div>
                            <select
                              className="border border-slate-700 bg-slate-900 rounded px-2 py-1 text-[11px] w-full text-slate-100"
                              value={channel}
                              onChange={(e) => setChannel(e.target.value)}
                            >
                              <option value="auto">Automático</option>
                              <option value="r">Vermelho</option>
                              <option value="g">Verde</option>
                              <option value="b">Azul</option>
                            </select>
                          </div>

                          <label className="flex items-center gap-2 mt-1 text-[11px] text-slate-300">
                            <input
                              type="checkbox"
                              checked={invert}
                              onChange={(e) => setInvert(e.target.checked)}
                            />
                            Inverter (texto claro em fundo escuro)
                          </label>

                          <label className="flex items-center justify-between gap-2 mt-1">
                            <span className="text-[11px] text-slate-400">
                              Inclinação (graus)
                            </span>
                            <input
                              type="number"
                              className="w-16 border border-slate-700 bg-slate-900 rounded px-1 py-0.5 text-[11px] text-slate-100"
                              value={skew}
                              onChange={(e) =>
                                setSkew(Number(e.target.value) || 0)
                              }
                            />
                          </label>

                          <label className="flex items-center justify-between gap-2 mt-1">
                            <span className="text-[11px] text-slate-400">
                              Modo PSM
                            </span>
                            <input
                              type="number"
                              className="w-16 border border-slate-700 bg-slate-900 rounded px-1 py-0.5 text-[11px] text-slate-100"
                              min={3}
                              max={13}
                              value={psm}
                              onChange={(e) =>
                                setPsm(Number(e.target.value) || 6)
                              }
                            />
                          </label>

                          <label className="flex items-center gap-2 mt-1 text-[11px] text-slate-300">
                            <input
                              type="checkbox"
                              checked={lineMode}
                              onChange={(e) => setLineMode(e.target.checked)}
                            />
                            OCR por faixas (linhas horizontais)
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-700 mt-2 flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <div className="text-[11px] text-slate-400">
                        Status:{" "}
                        <span className="font-medium text-slate-100">
                          {status === "idle"
                            ? "Aguardando arquivo"
                            : status === "ready"
                            ? "Pronto para transcrever"
                            : "Transcrevendo..."}
                        </span>
                      </div>
                      {status === "transcribing" && (
                        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-cyan-400 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <Button
                      variant="primary"
                      onClick={handleTranscribe}
                      disabled={!file || isBusy}
                    >
                      {isBusy ? "Transcrevendo..." : "Transcrever"}
                    </Button>
                  </div>

                  {error && (
                    <div className="mt-1 text-[11px] text-red-400">{error}</div>
                  )}
                </div>
              </Section>

              <Section title="Transcrição">
                <div className="flex flex-col h-full">
                  <div className="flex-1">
                    <textarea
                      className="w-full h-64 md:h-80 border border-slate-700 rounded-xl p-3 text-xs font-mono resize-none bg-slate-950 text-slate-100"
                      value={transcription}
                      onChange={(e) => setTranscription(e.target.value)}
                      placeholder="A transcrição aparecerá aqui..."
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <div>
                      <span className="font-medium text-slate-200">
                        Caracteres:
                      </span>{" "}
                      {transcription.length}
                    </div>
                    <div className="flex gap-2">
                      <Tag>Protótipo local</Tag>
                      <Tag>Foco em manuscritos</Tag>
                    </div>
                  </div>
                </div>
              </Section>
            </div>
          </>
        )}

        {route === "about" && (
          <div className="grid md:grid-cols-2 gap-4">
            <Section title="Sobre o Sistema">
              <p className="text-sm text-slate-300">
                O Transcribex é um protótipo de OCR local voltado para pesquisa
                histórica. Toda a análise é feita no navegador usando
                Tesseract.js, com ajustes finos para manuscritos e documentos
                impressos.
              </p>
            </Section>
            <Section title="Uso em pesquisa">
              <p className="text-sm text-slate-300">
                A ideia é permitir que você teste rapidamente diferentes
                configurações de recorte, binarização e segmentação de linhas,
                antes de migrar para soluções de HTR mais pesadas em servidor.
              </p>
            </Section>
          </div>
        )}
      </main>
    </div>
  );
}
