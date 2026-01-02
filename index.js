const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

/* =========================
   CONFIG VIA RAILWAY (ENV)
========================= */
const config = {
  token: process.env.TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  roleAlunoId: process.env.ROLE_ALUNO_ID,
  channels: {
    turmas: process.env.CHANNEL_TURMAS,
    cursos: process.env.CHANNEL_CURSOS
  },
  courses: {
    "Formação Básica PRF": process.env.CURSO_FB,
    "Abordagem & Prisão": process.env.CURSO_AP,
    "SAT Tático": process.env.CURSO_SAT,
    "Operações & Blitz": process.env.CURSO_OB
  }
};

/* =========================
   CHECK DE VARIÁVEIS
========================= */
const required = [
  "TOKEN",
  "CLIENT_ID",
  "GUILD_ID",
  "ROLE_ALUNO_ID",
  "CHANNEL_TURMAS",
  "CHANNEL_CURSOS",
  "CURSO_FB",
  "CURSO_AP",
  "CURSO_SAT",
  "CURSO_OB"
];

for (const k of required) {
  if (!process.env[k]) {
    console.error(`❌ Missing env var: ${k}`);
    process.exit(1);
  }
}

/* =========================
   DATABASE (opcional)
========================= */
const DB_PATH = path.join(__dirname, "database.json");
function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return {
      turmaAtual: null,
      turmaAberta: false,
      turmas: {},
      alunos: {},
      painel: { turmasMessageId: null, cursosMessageId: null }
    };
  }
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

/* =========================
   CLIENT
========================= */
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once("ready", async () => {
  console.log(`🤖 Bot ligado como ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder().setName("ping").setDescription("Teste do bot")
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(config.token);

  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commands }
  );

  console.log("✅ Slash commands registrados.");
});

client.login(config.token);
