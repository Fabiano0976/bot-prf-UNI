const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ Variáveis de ambiente faltando");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ---------- SLASH COMMANDS ----------
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Teste do bot"),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Ver status do bot")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("✅ Slash commands registrados.");
  } catch (err) {
    console.error("❌ Erro ao registrar comandos:", err);
  }
})();

// ---------- BOT ONLINE ----------
client.once("ready", () => {
  console.log(`🤖 Bot ligado como ${client.user.tag}`);
});

// ---------- INTERACTIONS ----------
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("🏓 Pong!");
  }

  if (interaction.commandName === "status") {
    await interaction.reply("✅ Bot online e funcionando");
  }
});

// 🔥 ISSO MANTÉM O BOT VIVO
client.login(TOKEN);
