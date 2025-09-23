// server.js
const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ===== Conexão com MySQL (Railway / Render / outro) =====
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Testar conexão inicial
db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Erro ao conectar no MySQL:", err);
  } else {
    console.log("✅ Conectado ao MySQL!");
    connection.release();
  }
});

// =============================
// Funções utilitárias
// =============================
function formatarDataBRparaISO(data) {
  if (!data) return null;
  if (typeof data !== "string") return data;
  if (data.includes("/")) {
    const [dia, mes, ano] = data.split("/");
    return `${ano}-${mes.padStart(2,'0')}-${dia.padStart(2,'0')}`;
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
  if (isNaN(d.getTime())) return dataISO;
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const ano = d.getUTCFullYear();
  return `${dia}/${mes}/${ano}`;
}

// =============================
// ROTA RAIZ
// =============================
app.get("/", (req, res) => {
  res.send("🚀 API rodando com sucesso!");
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

app.get("/profissionais/:id", (req, res) => {
  const { id } = req.params;
  db.query("SELECT * FROM profissionais WHERE id = ?", [id], (err, rows) => {
    if (err) return res.status(500).json({ erro: err });
    if (rows.length === 0) return res.status(404).json({ erro: "Profissional não encontrado" });
    res.json(rows[0]);
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
// - usa `profissional_id` (FK para profissionais.id)
// - grava `data_envio` com timestamp atual
// - ao buscar, faz JOIN para trazer dados do profissional associado
// =============================
app.post("/respostas", (req, res) => {
  const r = req.body;

  const sql = `
    INSERT INTO respostas 
    (cns, nome, data_nasc, sexo, local, leite_peito, alimentos, refeicao_tv, refeicoes, consumos,
     prof_nome, prof_login, prof_sus, prof_cbo, prof_cnes, prof_ine, profissional_id, data_envio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const dataNascISO = formatarDataBRparaISO(r.data_nasc);
  const now = new Date(); // será gravado como timestamp

  db.query(sql, [
    r.cns, r.nome, dataNascISO, r.sexo, r.local,
    r.leite_peito, r.alimentos, r.refeicao_tv, r.refeicoes, r.consumos,
    r.prof_nome, r.prof_login, r.prof_sus, r.prof_cbo, r.prof_cnes, r.prof_ine,
    r.profissional_id || null,
    now
  ], (err, result) => {
    if (err) {
      console.error("Erro SQL:", err);
      return res.status(500).json({ erro: "Erro ao salvar resposta", detalhe: err });
    }
    res.json({ id: result.insertId, ...r, data_nasc: dataNascISO, data_envio: now });
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
     prof_nome, prof_login, prof_sus, prof_cbo, prof_cnes, prof_ine, profissional_id, data_envio)
    VALUES ?
  `;

  const values = respostas.map(r => {
    const dataNascISO = formatarDataBRparaISO(r.data_nasc);
    const now = new Date();
    return [
      r.cns, r.nome, dataNascISO, r.sexo, r.local,
      r.leite_peito, r.alimentos, r.refeicao_tv, r.refeicoes, r.consumos,
      r.prof_nome, r.prof_login, r.prof_sus, r.prof_cbo, r.prof_cnes, r.prof_ine,
      r.profissional_id || null,
      now
    ];
  });

  db.query(sql, [values], (err, result) => {
    if (err) {
      console.error("Erro SQL:", err);
      return res.status(500).json({ erro: "Erro ao salvar respostas", detalhe: err });
    }
    res.json({ mensagem: "Respostas salvas com sucesso", inseridos: result.affectedRows });
  });
});

// GET /respostas: traz respostas + informaçõs do profissional (JOIN)
app.get("/respostas", (req, res) => {
  const sql = `
    SELECT r.*, 
           p.id AS profissional_id_link, p.nome AS profissional_nome, p.login AS profissional_login,
           p.sus AS profissional_sus, p.cbo AS profissional_cbo, p.cnes AS profissional_cnes, p.ine AS profissional_ine
    FROM respostas r
    LEFT JOIN profissionais p ON r.profissional_id = p.id
    ORDER BY r.id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ erro: err });

    const formatadas = rows.map(r => {
      return {
        ...r,
        data_nasc: formatarDataBR(r.data_nasc),
        data_envio: r.data_envio ? new Date(r.data_envio).toLocaleString("pt-BR") : null
      };
    });

    res.json(formatadas);
  });
});

app.get("/respostas/:id", (req, res) => {
  const { id } = req.params;
  const sql = `
    SELECT r.*, 
           p.id AS profissional_id_link, p.nome AS profissional_nome, p.login AS profissional_login,
           p.sus AS profissional_sus, p.cbo AS profissional_cbo, p.cnes AS profissional_cnes, p.ine AS profissional_ine
    FROM respostas r
    LEFT JOIN profissionais p ON r.profissional_id = p.id
    WHERE r.id = ?
    LIMIT 1
  `;
  db.query(sql, [id], (err, rows) => {
    if (err) return res.status(500).json({ erro: err });
    if (rows.length === 0) return res.status(404).json({ erro: "Resposta não encontrada" });
    const r = rows[0];
    r.data_nasc = formatarDataBR(r.data_nasc);
    r.data_envio = r.data_envio ? new Date(r.data_envio).toLocaleString("pt-BR") : null;
    res.json(r);
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
