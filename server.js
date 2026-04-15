const express = require("express");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const multer = require("multer");

const app = express();
const PORT = 3000;

const DATA_DIR = __dirname;
const PECAS_FILE = path.join(DATA_DIR, "dados.json");

const upload = multer({ dest: path.join(DATA_DIR, "uploads") });

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(__dirname));

function garantirArquivo() {
  if (!fs.existsSync(PECAS_FILE)) {
    fs.writeFileSync(PECAS_FILE, "[]", "utf8");
  }
}

function lerPecas() {
  garantirArquivo();
  try {
    const raw = fs.readFileSync(PECAS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function salvarPecas(dados) {
  fs.writeFileSync(PECAS_FILE, JSON.stringify(dados, null, 2), "utf8");
}

function normalizarPeca(p) {
  return {
    estoque: String(p.estoque || "").trim(),
    localizacao: String(p.localizacao || "").trim(),
    codigo: String(p.codigo || "").trim(),
    nome: String(p.nome || "").trim(),
    carro: String(p.carro || "").trim(),
    condicao: String(p.condicao || "").trim(),
    quantidade: Number(p.quantidade || 0),
    quantidadeVendida: Number(p.quantidadeVendida || 0),
    dataCadastro: String(p.dataCadastro || "").trim(),
    foto: String(p.foto || "")
  };
}

app.get("/pecas", (req, res) => {
  res.json(lerPecas());
});

app.post("/pecas", (req, res) => {
  try {
    const pecas = lerPecas();
    const nova = normalizarPeca(req.body);

    if (!nova.codigo || !nova.nome) {
      return res.status(400).json({ erro: "Código e nome são obrigatórios." });
    }

    const existe = pecas.some(p => String(p.codigo) === String(nova.codigo));
    if (existe) {
      return res.status(400).json({ erro: "Já existe uma peça com esse código." });
    }

    if (!nova.dataCadastro) {
      nova.dataCadastro = new Date().toISOString().slice(0, 10);
    }

    pecas.push(nova);
    salvarPecas(pecas);

    res.json({ mensagem: "Peça adicionada com sucesso." });
  } catch (e) {
    res.status(500).json({ erro: "Erro ao adicionar peça." });
  }
});

app.put("/pecas/:codigo", (req, res) => {
  try {
    const codigo = req.params.codigo;
    const pecas = lerPecas();
    const index = pecas.findIndex(p => String(p.codigo) === String(codigo));

    if (index === -1) {
      return res.status(404).json({ erro: "Peça não encontrada." });
    }

    const atualizada = normalizarPeca(req.body);

    if (!atualizada.codigo || !atualizada.nome) {
      return res.status(400).json({ erro: "Código e nome são obrigatórios." });
    }

    const codigoConflitante = pecas.findIndex((p, i) =>
      i !== index && String(p.codigo) === String(atualizada.codigo)
    );

    if (codigoConflitante !== -1) {
      return res.status(400).json({ erro: "Já existe outra peça com esse código." });
    }

    if (!atualizada.dataCadastro) {
      atualizada.dataCadastro = pecas[index].dataCadastro || new Date().toISOString().slice(0, 10);
    }

    pecas[index] = atualizada;
    salvarPecas(pecas);

    res.json({ mensagem: "Peça atualizada com sucesso." });
  } catch (e) {
    res.status(500).json({ erro: "Erro ao atualizar peça." });
  }
});

app.delete("/pecas/:codigo", (req, res) => {
  try {
    const codigo = req.params.codigo;
    const pecas = lerPecas();
    const filtradas = pecas.filter(p => String(p.codigo) !== String(codigo));

    if (filtradas.length === pecas.length) {
      return res.status(404).json({ erro: "Peça não encontrada." });
    }

    salvarPecas(filtradas);
    res.json({ mensagem: "Peça deletada com sucesso." });
  } catch (e) {
    res.status(500).json({ erro: "Erro ao deletar peça." });
  }
});

app.get("/exportar-excel", (req, res) => {
  try {
    const pecas = lerPecas();

    const linhas = pecas.map(p => ({
      Estoque: p.estoque || "",
      Localizacao: p.localizacao || "",
      Codigo: p.codigo || "",
      Nome: p.nome || "",
      Carro: p.carro || "",
      Condicao: p.condicao || "",
      Quantidade: Number(p.quantidade || 0),
      QuantidadeVendida: Number(p.quantidadeVendida || 0),
      DataCadastro: p.dataCadastro || ""
    }));

    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Estoque");

    const arquivo = path.join(DATA_DIR, "estoque_exportado.xlsx");
    XLSX.writeFile(wb, arquivo);

    res.download(arquivo, "estoque_exportado.xlsx");
  } catch (e) {
    res.status(500).json({ erro: "Erro ao exportar Excel." });
  }
});

app.get("/backup-json", (req, res) => {
  try {
    garantirArquivo();
    res.download(PECAS_FILE, "backup_estoque.json");
  } catch (e) {
    res.status(500).json({ erro: "Erro ao gerar backup." });
  }
});

app.post("/importar-excel", upload.single("arquivo"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ erro: "Nenhum arquivo enviado." });
    }

    const workbook = XLSX.readFile(req.file.path);
    const primeiraAba = workbook.SheetNames[0];
    const dadosExcel = XLSX.utils.sheet_to_json(workbook.Sheets[primeiraAba], { defval: "" });

    const pecasAtuais = lerPecas();
    const mapa = new Map(pecasAtuais.map(p => [String(p.codigo), p]));

    let importadas = 0;

    for (const linha of dadosExcel) {
      const peca = normalizarPeca({
        estoque: linha.Estoque || linha.estoque,
        localizacao: linha.Localizacao || linha.localizacao,
        codigo: linha.Codigo || linha.codigo,
        nome: linha.Nome || linha.nome,
        carro: linha.Carro || linha.carro,
        condicao: linha.Condicao || linha.condicao,
        quantidade: linha.Quantidade || linha.quantidade,
        quantidadeVendida: linha.QuantidadeVendida || linha.quantidadeVendida || linha["Qtd Vend."] || linha["QtdVend"],
        dataCadastro: linha.DataCadastro || linha.dataCadastro,
        foto: ""
      });

      if (!peca.codigo || !peca.nome) continue;

      const existente = mapa.get(String(peca.codigo));
      if (existente && existente.foto) {
        peca.foto = existente.foto;
      }

      if (!peca.dataCadastro) {
        peca.dataCadastro = existente?.dataCadastro || new Date().toISOString().slice(0, 10);
      }

      mapa.set(String(peca.codigo), peca);
      importadas++;
    }

    const resultado = Array.from(mapa.values());
    salvarPecas(resultado);

    fs.unlinkSync(req.file.path);

    res.json({ mensagem: `Importação concluída. ${importadas} registro(s) processado(s).` });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ erro: "Erro ao importar Excel." });
  }
});

garantirArquivo();

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});