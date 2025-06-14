//Frameworks etc...
const express = require("express"); // Usado para gerenciar e manipular rotas
const app = express(); //  ^^^
const bodyParser = require("body-parser"); //Usado para requisitar dados do body
const handlebars = require("express-handlebars"); //Usado para definir templates e passar informações
const chalk = require("chalk");
const say = console.log;
const cors = require("cors");
//Banco de dados
const tutortime = require("./models/dados");
const { Sequelize } = require("sequelize");
//Tabelas
const Monitorias = tutortime.Monitoria;
const Professor = tutortime.Professor;
const Monitor = tutortime.Monitor;
const Materia = tutortime.Materia;
const Existente = tutortime.Existente;
let c = 1;

// Array de dias da semana para normalização
const DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// Função para normalizar o valor de 'dia'
function normalizarDia(dia) {
  const diaNormalizado = DIAS_SEMANA.find(
    (d) => d.toLowerCase() === dia.toLowerCase()
  );
  return diaNormalizado || dia; // Retorna o dia normalizado ou o valor original se não encontrar correspondência
}

//-Config⚙️
//Template Engine
app.engine(
  "handlebars",
  handlebars.engine({
    defaultLayout: "main", // Layout padrão
    runtimeOptions: {
      allowedProtoProperties: true,
      allowProtoPropertiesByDefault: true,
    },
    helpers: {
      ifCond: function (v1, v2, options) {
        //Definir IF
        if (v1 === v2) {
          return options.fn(this);
        }
        return options.inverse(this);
      },
    },
  })
);

app.set("view engine", "handlebars"); //Definindo engine como HANDLEBARS

//CORS para permitir requisições do frontend React
app.use(
  cors({
    origin: "https://tutor-time-v0-2.vercel.app/", // URL do seu app React
    credentials: true,
  })
);

//Pastas Publicas
app.use(express.static("uploads"));
app.use(express.static("css"));

//BodyParser
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//Rotas

// API endpoints for React frontend
app.get("/api/subjects", async function (req, res) {
  try {
    const subjects = await Materia.findAll();
    res.json(subjects);
  } catch (error) {
    console.error("Error fetching subjects:", error);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
});

app.get("/api/tutorials", async function (req, res) {
  try {
    const tutorials = await Monitorias.findAll({
      include: [
        { model: Materia, as: "Materia" },
        { model: Professor, as: "Professor" },
        { model: Monitor, as: "Monitor" },
      ],
      raw: false,
    });
    res.json(tutorials);
  } catch (error) {
    console.error("Error fetching tutorials:", error);
    res.status(500).json({ error: "Failed to fetch tutorials" });
  }
});

app.post("/api/subjects", async function (req, res) {
  try {
    const newSubject = await Materia.create({
      nome: req.body.materiaREQ,
      imagemUrl: req.body.imagemREQ || "/logo.png",
    });

    say(chalk.bgCyan("API: Added subject " + req.body.materiaREQ));
    say(chalk.black("---------------"));

    res.status(201).json(newSubject);
  } catch (error) {
    console.error("Error creating subject:", error);
    res.status(500).json({ error: "Failed to create subject" });
  }
});

app.post("/api/tutorials", async function (req, res) {
  try {
    const id_materia = await Materia.findOne({
      where: { id: req.body.materiaREQ },
      attributes: ["id", "nome", "imagemUrl"],
    });

    // Create Monitor and Professor records
    const monitor = await Monitor.create({
      nome: req.body.monitorREQ,
      email: "TESTE",
      materia: id_materia.nome,
    });

    const professor = await Professor.create({
      nome: req.body.professorREQ,
      email: "TESTE",
    });

    // Check if subject exists in Existente table
    const verify = await Existente.findOne({
      where: { nome: id_materia.nome },
    });

    // Add to Existente table if not already present
    if (!verify) {
      await Existente.create({
        nome: id_materia.nome,
        imagemUrl: id_materia.imagemUrl,
      });
    }

    // Normalizar o valor de 'dia'
    const diaNormalizado = normalizarDia(req.body.diaREQ);

    // Create the tutorial
    const newTutorial = await Monitorias.create({
      horario: req.body.horarioREQ,
      dia: diaNormalizado,
      local: req.body.localREQ,
      imagemUrl: id_materia.imagemUrl,
      descricao: req.body.descricaoREQ,
      professorId: professor.id,
      monitorId: monitor.id,
      materiaId: id_materia.id,
    });

    say(chalk.bgCyan("API: Added tutorial for " + id_materia.nome));
    say(chalk.black("---------------"));

    // Fetch the newly created tutorial with associations
    const result = await Monitorias.findOne({
      where: { id: newTutorial.id },
      include: [
        { model: Materia, as: "Materia" },
        { model: Professor, as: "Professor" },
        { model: Monitor, as: "Monitor" },
      ],
      raw: false,
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("Error creating tutorial:", error);
    res.status(500).json({
      error: "Failed to create tutorial",
      details: error.message,
    });
  }
});

app.delete("/api/tutorials/:id", async function (req, res) {
  try {
    const monitoriadele = await Monitorias.findOne({
      where: { id: req.params.id },
    });

    if (!monitoriadele) {
      return res.status(404).json({ error: "Tutorial not found" });
    }

    const id_mat_monitoria = monitoriadele.materiaId;
    const materia = await Materia.findOne({
      where: { id: id_mat_monitoria },
    });
    const monitorias = await Monitorias.findAll({
      where: { materiaId: id_mat_monitoria },
    });

    // If this is the last tutorial for this subject, remove from Existente table
    if (monitorias.length === 1) {
      await Existente.destroy({ where: { nome: materia.nome } });
    }

    await Monitorias.destroy({ where: { id: req.params.id } });

    say(chalk.bgCyan("API: Deleted tutorial"));
    say(chalk.black("---------------"));

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error deleting tutorial:", error);
    res.status(500).json({ error: "Failed to delete tutorial" });
  }
});

app.delete("/api/subjects/:id", async function (req, res) {
  try {
    const materiaId = req.params.id;

    // Delete all tutorials for this subject
    await Monitorias.destroy({ where: { materiaId: materiaId } });

    // Get the subject name before deleting
    const nomemat = await Materia.findOne({ where: { id: materiaId } });

    if (!nomemat) {
      return res.status(404).json({ error: "Subject not found" });
    }

    // Delete the subject
    await Materia.destroy({ where: { id: materiaId } });

    // Delete from Existente table
    await Existente.destroy({ where: { nome: nomemat.nome } });

    say(chalk.bgCyan("API: Deleted subject: " + nomemat.nome));
    say(chalk.black("---------------"));

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error deleting subject:", error);
    res.status(500).json({ error: "Failed to delete subject" });
  }
});
//Criando monitorias
app.post("/add", async function (req, res) {
  try {
    const id_materia = await Materia.findOne({
      where: { id: req.body.materiaREQ },
      attributes: ["id", "nome", "imagemUrl"],
    });

    // Criação dos registros de Monitor e Professor
    const monitor = await Monitor.create({
      nome: req.body.monitorREQ,
      email: "TESTE",
      materia: id_materia.nome,
    });

    const professor = await Professor.create({
      nome: req.body.professorREQ,
      email: "TESTE",
    });

    const id_moni = monitor.id;
    const id_prof = professor.id;

    async function verificarEAdicionarMateria(id_materia) {
      try {
        const verify = await Existente.findAll({
          where: {
            nome: id_materia.nome,
          },
        });

        if (verify.length === 0) {
          const imagem = await Materia.findOne({
            where: { id: req.body.materiaREQ },
            attributes: ["id", "nome", "imagemUrl"],
          });
          // Adicionar a nova monitoria
          await Existente.create({
            nome: id_materia.nome,
            imagemUrl: imagem.imagemUrl,
          });
        }
      } catch (error) {
        console.error("Erro ao verificar e adicionar matéria:", error);
      }
    }
    verificarEAdicionarMateria({ nome: id_materia.nome });

    await Monitorias.create({
      horario: req.body.horarioREQ,
      dia: req.body.diaREQ,
      local: req.body.localREQ,
      imagemUrl: id_materia.imagemUrl,
      descricao: req.body.descricaoREQ,
      professorId: id_prof,
      monitorId: id_moni,
      materiaId: id_materia.id,
    });
    say(chalk.bgCyan("Adicionou Monitoria de " + id_materia.nome));
    say(chalk.black("---------------"));

    res.redirect("/manage/True");
  } catch (erro) {
    res.send("ERRO EM CRIAR MONITORIA" + erro);
  }
});
//          404
app.use((req, res, next) => {
  res.render("src/erro");
});

//Inicializando Servidor!
app.listen(3000);
say(chalk.blue("Server Rodando na porta 3000!"));
