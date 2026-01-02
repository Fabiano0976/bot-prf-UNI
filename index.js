const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");

const config = require("./config.json");
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
function nowISO() {
  return new Date().toISOString();
}

function ensurePanel(db) {
  if (!db.painel) db.painel = { turmasMessageId: null, cursosMessageId: null };
  if (db.painel.turmasMessageId === undefined) db.painel.turmasMessageId = null;
  if (db.painel.cursosMessageId === undefined) db.painel.cursosMessageId = null;
}

function ensureAluno(db, member) {
  const id = member.id;
  if (!db.alunos[id]) {
    db.alunos[id] = {
      discordId: id,
      tag: member.user?.tag || member.user?.username || "user",
      entrouEm: null,
      turma: null,
      cursos: [] // { nome, roleId, data, fonte: "AUTO|MANUAL", status:"ADICIONADO|REMOVIDO" }
    };
  } else {
    // atualiza tag para ficar sempre atual
    db.alunos[id].tag = member.user?.tag || member.user?.username || db.alunos[id].tag;
  }
  return db.alunos[id];
}

function getCourseRoleIdByName(nome) {
  return config.courses[nome] || null;
}

function getCourseNameByRoleId(roleId) {
  for (const [name, id] of Object.entries(config.courses)) {
    if (id === roleId) return name;
  }
  return null;
}

function isCourseActive(aluno, courseName) {
  const items = (aluno.cursos || []).filter(c => c.nome === courseName);
  if (!items.length) return false;
  return items[items.length - 1].status === "ADICIONADO";
}

function chunkLines(lines, maxLines = 30) {
  const chunks = [];
  for (let i = 0; i < lines.length; i += maxLines) chunks.push(lines.slice(i, i + maxLines));
  return chunks;
}

async function ensurePanelMessage(channel, storedId, title) {
  if (!channel) return { message: null, messageId: storedId };

  if (storedId) {
    const msg = await channel.messages.fetch(storedId).catch(() => null);
    if (msg) return { message: msg, messageId: storedId };
  }

  const msg = await channel.send({ content: `⏳ Criando painel: ${title}...` });
  return { message: msg, messageId: msg.id };
}

async function updateTurmasPanel(guild) {
  const db = loadDB();
  ensurePanel(db);

  const channel = guild.channels.cache.get(config.channels.turmas);
  if (!channel) return;

  const { message, messageId } = await ensurePanelMessage(channel, db.painel.turmasMessageId, "Turmas");
  if (!message) return;

  db.painel.turmasMessageId = messageId;
  saveDB(db);

  const turma = db.turmaAtual;
  const aberta = db.turmaAberta;

  let membros = [];
  if (turma && db.turmas[turma]?.membros) membros = db.turmas[turma].membros;

  // monta lista de nomes
  const lines = membros.map(id => {
    const aluno = db.alunos[id];
    return `• ${aluno?.tag || `<@${id}>`}`;
  });

  const embed = new EmbedBuilder()
    .setTitle("📋 Painel da Turma")
    .setDescription(
      `**Turma atual:** ${turma || "Nenhuma"}\n` +
      `**Status:** ${aberta ? "🟢 ABERTA" : "🔴 FECHADA"}\n` +
      `**Total:** ${membros.length}`
    )
    .setFooter({ text: "Atualiza automaticamente" });

  if (lines.length === 0) {
    embed.addFields({ name: "Alunos", value: "—", inline: false });
  } else {
    const chunks = chunkLines(lines, 30);
    // até 5 blocos para não estourar
    chunks.slice(0, 5).forEach((c, idx) => {
      embed.addFields({ name: idx === 0 ? "Alunos" : "Alunos (cont.)", value: c.join("\n"), inline: false });
    });
    if (chunks.length > 5) {
      embed.addFields({ name: "⚠️ Aviso", value: "Muitos alunos. (Lista cortada por limite do Discord)", inline: false });
    }
  }

  await message.edit({ content: "", embeds: [embed] }).catch(() => {});
}

async function updateCursosPanel(guild) {
  const db = loadDB();
  ensurePanel(db);

  const channel = guild.channels.cache.get(config.channels.cursos);
  if (!channel) return;

  const { message, messageId } = await ensurePanelMessage(channel, db.painel.cursosMessageId, "Cursos");
  if (!message) return;

  db.painel.cursosMessageId = messageId;
  saveDB(db);

  const mapCurso = {};
  for (const courseName of Object.keys(config.courses)) mapCurso[courseName] = [];

  for (const [id, aluno] of Object.entries(db.alunos)) {
    const lastStatus = new Map();
    for (const c of (aluno.cursos || [])) lastStatus.set(c.nome, c.status);

    for (const [nome, st] of lastStatus.entries()) {
      if (st === "ADICIONADO" && mapCurso[nome]) {
        mapCurso[nome].push(aluno.tag || `<@${id}>`);
      }
    }
  }

  const embed = new EmbedBuilder()
    .setTitle("🎓 Painel de Cursos")
    .setDescription("Lista de alunos por curso (ativos).")
    .setFooter({ text: "Atualiza automaticamente" });

  for (const [curso, lista] of Object.entries(mapCurso)) {
    const value = lista.length
      ? lista.slice(0, 25).map(n => `• ${n}`).join("\n")
      : "—";

    embed.addFields({ name: `${curso} (${lista.length})`, value, inline: false });
  }

  await message.edit({ content: "", embeds: [embed] }).catch(() => {});
}

async function refreshPanels(guild) {
  await updateTurmasPanel(guild);
  await updateCursosPanel(guild);
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("turma")
      .setDescription("Gerenciar turmas de alunos PRF")
      .addSubcommand(s =>
        s.setName("abrir")
          .setDescription("Abrir turma atual")
          .addStringOption(o => o.setName("nome").setDescription("Ex: Turma 07").setRequired(true))
      )
      .addSubcommand(s => s.setName("fechar").setDescription("Fechar turma atual"))
      .addSubcommand(s => s.setName("status").setDescription("Ver status da turma atual"))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
      .setName("curso")
      .setDescription("Cursos do aluno")
      .addSubcommand(s => s.setName("listar").setDescription("Listar cursos cadastrados"))
      .addSubcommand(s =>
        s.setName("adicionar")
          .setDescription("Adicionar curso manualmente (tenta dar cargo)")
          .addUserOption(o => o.setName("usuario").setDescription("Aluno").setRequired(true))
          .addStringOption(o => o.setName("nome").setDescription("Digite igual no /curso listar").setRequired(true))
      )
      .addSubcommand(s =>
        s.setName("remover")
          .setDescription("Remover curso manualmente (tenta remover cargo)")
          .addUserOption(o => o.setName("usuario").setDescription("Aluno").setRequired(true))
          .addStringOption(o => o.setName("nome").setDescription("Digite igual no /curso listar").setRequired(true))
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
      .setName("aluno")
      .setDescription("Ficha do aluno")
      .addSubcommand(s =>
        s.setName("ver")
          .setDescription("Ver ficha do aluno")
          .addUserOption(o => o.setName("usuario").setDescription("Aluno").setRequired(true))
      )
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
  console.log("✅ Slash commands registrados.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once("ready", async () => {
  console.log(`🤖 Bot ligado como ${client.user.tag}`);
  try {
    await registerCommands();

    const guild = client.guilds.cache.get(config.guildId);
    if (guild) await refreshPanels(guild);
  } catch (e) {
    console.error("❌ Erro:", e);
  }
});

// AUTO: quando alguém ganha/perde cargos
client.on("guildMemberUpdate", async (oldM, newM) => {
  const db = loadDB();
  ensurePanel(db);

  const oldRoles = new Set(oldM.roles.cache.map(r => r.id));
  const newRoles = new Set(newM.roles.cache.map(r => r.id));
  const added = [...newRoles].filter(id => !oldRoles.has(id));
  const removed = [...oldRoles].filter(id => !newRoles.has(id));

  // entrou como Aluno
  if (added.includes(config.roleAlunoId)) {
    const aluno = ensureAluno(db, newM);
    aluno.entrouEm = aluno.entrouEm || nowISO();

    if (db.turmaAberta && db.turmaAtual) {
      aluno.turma = db.turmaAtual;

      if (!db.turmas[db.turmaAtual]) db.turmas[db.turmaAtual] = { membros: [], criadaEm: nowISO() };
      if (!db.turmas[db.turmaAtual].membros.includes(newM.id)) db.turmas[db.turmaAtual].membros.push(newM.id);
    }
  }

  // cursos adicionados (AUTO)
  for (const roleId of added) {
    const courseName = getCourseNameByRoleId(roleId);
    if (!courseName) continue;

    const aluno = ensureAluno(db, newM);
    if (!isCourseActive(aluno, courseName)) {
      aluno.cursos.push({ nome: courseName, roleId, data: nowISO(), fonte: "AUTO", status: "ADICIONADO" });
    }
  }

  // cursos removidos (AUTO)
  for (const roleId of removed) {
    const courseName = getCourseNameByRoleId(roleId);
    if (!courseName) continue;

    const aluno = ensureAluno(db, newM);
    if (isCourseActive(aluno, courseName)) {
      aluno.cursos.push({ nome: courseName, roleId, data: nowISO(), fonte: "AUTO", status: "REMOVIDO" });
    }
  }

  saveDB(db);

  // atualiza painéis
  await refreshPanels(newM.guild);
});

// COMANDOS
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  const db = loadDB();
  ensurePanel(db);

  if (i.commandName === "turma") {
    const sub = i.options.getSubcommand();

    if (sub === "abrir") {
      db.turmaAtual = i.options.getString("nome", true);
      db.turmaAberta = true;
      if (!db.turmas[db.turmaAtual]) db.turmas[db.turmaAtual] = { membros: [], criadaEm: nowISO() };
      saveDB(db);

      await refreshPanels(i.guild);
      return i.reply({ content: `✅ Turma **${db.turmaAtual}** aberta.`, ephemeral: true });
    }

    if (sub === "fechar") {
      db.turmaAberta = false;
      saveDB(db);

      await refreshPanels(i.guild);
      return i.reply({ content: `⛔ Turma **${db.turmaAtual || "—"}** fechada.`, ephemeral: true });
    }

    if (sub === "status") {
      const t = db.turmaAtual;
      const total = t && db.turmas[t] ? db.turmas[t].membros.length : 0;
      return i.reply({
        content: `📌 Turma atual: **${t || "Nenhuma"}**\n📍 Status: **${db.turmaAberta ? "ABERTA" : "FECHADA"}**\n👥 Total: **${total}**`,
        ephemeral: true
      });
    }
  }

  if (i.commandName === "curso") {
    const sub = i.options.getSubcommand();

    if (sub === "listar") {
      const list = Object.keys(config.courses).map(c => `• ${c}`).join("\n");
      return i.reply({ content: `📚 Cursos cadastrados:\n${list}`, ephemeral: true });
    }

    if (sub === "adicionar" || sub === "remover") {
      const user = i.options.getUser("usuario", true);
      const nome = i.options.getString("nome", true);
      const roleId = getCourseRoleIdByName(nome);

      if (!roleId) {
        return i.reply({ content: "❌ Curso não encontrado. Use /curso listar e copie o nome igual.", ephemeral: true });
      }

      const member = await i.guild.members.fetch(user.id).catch(() => null);
      if (!member) return i.reply({ content: "⚠️ Não achei esse membro no servidor.", ephemeral: true });

      const aluno = ensureAluno(db, member);
      const status = sub === "adicionar" ? "ADICIONADO" : "REMOVIDO";

      aluno.cursos.push({ nome, roleId, data: nowISO(), fonte: "MANUAL", status });

      try {
        if (sub === "adicionar") await member.roles.add(roleId);
        else await member.roles.remove(roleId);
      } catch {}

      saveDB(db);
      await refreshPanels(i.guild);

      return i.reply({
        content: `✅ Curso **${nome}** ${sub === "adicionar" ? "adicionado" : "removido"} para <@${user.id}>.`,
        ephemeral: true
      });
    }
  }

  if (i.commandName === "aluno") {
    const user = i.options.getUser("usuario", true);
    const member = await i.guild.members.fetch(user.id).catch(() => null);
    if (!member) return i.reply({ content: "⚠️ Não achei esse membro.", ephemeral: true });

    const aluno = ensureAluno(db, member);

    const lastStatus = new Map();
    for (const c of (aluno.cursos || [])) lastStatus.set(c.nome, c.status);
    const ativos = [...lastStatus.entries()].filter(([_, st]) => st === "ADICIONADO").map(([n]) => n);

    const embed = new EmbedBuilder()
      .setTitle("👤 Ficha do Aluno")
      .setDescription(`**Aluno:** <@${user.id}>`)
      .addFields(
        { name: "Turma", value: aluno.turma || "—", inline: true },
        { name: "Cursos (ativos)", value: ativos.length ? ativos.join("\n") : "—", inline: false }
      );

    saveDB(db);
    return i.reply({ embeds: [embed], ephemeral: true });
  }
});

client.login(config.token);