const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField,
} = require("discord.js");

require("dotenv").config();

if (!process.env.TOKEN) {
  console.log("❌ TOKEN não encontrado no Railway.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("clientReady", () => {
  console.log(`✅ Logado como ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: "PRF • Avisos" }],
    status: "online",
  });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // /pingprf
  if (interaction.commandName === "pingprf") {
    return interaction.reply({
      content: "✅ Bot PRF online!",
      ephemeral: true,
    });
  }

  // /aviso
  if (interaction.commandName === "aviso") {
    const member = interaction.member;

    const allowed =
      member.permissions.has(PermissionsBitField.Flags.Administrator) ||
      member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
      member.permissions.has(PermissionsBitField.Flags.ManageMessages);

    if (!allowed) {
      return interaction.reply({
        content: "❌ Você não tem permissão para enviar avisos.",
        ephemeral: true,
      });
    }

    const titulo = interaction.options.getString("titulo", true);
    const mensagem = interaction.options.getString("mensagem", true);
    const canalEscolhido = interaction.options.getChannel("canal");
    const cargo = interaction.options.getRole("cargo");

    const canal = canalEscolhido ?? interaction.channel;
    const mentionText = cargo ? `<@&${cargo.id}>` : "";

    // 🔷 EMBED GRANDE, LIMPO, SEM TEXTO FIXO
    const embed = new EmbedBuilder()
      .setColor(0x0f7ae5)
      .setTitle(titulo)
      .setDescription(mensagem)
      .setFooter({ text: "PRF • Sistema de Avisos" })
      .setTimestamp();

    await canal.send({
      content: mentionText,
      embeds: [embed],
    });

    await interaction.reply({
      content: `✅ Aviso enviado em ${canal}.`,
      ephemeral: true,
    });
  }
});

client.login(process.env.TOKEN);
