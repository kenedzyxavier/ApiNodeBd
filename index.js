const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// =============================
// Conexão MySQL
// =============================
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

// Teste conexão
db.getConnection((err, conn) => {
  if (err) console.error("❌ Erro ao conectar MySQL:", err);
  else {
    console.log("✅ Conectado ao MySQL!");
    conn.release();
  }
});

// =============================
// UTILITÁRIOS
// =============================
const formatarDataBRparaISO = (data) => {
  if (!data) return null;
  if (data.includes("/")) {
    const [dia, mes, ano] = data.split("/");
    return `${ano}-${mes}-${dia}`;
  }
  if (data.length === 8) return `${data.substring(4,8)}-${data.substring(2,4)}-${data.substring(0,2)}`;
  return data;
};

const formatarDataBR = (dataISO) => {
  if (!dataISO) return null;
  const d = new Date(dataISO);
  if (isNaN(d)) return dataISO;
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const ano = d.getUTCFullYear();
  return `${dia}/${mes}/${ano}`;
};

const validarCampos = (obj, campos) => {
  for (const c of campos) if (!obj[c]) return c;
  return null;
};

// =============================
// ROTAS
// =============================

// Raiz
app.get("/", (req, res) => res.send("🚀 API rodando!"));

// LOGIN
app.post("/login", (req, res) => {
  const campo = validarCampos(req.body, ["login", "senha"]);
  if (campo) return res.status(400).json({ erro: `${campo} é obrigatório` });

  const { login, senha } = req.body;
  db.query(
    "SELECT id, nome, login, sus, cbo, cnes, ine FROM profissionais WHERE login=? AND senha=? LIMIT 1",
    [login, senha],
    (err, rows) => {
      if (err) return res.status(500).json({ erro: "Erro ao consultar login", detalhe: err });
      if (!rows.length) return res.status(401).json({ erro: "Credenciais inválidas" });
      res.json(rows[0]);
    }
  );
});

// =============================
// PROFISSIONAIS
// =============================
app.post("/profissionais", (req, res) => {
  const campo = validarCampos(req.body, ["nome", "login", "senha"]);
  if (campo) return res.status(400).json({ erro: `${campo} é obrigatório` });

  const { nome, login, senha, sus, cbo, cnes, ine } = req.body;
  db.query(
    "INSERT INTO profissionais (nome, login, sus, cbo, cnes, ine, senha) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [nome, login, sus || null, cbo || null, cnes || null, ine || null, senha],
    (err, result) => {
      if (err) return res.status(500).json({ erro: "Erro ao salvar profissional", detalhe: err });
      res.json({ id: result.insertId, nome, login, sus, cbo, cnes, ine });
    }
  );
});

app.post("/profissionais/lote", (req, res) => {
  const profissionais = req.body;
  if (!Array.isArray(profissionais) || !profissionais.length) return res.status(400).json({ erro: "Envie um array de profissionais" });

  for (const [i, p] of profissionais.entries()) {
    const campo = validarCampos(p, ["nome", "login", "senha"]);
    if (campo) return res.status(400).json({ erro: `Item ${i}: ${campo} é obrigatório` });
  }

  const values = profissionais.map(p => [p.nome, p.login, p.sus || null, p.cbo || null, p.cnes || null, p.ine || null, p.senha]);
  db.query("INSERT INTO profissionais (nome, login, sus, cbo, cnes, ine, senha) VALUES ?", [values], (err, result) => {
    if (err) return res.status(500).json({ erro: "Erro ao salvar profissionais em lote", detalhe: err });
    const firstId = result.insertId || 0;
    const inserted = profissionais.map((p, i) => ({ id: firstId + i, ...p }));
    res.json(inserted);
  });
});

app.get("/profissionais", (req, res) => {
  db.query("SELECT * FROM profissionais", (err, rows) => {
    if (err) return res.status(500).json({ erro: "Erro ao listar profissionais", detalhe: err });
    res.json(rows);
  });
});

app.delete("/profissionais/:id", (req, res) => {
  db.query("DELETE FROM profissionais WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ erro: "Erro ao deletar profissional", detalhe: err });
    res.json({ message: "Profissional excluído com sucesso" });
  });
});

// =============================
// RESPOSTAS
// =============================
const inserirRespostas = (respostas, callback) => {
  const ids = respostas.map(r => r.profissional_id).filter(Boolean);
  if (!ids.length) return callback({ erro: "Nenhum profissional_id válido" });

  db.query("SELECT * FROM profissionais WHERE id IN (?)", [ids], (err, profs) => {
    if (err) return callback({ erro: "Erro ao buscar profissionais", detalhe: err });

    const profMap = {};
    profs.forEach(p => profMap[p.id] = p);

    const values = respostas.map(r => {
      const prof = profMap[r.profissional_id] || {};
      return [
        r.cns || null,
        r.nome,
        formatarDataBRparaISO(r.dataNasc) || null,
        r.sexo || null,
        r.local || null,
        r.leitePeito || null,
        r.alimentos || null,
        r.refeicaoTV || null,
        r.refeicoes || null,
        r.consumos || null,
        prof.nome || null,
        prof.login || null,
        prof.sus || null,
        prof.cbo || null,
        prof.cnes || null,
        prof.ine || null,
        r.profissional_id,
        new Date()
      ];
    });

    const sql = `INSERT INTO respostas
      (cns,nome,data_nasc,sexo,local,leite_peito,alimentos,refeicao_tv,refeicoes,consumos,
       prof_nome,prof_login,prof_sus,prof_cbo,prof_cnes,prof_ine,profissional_id,data_envio)
       VALUES ?`;

    db.query(sql, [values], (err, result) => {
      if (err) return callback({ erro: "Erro ao salvar respostas", detalhe: err });
      callback(null, { inseridos: result.affectedRows, profissionais: profs });
    });
  });
};

app.post("/respostas", (req, res) => {
  const campo = validarCampos(req.body, ["nome", "profissional_id"]);
  if (campo) return res.status(400).json({ erro: `${campo} é obrigatório` });

  inserirRespostas([req.body], (err, result) => {
    if (err) return res.status(500).json(err);
    res.json({ id: result.inseridos, ...req.body });
  });
});

app.post("/respostas/lote", (req, res) => {
  if (!Array.isArray(req.body) || !req.body.length) return res.status(400).json({ erro: "Envie um array de respostas" });

  inserirRespostas(req.body, (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(result);
  });
});

app.get("/respostas", (req, res) => {
  db.query("SELECT * FROM respostas ORDER BY id DESC", (err, rows) => {
    if (err) return res.status(500).json({ erro: "Erro ao listar respostas", detalhe: err });
    res.json(rows.map(r => ({ ...r, data_nasc: formatarDataBR(r.data_nasc) })));
  });
});

app.get("/respostas/completo", (req, res) => {
  db.query(
    `SELECT r.*, p.nome AS prof_nome, p.login AS prof_login, p.sus AS prof_sus, p.cbo AS prof_cbo, p.cnes AS prof_cnes, p.ine AS prof_ine
     FROM respostas r
     LEFT JOIN profissionais p ON r.profissional_id = p.id
     ORDER BY r.id DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ erro: "Erro ao listar respostas completas", detalhe: err });
      res.json(rows.map(r => ({ ...r, data_nasc: r.data_nasc ? formatarDataBR(r.data_nasc) : null })));
    }
  );
});

app.delete("/respostas/:id", (req, res) => {
  db.query("DELETE FROM respostas WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ erro: "Erro ao deletar resposta", detalhe: err });
    res.json({ message: "Resposta excluída com sucesso" });
  });
});

// =============================
// INICIAR SERVIDOR
// =============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Servidor rodando na porta " + PORT));
