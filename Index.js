const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ===== Conexão com MySQL (Render/externo) =====
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  ssl: { rejectUnauthorized: true } // necessário p/ MySQL em nuvem
});

db.connect(err => {
  if (err) {
    console.error("❌ Erro ao conectar no MySQL:", err);
    return;
  }
  console.log("✅ Conectado ao MySQL!");
});

// =============================
// Funções utilitárias
// =============================
function formatarDataBRparaISO(data) {
  if (!data) return null;
  if (data.includes("/")) {
    const [dia, mes, ano] = data.split("/");
    return `${ano}-${mes}-${dia}`;
  }
  if (data.length === 8) {
    const dia = data.substring(0, 2);
    const mes = data.substring(2, 4);
    const ano = data.substring(4, 8);
    return `${ano}-${mes}-${dia}`;
  }
  return data;
}

function formatarDataBR(dataISO) {
  if (!dataISO) return null;
  const d = new Date(dataISO);
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const ano = d.getUTCFullYear();
  return `${dia}/${mes}/${ano}`;
}

// =============================
// ROTA RAIZ
// =============================
app.get("/", (req, res) => {
  res.send("🚀 API rodando com sucesso no Render!");
});

// =============================
// ROTA LOGIN
// =============================
app.post("/login", (req, res) => {
  const { login, senha } = req.body;

  if (!login || !senha) {
    return res.status(400).json({ erro: "Login e senha são obrigatórios" });
  }

  const sql = `
    SELECT id, nome, login, sus, cbo, cnes, ine
    FROM profissionais
    WHERE login=? AND senha=?
    LIMIT 1
  `;

  db.query(sql, [login, senha], (err, rows) => {
    if (err) {
      console.error("Erro SQL:", err);
      return res.status(500).json({ erro: "Erro ao consultar profissional" });
    }
    if (rows.length === 0) {
      return res.status(401).json({ erro: "Credenciais inválidas" });
    }
    res.json(rows[0]);
  });
});

// =============================
// ROTAS PROFISSIONAIS
// =============================
app.post("/profissionais", (req, res) => {
  const p = req.body;
  const sql = `
    INSERT INTO profissionais (nome, login, sus, cbo, cnes, ine, senha)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  db.query(sql, [p.nome, p.login, p.sus, p.cbo, p.cnes, p.ine, p.senha], (err, result) => {
    if (err) {
      console.error("Erro SQL:", err);
      return res.status(500).json({ erro: "Erro ao salvar profissional", detalhe: err });
    }
    res.json({ id: result.insertId, ...p });
  });
});

app.get("/profissionais", (req, res) => {
  db.query("SELECT * FROM profissionais", (err, rows) => {
    if (err) return res.status(500).json({ erro: err });
    res.json(rows);
  });
});

app.delete("/profissionais/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM profissionais WHERE id=?", [id], (err) => {
    if (err) return res.status(500).json({ erro: err });
    res.json({ message: "Profissional excluído com sucesso" });
  });
});

// =============================
// ROTAS RESPOSTAS
// =============================
app.post("/respostas", (req, res) => {
  const r = req.body;
  const sql = `
    INSERT INTO respostas 
    (cns, nome, data_nasc, sexo, local, leite_peito, alimentos, refeicao_tv, refeicoes, consumos,
     prof_nome, prof_login, prof_sus, prof_cbo, prof_cnes, prof_ine)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  db.query(sql, [
    r.cns, r.nome, formatarDataBRparaISO(r.dataNasc), r.sexo, r.local,
    r.leitePeito, r.alimentos, r.refeicaoTV, r.refeicoes, r.consumos,
    r.profNome, r.profLogin, r.profSus, r.profCbo, r.profCnes, r.profIne
  ], (err, result) => {
    if (err) {
      console.error("Erro SQL:", err);
      return res.status(500).json({ erro: "Erro ao salvar resposta", detalhe: err });
    }
    res.json({ id: result.insertId, ...r });
  });
});

app.post("/respostas/lote", (req, res) => {
  const respostas = req.body;
  if (!Array.isArray(respostas)) {
    return res.status(400).json({ erro: "Esperado um array de respostas" });
  }

  const sql = `
    INSERT INTO respostas 
    (cns, nome, data_nasc, sexo, local, leite_peito, alimentos, refeicao_tv, refeicoes, consumos,
     prof_nome, prof_login, prof_sus, prof_cbo, prof_cnes, prof_ine)
    VALUES ?
  `;

  const values = respostas.map(r => [
    r.cns, r.nome, formatarDataBRparaISO(r.dataNasc), r.sexo, r.local,
    r.leitePeito, r.alimentos, r.refeicaoTV, r.refeicoes, r.consumos,
    r.profNome, r.profLogin, r.profSus, r.profCbo, r.profCnes, r.profIne
  ]);

  db.query(sql, [values], (err, result) => {
    if (err) {
      console.error("Erro SQL:", err);
      return res.status(500).json({ erro: "Erro ao salvar respostas", detalhe: err });
    }
    res.json({ mensagem: "Respostas salvas com sucesso", inseridos: result.affectedRows });
  });
});

app.get("/respostas", (req, res) => {
  db.query("SELECT * FROM respostas ORDER BY id DESC", (err, rows) => {
    if (err) return res.status(500).json({ erro: err });
    const formatadas = rows.map(r => ({
      ...r,
      data_nasc: formatarDataBR(r.data_nasc)
    }));
    res.json(formatadas);
  });
});

app.delete("/respostas/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM respostas WHERE id=?", [id], (err) => {
    if (err) return res.status(500).json({ erro: err });
    res.json({ message: "Resposta excluída com sucesso" });
  });
});

// =============================
// INICIAR SERVIDOR
// =============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta " + PORT);
});
