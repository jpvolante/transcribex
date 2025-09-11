✨ Principais recursos

Upload de PDF ou imagem (PNG/JPG/JPEG/WEBP)

Dois modos: Datilografado (simples) e Manuscrito (turbinado)

Pré-processamento opcional (manuscrito):

Cortes em todos os lados (%)

Binarização Sauvola (adaptativa) ou Otsu

Escolha de canal (R/G/B/Auto) e inversão de cores

Deskew (correção de inclinação)

Leitura por faixas horizontais (ajuda quando há linhas longas)

Seleção de PSM (page segmentation mode) do Tesseract

Barra de progresso, cópia para clipboard e download .txt

Tudo roda localmente (sem backend)

🔧 Tecnologias

React 18 (CRA)

Tesseract.js

Tailwind CSS (estilo)

(Opcional futuro): Supabase (auth/armazenamento)

🚀 Começando
# 1) instalar deps
npm install

# 2) rodar em desenvolvimento
npm start

# 3) build de produção
npm run build


Se for clonar:
git clone https://github.com/jpvolante/transcribex.git && cd transcribex && npm i

🖼️ Fluxo de uso

Acesse a tela Documento / Transcrição.

Envie seu arquivo (PDF ou imagem).

Se o documento for manuscrito, habilite Manuscrito e ative o Pré-processamento.

Ajuste Sauvola, canal, cortes e deskew conforme a imagem.

(Opcional) Marque Ler em faixas para páginas largas.

Clique Transcrever. Edite o texto, Copiar ou Baixar TXT.

🧪 Dicas para melhores resultados

Prefira imagens em alta (≈300 dpi) e com bom contraste.

Em manuscritos, tente Sauvola + canal Verde, ajuste cortes para pegar apenas a área útil.

Se as linhas são muito compridas, ative Ler em faixas (strip OCR).

Para datilografados, o modo Datilografado (PSM 6) costuma ser suficiente.

🌐 Publicar online
GitHub Pages
npm i -D gh-pages
# adicione ao package.json:
# "homepage": "https://<seu-usuario>.github.io/transcribex",
# "scripts": { "predeploy": "npm run build", "deploy": "gh-pages -d build" }
npm run deploy

Vercel (recomendado)

Crie conta em vercel.com e Importe o repositório jpvolante/transcribex.

Build command: npm run build – Output: build/.

Deploy automático a cada push na branch main.

🗺️ Roadmap (ideias)

 OCR de PDF multipágina (conversão para imagens client-side)

 Post-correção com dicionário/tesauro

 Auth + biblioteca do usuário (Supabase)

 Exportar ALTO-XML / DOCX

 Revisão colaborativa

🤝 Contribuindo

Pull requests são bem-vindos!
Sugestões/bugs: abra uma Issue descrevendo passos para reproduzir.

📝 Licença

Distribuído sob a MIT License. Veja LICENSE (a criar) para detalhes.
