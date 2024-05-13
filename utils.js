const { HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const { EmbedBuilder, DiscordAPIError } = require("discord.js");

/**
 * Check if the bot is in the guild of the interaction.
 * @param {object} interaction - The interaction object.
 * @returns {boolean} True if the bot is in the guild, otherwise false.
 */
function botInGuild(interaction) {
	return interaction.client.guilds.cache.has(interaction.guildId);
}

// Safety settings configuration
const safetySettings = [
	{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
	{ category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
	{ category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
	{ category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

/**
 * Handle different types of Gemini errors and provide appropriate responses.
 * @param {Error} err - The error object.
 * @param {object} loadingMsg - The loading message object.
 * @returns {Promise<string|void>} Returns a string "quota_error" if the error is quota-related, otherwise returns nothing.
 */
async function handleGeminiError(err, loadingMsg) {
	const errorResponses = {
		"[GoogleGenerativeAI Error]: Candidate was blocked due to SAFETY": {
			title: "⚠️ An Error Occurred",
			description: "> *The response was blocked due to **SAFETY**.* \n- *Result based on your input. Safety Blocking may not be 100% correct.*",
			color: "Red",
		},
		"[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent: [400 Bad Request] User location is not supported for the API use.": {
			title: "⚠️ An Error Occurred",
			description: "> *The user location is not supported for Gemini API use. Please contact the Developers.*",
			color: "Red",
		},
		"[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent: [429 Too Many Requests] Resource has been exhausted (e.g. check quota).": {
			title: "⚠️ An Error Occurred",
			description: "There are a lot of requests at the moment. Please try again later, or in a few minutes. \n▸ *If this issue persists after a few minutes, please contact the Developers.* \n - *We are aware of these issues and apologize for the inconvenience.* \n> - Token Limit for this minute has been reached.",
			color: "Red",
			quotaError: true,
		},
		"Cannot send an empty message": {
			title: "⚠️ An Error Occurred",
			description: "An error occurred while processing your request. Please try again later, or in a few minutes. \n▸ *If this issue persists, please contact the Developers.* \n> - Generated response may be too long. *(Fix this by specifying for the generated response to be smaller, e.g. 10 Lines)*\n> - Token Limit for this minute may have been reached.",
			color: "Red",
		},
		"[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent: [500 Internal Server Error] An internal error has occurred. Please retry or report in https://developers.generativeai.google/guide/troubleshooting": {
			title: "⚠️ An Error Occurred",
			description: "An error occurred while processing your request. This error originated from Google's side, not ours.  \n▸ *If this issue persists, please contact the Developers.* \n> - Please retry and make another request.",
			color: "Red",
		},
		default: {
			title: "⚠️ An Error Occurred",
			description: "An unknown error occurred while processing your request. Please try again later, or in a few minutes. \n▸ *If this issue persists, please contact the Developers.*\n> - Token Limit for this minute may have been reached.",
			color: "Red",
		},
	};

	const errorResponse = errorResponses[err.message] || errorResponses.default;
	const embed = new EmbedBuilder()
		.setTitle(errorResponse.title)
		.setDescription(errorResponse.description)
		.setColor(errorResponse.color);

	if (errorResponse.quotaError) {
		for (let i = 10; i > 0; i--) {
			embed.setFooter({ text: `⏱️ Retrying request in (${i})` });
			await loadingMsg.edit({ embeds: [embed] });
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
		return "quota_error";
	} else {
		await loadingMsg.edit({ embeds: [embed] });
	}
}

/**
 * Handle the response from the chat model and send it as a message.
 * @param {object} chat - The chat object.
 * @param {string} userQuestion - The user's question.
 * @param {object} interaction - The interaction object.
 * @param {object} message - The message object.
 * @param {object} loadingMsg - The loading message object.
 * @param {string} messageDeleted - The message deletion status.
 * @param {boolean} isContextMenuCommand - If the command is a context menu command.
 * @returns {Promise<void>}
 */
async function handleResponse(chat, userQuestion, interaction, message, loadingMsg, messageDeleted, isContextMenuCommand) {
	const result = await chat.sendMessage(userQuestion);
	const response = await result.response;
	let responseText = response.text();

	if (responseText.length > 2000) {
		responseText = `${response.text().substring(0, 1936)}... \n\n*Response was cut short due to Discord's character limit of 2000*`;
	}

	const regex = /<@&?\d+>/g;
	let match;

	while ((match = regex.exec(responseText)) !== null) {
		const id = message?.author?.id || interaction.user.id;

		if (match[0] !== `<@${id}>`) {
			const pingError = new EmbedBuilder()
				.setTitle("⚠️ Response Cannot Be Sent")
				.setDescription("> *The generated message contains a mention of a Role or different User to the one that sent the original message/command.*")
				.setColor("Red");
			return await loadingMsg.edit({ embeds: [pingError] });
		}
	}

	const infoEmbed = createInfoEmbed(isContextMenuCommand, message, messageDeleted);
	return await loadingMsg.edit({ content: responseText, embeds: infoEmbed });
}

/**
 * Create an info embed based on the context.
 * @param {boolean} isContextMenuCommand - If the command is a context menu command.
 * @param {object} message - The message object.
 * @param {string} messageDeleted - The message deletion status.
 * @returns {Array} The info embed array.
 */
function createInfoEmbed(isContextMenuCommand, message, messageDeleted) {
	let infoEmbed = [];

	if (isContextMenuCommand) {
		const footerText = `Response to message by ${message.author.tag}\n\n${message.content}`;
		const truncatedFooterText = footerText.length > 2030 ? `${footerText.slice(0, 2027)}...` : footerText;

		const info = new EmbedBuilder().setFooter({ text: truncatedFooterText }).setColor("Blue");
		infoEmbed.push(info);
	}

	switch (messageDeleted) {
		case "threadDeleted":
			const deletedThread = new EmbedBuilder()
				.setFooter({
					text: "A message has been deleted/is not accessible in the reply thread, Taurus does not know the past reply thread history.",
				})
				.setColor("Orange");
			infoEmbed.push(deletedThread);
			break;
		case "slashCommand":
			const deletedSlashCommand = new EmbedBuilder()
				.setFooter({
					text: "Reply thread history not accessible, utilize history by mentioning me to chat instead.",
				})
				.setColor("Orange");
			infoEmbed.push(deletedSlashCommand);
			break;
		default:
			break;
	}

	return infoEmbed;
}

/**
 * Check if the Gemini API key is valid.
 * @param {string} Gemini_API_KEY - The API key.
 * @param {object} interaction - The interaction object.
 * @param {object} message - The message object.
 * @returns {Promise<void>}
 */
async function checkGeminiApiKey(Gemini_API_KEY, interaction, message) {
	if (!Gemini_API_KEY || Gemini_API_KEY.length < 4) {
		const invalidApiEmbed = new EmbedBuilder()
				.setTitle("⚠️ Invalid API Key")
				.setDescription("> **The API Key for Gemini is invalid or not provided.**")
				.setColor("Red");

		return interaction
			? interaction.reply({ embeds: [invalidApiEmbed] })
			: message.reply({ embeds: [invalidApiEmbed] });
	}
}

/**
 * Fetch thread messages for the given message.
 * @param {string} Gemini_API_KEY - The API key.
 * @param {object} message - The message object.
 * @returns {Promise<object>} The user question, thread messages, and message deletion status.
 */
async function fetchThreadMessages(Gemini_API_KEY, message) {
	if (await checkGeminiApiKey(Gemini_API_KEY, false, message)) return;

	let threadMessages = [];
	let userQuestion = message.content;
	let messageDeleted;

	try {
		const originalMessage = await message.channel.messages.fetch(message.reference.messageId);
		const startStrings = ["Response to message by", "A message has been deleted", "Reply thread history"];
		const linkRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;

		if (isInvalidOriginalMessage(originalMessage, linkRegex, startStrings)) {
			return { userQuestion: null, threadMessages: null, messageDeleted: "threadDeleted" };
		}

		if (originalMessage.author.id === message.client.user.id) {
			threadMessages = await getThreadMessages(message, linkRegex);
		}
	} catch (error) {
		if (error instanceof DiscordAPIError && error.code === 10008) {
			messageDeleted = "threadDeleted";
			threadMessages = [];
		} else {
			throw error;
		}
	}

	return { userQuestion, threadMessages, messageDeleted };
}

/**
 * Check if the original message is invalid based on specific conditions.
 * @param {object} originalMessage - The original message object.
 * @param {RegExp} linkRegex - The link regex pattern.
 * @param {Array} startStrings - The start strings array.
 * @returns {boolean} True if the original message is invalid, otherwise false.
 */
function isInvalidOriginalMessage(originalMessage, linkRegex, startStrings) {
	return (
		originalMessage.author.id !== message.client.user.id ||
		(originalMessage.embeds.length > 0 &&
			(!originalMessage.embeds[0].footer ||
				!originalMessage.embeds[0].footer.text ||
				!startStrings.some((str) =>
					originalMessage.embeds[0].footer.text.startsWith(str)
				)) &&
			!linkRegex.test(originalMessage.content))
	);
}

/**
 * Get thread messages recursively.
 * @param {object} message - The message object.
 * @param {RegExp} linkRegex - The link regex pattern.
 * @returns {Promise<Array>} The thread messages array.
 */
async function getThreadMessages(message, linkRegex) {
	let threadMessages = [];
	let currentMessage = message;

	while (
		currentMessage.reference &&
		!(
			currentMessage.author.id === message.client.user.id &&
			currentMessage.embeds.length > 0 &&
			!linkRegex.test(currentMessage.content)
		)
	) {
		currentMessage = await message.channel.messages.fetch(currentMessage.reference.messageId);
		const sender = currentMessage.author.id === message.client.user.id ? "model" : "user";
		let content = currentMessage.content;

		if (sender === "user") {
			content = content.replace(/<@\d+>\s*/, "");
		} else if (sender === "model" && currentMessage.embeds.length > 0) {
			const footerText = currentMessage.embeds[0].footer?.text;

			if (footerText?.startsWith("Response to message by")) {
				const userMessage = footerText.split("\n")[2];
				threadMessages.unshift({ role: sender, parts: [{ text: content }] });
				threadMessages.unshift({ role: "user", parts: [{ text: userMessage }] });
				continue;
			}
		}

		threadMessages.unshift({ role: sender, parts: [{ text: content }] });
	}

	return threadMessages;
}

module.exports = {
	botInGuild,
	safetySettings,
	handleGeminiError,
	handleResponse,
	checkGeminiApiKey,
	fetchThreadMessages,
};
