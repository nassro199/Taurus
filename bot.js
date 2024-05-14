/**
 * @file Main File of the bot, responsible for registering events, commands, interactions, etc.
 * @summary Main entry point for the Discord bot application.
 * @description This script sets up and initializes the Discord bot, registering various events, commands, and interactions.
 * @version 3.3.0
 * @since 1.0.0
 * @authored by Naman Vrati
 * @contributed by TechyGiraffe999 & nassro199
 */

const fs = require("fs");
const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");
const { token, client_id } = require("./config.json");

/**
 * @description Main Application Client with necessary intents and partials.
 * @type {import('./typings').Client}
 */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Channel],
});

/**********************************************************************/
// Event Handler Initialization

/**
 * @description Reads and registers all event files.
 * @type {String[]}
 */
const eventFiles = fs.readdirSync("./events").filter((file) => file.endsWith(".js"));

for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, async (...args) => await event.execute(...args, client));
  }
}

/**********************************************************************/
// Initialize Command Collections

client.slashCommands = new Collection();
client.modalCommands = new Collection();
client.contextCommands = new Collection();
client.cooldowns = new Collection();
client.autocompleteInteractions = new Collection();
client.functions = new Collection();

/**********************************************************************/
// Register Slash Commands

/**
 * @description Reads and registers all slash commands.
 * @type {String[]}
 */
const slashCommands = fs.readdirSync("./interactions/slash");

for (const module of slashCommands) {
  const commandFiles = fs.readdirSync(`./interactions/slash/${module}`).filter((file) => file.endsWith(".js"));

  for (const commandFile of commandFiles) {
    const command = require(`./interactions/slash/${module}/${commandFile}`);
    client.slashCommands.set(command.data.name, command);
  }
}

/**********************************************************************/
// Register Autocomplete Interactions

/**
 * @description Reads and registers all autocomplete interactions.
 * @type {String[]}
 */
const autocompleteInteractions = fs.readdirSync("./interactions/autocomplete");

for (const module of autocompleteInteractions) {
  const files = fs.readdirSync(`./interactions/autocomplete/${module}`).filter((file) => file.endsWith(".js"));

  for (const interactionFile of files) {
    const interaction = require(`./interactions/autocomplete/${module}/${interactionFile}`);
    client.autocompleteInteractions.set(interaction.name, interaction);
  }
}

/**********************************************************************/
// Register Context-Menu Interactions

/**
 * @description Reads and registers all context menu commands.
 * @type {String[]}
 */
const contextMenus = fs.readdirSync("./interactions/context-menus");

for (const folder of contextMenus) {
  const files = fs.readdirSync(`./interactions/context-menus/${folder}`).filter((file) => file.endsWith(".js"));

  for (const file of files) {
    const menu = require(`./interactions/context-menus/${folder}/${file}`);
    const keyName = `${folder.toUpperCase()} ${menu.data.name}`;
    client.contextCommands.set(keyName, menu);
  }
}

/**********************************************************************/
// Register Modal Commands

/**
 * @description Reads and registers all modal commands.
 * @type {String[]}
 */
const modalCommands = fs.readdirSync("./interactions/modals");

for (const module of modalCommands) {
  const commandFiles = fs.readdirSync(`./interactions/modals/${module}`).filter((file) => file.endsWith(".js"));

  for (const commandFile of commandFiles) {
    const command = require(`./interactions/modals/${module}/${commandFile}`);
    client.modalCommands.set(command.id, command);
  }
}

/**********************************************************************/
// Register Functions

client.once("ready", () => {
  const functionFiles = fs.readdirSync("./functions");

  for (const functionFile of functionFiles) {
    if (functionFile.endsWith(".js")) {
      const func = require(`./functions/${functionFile}`);
      client.functions.set(functionFile.replace(".js", ""), func);
      func(client);
    }
  }
});

/**********************************************************************/
// Register Slash Commands in Discord API

const rest = new REST({ version: "9" }).setToken(token);

const commandJsonData = [
  ...Array.from(client.slashCommands.values()).map((c) => {
    const commandData = c.data instanceof SlashCommandBuilder ? c.data.toJSON() : c.data;
    commandData.integration_types = [0, 1];
    commandData.contexts = [0, 1, 2];
    return commandData;
  }),
  ...Array.from(client.contextCommands.values()).map((c) => {
    const commandData = c.data;
    commandData.integration_types = [0, 1];
    commandData.contexts = [0, 1, 2];
    return commandData;
  }),
];

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationCommands(client_id), { body: commandJsonData });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();

/**********************************************************************/
// Client Login

client.login(token);

/**********************************************************************/
// Anti-Crash Script

process.on("unhandledRejection", (reason, promise) => {
  console.error("🚫 Critical Error detected:\n\n", reason, promise);
  // Uncomment the lines below for advanced debugging.
  // console.dir(reason, { showHidden: true, depth: null });
  // console.log("Promise: ", promise);
});

process.on("uncaughtException", (error, origin) => {
  console.error("🚫 Critical Error detected:\n\n", error, origin);
  // Uncomment the lines below for advanced debugging.
  // console.dir(error, { showHidden: true, depth: null });
  // console.log("Origin: ", origin);
});
