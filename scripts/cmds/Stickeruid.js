// Le code utilise les fonctions globales de base de données, 
// qui liront/écriront dans threadsData.json (pour l'état du mode ON/OFF).

module.exports = {
	config: {
		name: "stickeruid",
		aliases: ["suid"],
		version: "2.0", 
		author: "Joel", 
		countDown: 5,
		role: 0,
		description: {
			vi: "Lấy UID của Sticker Facebook trong tin nhắn đã trả lời",
			en: "Get the UID of the Facebook Sticker from the replied message"
		},
		category: "info",
		guide: {
			en: "1. Reply to a sticker message with {pn} to get its UID.\n2. Use {pn} on/off to toggle automatic sticker UID display in the thread."
		}
	},

	langs: {
		vi: {
			noReply: "Vui lòng trả lời tin nhắn có Sticker để lấy UID.",
			noSticker: "Tin nhắn trả lời không chứa Sticker nào.",
			stickerUID: "🖼️ UID du Sticker: %1",
            modeOn: "✅ Mode automatique de détection de Sticker UID activé dans ce fil.",
            modeOff: "❌ Mode automatique de détection de Sticker UID désactivé dans ce fil."
		},
		en: {
			noReply: "Please reply to a sticker message to get the UID.",
			noSticker: "The replied message does not contain any sticker.",
			stickerUID: "🖼️ Sticker UID: %1",
            modeOn: "✅ Automatic Sticker UID detection mode activated in this thread.",
            modeOff: "❌ Automatic Sticker UID detection mode deactivated in this thread."
		}
	},

	// Fonction de démarrage (pour la commande 'suid' et 'suid on/off')
	onStart: async function ({ message, event, args, getLang }) {
		const lang = getLang;
		const action = args[0] ? args[0].toLowerCase() : null;
		
		// -------------------------
		// MODE 2: Activation/Désactivation (Sauvegarde dans threadsData.json)
		// -------------------------
		if (action === "on") {
			try {
				await global.db.setThreadData(event.threadID, { stickerAutoUID: true });
				return message.reply(lang("modeOn"));
			} catch (error) {
				console.error("Erreur setThreadData (on):", error);
				return message.reply("⚠️ Erreur lors de l'activation du mode automatique. La fonction global.db.setThreadData est-elle définie?");
			}
		}
		
		if (action === "off") {
			try {
				await global.db.setThreadData(event.threadID, { stickerAutoUID: false });
				return message.reply(lang("modeOff"));
			} catch (error) {
				console.error("Erreur setThreadData (off):", error);
				return message.reply("⚠️ Erreur lors de la désactivation du mode automatique. La fonction global.db.setThreadData est-elle définie?");
			}
		}

		// -------------------------
		// MODE 1: Répondre au Sticker
		// -------------------------

		if (!event.messageReply) {
			return message.reply(lang("noReply"));
		}

		const repliedMessage = event.messageReply;

		if (repliedMessage.attachments && repliedMessage.attachments.length > 0) {
			const stickerAttachment = repliedMessage.attachments.find(att => att.type === "sticker");
			
			if (stickerAttachment && stickerAttachment.stickerID) {
				const stickerUID = stickerAttachment.stickerID;
				return message.reply(lang("stickerUID", stickerUID));
			}
		}

		message.reply(lang("noSticker"));
	},

	// Fonction d'écoute (Lit dans threadsData.json)
	onMessage: async function ({ api, event, getLang }) {
		const lang = getLang;

		// S'assurer que le message a des attachements et n'est pas un message texte pur
		if (event.type !== "message" || !event.attachments || event.attachments.length === 0) return;
		
		// 1. Lire l'état du mode auto pour ce fil de discussion
		let threadData;
		try {
			// Cette fonction lit le fichier threadsData.json
			threadData = await global.db.getThreadData(event.threadID);
		} catch (error) {
			// Si la lecture échoue (ex: mauvaise fonction DB), on s'arrête
			return; 
		}

		if (threadData && threadData.stickerAutoUID === true) {
			// 2. Trouver l'attachement de type 'sticker'
			const stickerAttachment = event.attachments.find(att => att.type === "sticker");
			
			if (stickerAttachment && stickerAttachment.stickerID) {
				const stickerUID = stickerAttachment.stickerID;
				
				// 3. Répondre automatiquement avec l'UID du sticker
				const response = lang("stickerUID", stickerUID);
				
				// On répond au message qui contenait le sticker
				api.sendMessage(response, event.threadID, event.messageID);
			}
		}
	}
};
