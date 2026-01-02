// index.js
const fs = require("fs");
const path = require("path");
const express = require("express");
const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, REST } = require("discord.js");

const {
  TOKEN,
  CLIENT_ID,
  GUILD_ID,
  ROLE_ALUNO_ID,
  CHANNEL_TURMAS,
  CHANNEL_CURSOS,
  CURSO_FB,
  CURSO_AP,
  CURSO_SAT,
  CURSO_OB,
  PORT
} = process.env;

// ====== validações (pra não ficar “undefined”) ======
function need(name, value) {
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}
need("TOKEN", TOKEN);
need("CLIENT_ID", CLIENT_ID);
need("GUILD_ID", GUILD_ID);

// ====== web server (Railway precisa disso) ======
const app = express();
app.get("/", (req, res) => res.send("BOT UNI.PRF online ✅"));
app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

const listenPort = Number(PORT || 3000);
app.listen(listenPort, "0.0.0.0", () => {
  console.log(`🌐 Keep-alive on port ${listenPort}`);
});

// ====== database.json local (precisa estar no GitHub também) ======
const dbPath = path.join(__dirname, "database.json");
function ensureDB() {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({
      turmaAtual: null,
      turmaAberta: false,
      turmas: {},
      alunos: {}
    }, null, 2));
  }
}
function readDB() {
  ensureDB();
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}
function writeDB(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

// ====== Discord bot ======
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// comandos
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Teste do bot"),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Ver status do bot"),

  new SlashCommandBuilder()
    .setName("turma_abrir")
    .setDescription("Abrir uma turma")
    .addStringOption(o => o.setName("nome").setDescription("Nome da turma").setRequired(true)),

  new SlashCommandBuilder()
    .setName("turma_fechar")
    .setDescription("Fechar a turma atual"),

  new SlashCommandBuilder()
    .setName("aluno_add")
    .setDescription("Adicionar aluno na turma atual")
    .addUserOption(o => o.setName("membro").setDescription("Aluno").setRequired(true)),

  new SlashCommandBuilder()
    .setName("aluno_remover")
    .setDescription("Remover aluno da turma atual")
    .addUserOption(o => o.setName("membro").setDescription("Aluno").setRequired(true)),

  new SlashCommandBuilder()
    .setName("listar")
    .setDescription("Listar turma atual e alunos")
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log("✅ Slash commands registrados.");
}

client.once("ready", async () => {
  console.log(`🤖 Bot ligado como ${client.user.tag}`);
  await registerCommands();
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const db = readDB();

  if (interaction.commandName === "ping") {
    return interaction.reply({ content: "pong ✅", ephemeral: true });
  }

  if (interaction.commandName === "status") {
    const turma = db.turmaAtual ? db.turmaAtual : "Nenhuma";
    const aberta = db.turmaAberta ? "Sim" : "Não";
    return interaction.reply({ content: `📌 Turma atual: **${turma}**\n📖 Turma aberta: **${aberta}**`, ephemeral: true });
  }

  if (interaction.commandName === "turma_abrir") {
    const nome = interaction.options.getString("nome", true);
    db.turmaAtual = nome;
    db.turmaAberta = true;
    db.turmas[nome] = db.turmas[nome] || { alunos: [], cursos: {} };
    writeDB(db);

    // manda no canal turmas se tiver
    try {
      const chId = CHANNEL_TURMAS;
      if (chId) {
        const ch = await client.channels.fetch(chId);
        await ch.send(`✅ **Turma aberta:** **${nome}**\nUse /aluno_add para adicionar alunos.`);
      }
    } catch {}

    return interaction.reply({ content: `✅ Turma **${nome}** aberta!`, ephemeral: true });
  }

  if (interaction.commandName === "turma_fechar") {
    db.turmaAberta = false;
    writeDB(db);

    try {
      const chId = CHANNEL_TURMAS;
      if (chId) {
        const ch = await client.channels.fetch(chId);
        await ch.send(`🔒 **Turma fechada:** **${db.turmaAtual || "Nenhuma"}**`);
      }
    } catch {}

    return interaction.reply({ content: "🔒 Turma fechada!", ephemeral: true });
  }

  if (interaction.commandName === "aluno_add") {
    if (!db.turmaAtual) return interaction.reply({ content: "❌ Não tem turma atual. Use /turma_abrir.", ephemeral: true });
    if (!db.turmaAberta) return interaction.reply({ content: "❌ Turma está fechada. Use /turma_abrir.", ephemeral: true });

    const membro = interaction.options.getUser("membro", true);
    const turma = db.turmaAtual;

    db.turmas[turma] = db.turmas[turma] || { alunos: [], cursos: {} };
    if (!db.turmas[turma].alunos.includes(membro.id)) {
      db.turmas[turma].alunos.push(membro.id);
    }
    writeDB(db);

    // dá cargo de aluno se quiser
    try {
      if (ROLE_ALUNO_ID) {
        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(membro.id);
        await member.roles.add(ROLE_ALUNO_ID);
      }
    } catch {}

    return interaction.reply({ content: `✅ ${membro} adicionado na turma **${turma}**.`, ephemeral: true });
  }

  if (interaction.commandName === "aluno_remover") {
    if (!db.turmaAtual) return interaction.reply({ content: "❌ Não tem turma atual.", ephemeral: true });

    const membro = interaction.options.getUser("membro", true);
    const turma = db.turmaAtual;

    if (!db.turmas[turma]) return interaction.reply({ content: "❌ Turma não encontrada.", ephemeral: true });

    db.turmas[turma].alunos = db.turmas[turma].alunos.filter(id => id !== membro.id);
    writeDB(db);

    return interaction.reply({ content: `🗑️ ${membro} removido da turma **${turma}**.`, ephemeral: true });
  }

  if (interaction.commandName === "listar") {
    if (!db.turmaAtual) return interaction.reply({ content: "❌ Não tem turma atual.", ephemeral: true });

    const turma = db.turmaAtual;
    const alunosIds = (db.turmas[turma]?.alunos || []);
    const lista = alunosIds.length
      ? alunosIds.map(id => `<@${id}>`).join("\n")
      : "_Nenhum aluno ainda_";

    return interaction.reply({
      content: `📚 **Turma:** **${turma}**\n👥 **Alunos:**\n${lista}`,
      ephemeral: false
    });
  }
});

client.login(TOKEN);
