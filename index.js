const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ===== Conexão com MySQL (Railway) =====
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
  if (isNaN(d)) return dataISO;
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const ano = d.getUTCFullYear();
  return `${dia}/${mes}/${ano}`;
}

// =============================
// Função de validação de campos obrigatórios
// =============================
function validarCamposObrigatorios(obj, campos) {
  for (const campo of campos) {
    if (!obj[campo]) return campo;
  }
  return null;
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
  const campoFaltando = validarCamposObrigatorios(req.body, ["login", "senha"]);
  if (campoFaltando) return res.status(400).json({ erro: `${campoFaltando} é obrigatório` });

  const { login, senha } = req.body;
  const sql = `
    SELECT id, nome, login, sus, cbo, cnes, ine
    FROM profissionais
    WHERE login=? AND senha=?
    LIMIT 1
  `;
  db.query(sql, [login, senha], (err, rows) => {
    if (err) return res.status(500).json({ erro: "Erro ao consultar profissional" });
    if (rows.length === 0) return res.status(401).json({ erro: "Credenciais inválidas" });
    res.json(rows[0]);
  });
});

// =============================
// ROTAS PROFISSIONAIS
// =============================
app.post("/profissionais", (req, res) => {
  const campoFaltando = validarCamposObrigatorios(req.body, ["nome", "login", "senha"]);
  if (campoFaltando) return res.status(400).json({ erro: `${campoFaltando} é obrigatório` });

  const p = req.body;
  const sql = `
    INSERT INTO profissionais (nome, login, sus, cbo, cnes, ine, senha)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  db.query(sql, [p.nome, p.login, p.sus, p.cbo, p.cnes, p.ine, p.senha], (err, result) => {
    if (err) return res.status(500).json({ erro: "Erro ao salvar profissional", detalhe: err });
    res.json({ id: result.insertId, ...p });
  });
});

app.post("/profissionais/lote", (req, res) => {
  const profissionais = req.body;
  if (!Array.isArray(profissionais) || profissionais.length === 0) {
    return res.status(400).json({ erro: "Envie um array de profissionais" });
  }

  // Validar cada item do array
  for (const [i, p] of profissionais.entries()) {
    const campoFaltando = validarCamposObrigatorios(p, ["nome", "login", "senha"]);
    if (campoFaltando) return res.status(400).json({ erro: `Item ${i}: ${campoFaltando} é obrigatório` });
  }

  const values = profissionais.map(p => [
    p.nome, p.login, p.sus || null, p.cbo || null, p.cnes || null, p.ine || null, p.senha
  ]);

  const sql = `
    INSERT INTO profissionais (nome, login, sus, cbo, cnes, ine, senha)
    VALUES ?
  `;
  db.query(sql, [values], (err, result) => {
    if (err) return res.status(500).json({ erro: "Erro ao salvar profissionais em lote", detalhe: err });

    const firstId = result.insertId || null;
    const inserted = profissionais.map((p, i) => ({
      id: firstId ? firstId + i : null,
      ...p
    }));

    res.json(inserted);
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
  const campoFaltando = validarCamposObrigatorios(req.body, ["nome", "profissional_id"]);
  if (campoFaltando) return res.status(400).json({ erro: `${campoFaltando} é obrigatório` });

  const r = req.body;

  db.query("SELECT * FROM profissionais WHERE id = ?", [r.profissional_id], (err, rows) => {
    if (err) return res.status(500).json({ erro: "Erro ao buscar profissional", detalhe: err });

    const prof = rows[0] || {};
    const sql = `
      INSERT INTO respostas
      (cns, nome, data_nasc, sexo, local, leite_peito, alimentos, refeicao_tv, refeicoes, consumos,
       prof_nome, prof_login, prof_sus, prof_cbo, prof_cnes, prof_ine, profissional_id, data_envio)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    const values = [
      r.cns, r.nome, formatarDataBRparaISO(r.dataNasc), r.sexo, r.local,
      r.leitePeito, r.alimentos, r.refeicaoTV, r.refeicoes, r.consumos,
      prof.nome || null, prof.login || null, prof.sus || null, prof.cbo || null,
      prof.cnes || null, prof.ine || null,
      r.profissional_id
    ];

    db.query(sql, values, (err, result) => {
      if (err) return res.status(500).json({ erro: "Erro ao salvar resposta", detalhe: err });

      res.json({
        id: result.insertId,
        ...r,
        profissional: prof
      });
    });
  });
});

app.post("/respostas/lote", (req, res) => {
  const respostas = req.body;
  if (!Array.isArray(respostas) || respostas.length === 0) {
    return res.status(400).json({ erro: "Envie um array de respostas" });
  }

  // Validar cada item
  for (const [i, r] of respostas.entries()) {
    const campoFaltando = validarCamposObrigatorios(r, ["nome", "profissional_id"]);
    if (campoFaltando) return res.status(400).json({ erro: `Item ${i}: ${campoFaltando} é obrigatório` });
  }

  const ids = respostas.map(r => r.profissional_id);
  db.query("SELECT * FROM profissionais WHERE id IN (?)", [ids], (err, profs) => {
    if (err) return res.status(500).json({ erro: "Erro ao buscar profissionais", detalhe: err });

    const profMap = {};
    for (const p of profs) profMap[p.id] = p;

    const values = respostas.map(r => {
      const prof = profMap[r.profissional_id] || {};
      return [
        r.cns, r.nome, formatarDataBRparaISO(r.dataNasc), r.sexo, r.local,
        r.leitePeito, r.alimentos, r.refeicaoTV, r.refeicoes, r.consumos,
        prof.nome || null, prof.login || null, prof.sus || null,
        prof.cbo || null, prof.cnes || null, prof.ine || null,
        r.profissional_id
      ];
    });

    const sql = `
      INSERT INTO respostas
      (cns, nome, data_nasc, sexo, local, leite_peito, alimentos, refeicao_tv, refeicoes, consumos,
       prof_nome, prof_login, prof_sus, prof_cbo, prof_cnes, prof_ine, profissional_id)
      VALUES ?
    `;

    db.query(sql, [values], (err, result) => {
      if (err) return res.status(500).json({ erro: "Erro ao salvar respostas em lote", detalhe: err });

      res.json({
        mensagem: "Respostas salvas com sucesso",
        inseridos: result.affectedRows,
        profissionais: profs
      });
    });
  });
});

app.get("/respostas", (req, res) => {
  db.query("SELECT * FROM respostas ORDER BY id DESC", (err, rows) => {
    if (err) return res.status(500).json({ erro: err });
    const formatadas = rows.map(r => ({ ...r, data_nasc: formatarDataBR(r.data_nasc) }));
    res.json(formatadas);
  });
});

app.get("/respostas/completo", (req, res) => {
  const sql = `
    SELECT r.*, p.nome AS prof_atual_nome, p.login AS prof_atual_login, 
           p.sus AS prof_atual_sus, p.cbo AS prof_atual_cbo, 
           p.cnes AS prof_atual_cnes, p.ine AS prof_atual_ine
    FROM respostas r
    LEFT JOIN profissionais p ON r.profissional_id = p.id
    ORDER BY r.id DESC
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ erro: err });
    const formatadas = rows.map(r => ({ ...r, data_nasc: r.data_nasc ? formatarDataBR(r.data_nasc) : r.data_nasc }));
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
