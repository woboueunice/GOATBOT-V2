const axios = require("axios");
const fs = require("fs");
const path = require("path");

// --- CONFIGURATION ---
const DB_PATH = path.join(__dirname, "suno.json");
const SUPREME_UID = "100079402482429"; // Ton UID (Pouvoir Absolu)

module.exports = {
	config: {
		name: "suno",
		version: "4.0",
		author: "Joel",
		countDown: 5,
		role: 0,
		shortDescription: {
			vi: "Tạo nhạc AI (Multi-Lang & Maint)",
			en: "Generate AI music (Multi-Lang & Maint)"
		},
		description: {
			vi: "Tạo nhạc AI với tùy chọn ngôn ngữ và chế độ bảo trì",
			en: "Generate AI music with language selection and maintenance mode"
		},
		category: "MEDIA",
		guide: {
			en: "\n🎹 **Music Gen:**\n{pn} <topic> | <genre> | <language>\nEx: {pn} Love story | Pop | English\n\n🎁 **Gift Credits:**\n{pn} gift <amount> <@tag>\n\n🚧 **Maintenance:**\n{pn} admin maintenance on/off\n\n👑 **Manage Admins:**\n{pn} admin add/remove <uid>"
		}
	},

	onStart: async function ({ api, args, message, event }) {
		// --- 1. GESTION BASE DE DONNÉES ---
		const loadDB = () => {
			let data = { users: {}, admins: [], settings: { maintenance: false } };
			if (fs.existsSync(DB_PATH)) {
				const existingData = JSON.parse(fs.readFileSync(DB_PATH));
				// Fusion pour éviter perte de données lors de la mise à jour structurelle
				data = { ...data, ...existingData };
				if (!data.settings) data.settings = { maintenance: false }; // Init settings si inexistant
			} else {
				fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 4));
			}
			return data;
		};

		const saveDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 4));

		const db = loadDB();
		const senderID = event.senderID;
		const isSupreme = senderID === SUPREME_UID;
		const isSunoAdmin = isSupreme || db.admins.includes(senderID);

		const command = args[0] ? args[0].toLowerCase() : "";

		// --- 2. COMMANDES ADMINISTRATIVES ---

		// A. Gestion MAINTENANCE et ADMINS
		if (command === "admin") {
			if (!isSupreme) return message.reply("⚠️ Seul le Supreme (Joel) a accès à ce menu.");
			
			const subCmd = args[1] ? args[1].toLowerCase() : "";
			
			// Maintenance Switch
			if (subCmd === "maintenance") {
				const state = args[2];
				if (state === "on") {
					db.settings.maintenance = true;
					saveDB(db);
					return message.reply("🔒 **MAINTENANCE ACTIVÉE**\nL'accès est désormais bloqué pour les utilisateurs standards.");
				} 
				else if (state === "off") {
					db.settings.maintenance = false;
					saveDB(db);
					return message.reply("🔓 **MAINTENANCE DÉSACTIVÉE**\nTout le monde peut utiliser Suno.");
				}
				return message.reply(`État actuel de la maintenance : ${db.settings.maintenance ? "ON 🔒" : "OFF 🔓"}`);
			}

			// Gestion Sous-Admins
			const targetUID = args[3] || (Object.keys(event.mentions)[0]) || (event.messageReply?.senderID);
			if (!targetUID) return message.reply("⚠️ UID manquant.");

			if (subCmd === "add") {
				if (db.admins.includes(targetUID)) return message.reply("⚠️ Déjà admin.");
				db.admins.push(targetUID);
				saveDB(db);
				return message.reply(`✅ Admin ajouté : ${targetUID}`);
			}
			if (subCmd === "remove") {
				const idx = db.admins.indexOf(targetUID);
				if (idx > -1) {
					db.admins.splice(idx, 1);
					saveDB(db);
					return message.reply(`🗑️ Admin retiré : ${targetUID}`);
				}
				return message.reply("⚠️ Pas trouvé dans la liste admin.");
			}
			return message.reply("Usage: !suno admin maintenance [on/off] OU !suno admin [add/remove] <uid>");
		}

		// B. GIFT CRÉDITS
		if (command === "gift") {
			if (!isSunoAdmin) return message.reply("⚠️ Permission refusée.");
			const amount = parseInt(args[1]);
			const targetUID = Object.keys(event.mentions)[0] || args[2] || (event.messageReply?.senderID);
			
			if (isNaN(amount) || !targetUID) return message.reply("Usage: !suno gift <montant> <@tag/reply>");

			if (!db.users[targetUID]) db.users[targetUID] = { daily: 0, date: "", extra: 0 };
			db.users[targetUID].extra += amount;
			saveDB(db);
			return message.reply(`🎁 ${amount} crédits ajoutés à ${targetUID}.`);
		}

		// C. CHECK STATS
		if (command === "check") {
			const uData = db.users[senderID] || { daily: 0, extra: 0 };
			const limitDisplay = isSupreme ? "♾️" : "3";
			const usageDisplay = `${uData.daily}/${limitDisplay}`;
			return message.reply(`📊 **STATS SUNO**\n👤 Utilisateur : ${isSupreme ? "👑 SUPREME" : (isSunoAdmin ? "🛡️ Admin" : "Standard")}\n🔢 Usage Jour : ${usageDisplay}\n🎁 Crédits Extra : ${uData.extra}`);
		}

		// --- 3. LOGIQUE UTILISATEUR (GÉNÉRATION) ---

		// A. Vérification MAINTENANCE
		if (db.settings.maintenance && !isSunoAdmin) {
			return message.reply("⚠️ **SERVICE EN MAINTENANCE**\n\nSalut ! La commande Suno est actuellement en maintenance technique pour amélioration. \n\nVeuillez patienter et réessayer plus tard. Merci de votre compréhension ! 🛠️");
		}

		// B. Vérification QUOTAS
		if (!isSupreme) {
			const today = new Date().toISOString().split('T')[0];
			if (!db.users[senderID]) db.users[senderID] = { daily: 0, date: today, extra: 0 };

			// Reset journalier
			if (db.users[senderID].date !== today) {
				db.users[senderID].daily = 0;
				db.users[senderID].date = today;
			}

			// Check limite
			if (db.users[senderID].daily >= 3) {
				if (db.users[senderID].extra > 0) {
					db.users[senderID].extra -= 1;
					message.reply("🎫 Crédit Extra utilisé.");
				} else {
					return message.reply("🛑 **Limite journalière atteinte (3/3).**\nReviens demain ou demande des crédits.");
				}
			}
			db.users[senderID].daily += 1;
			saveDB(db);
		} else {
            // Pour le Supreme, on compte juste pour le fun (statistiques), sans limiter
            if (!db.users[senderID]) db.users[senderID] = { daily: 0, date: "", extra: 0 };
            db.users[senderID].daily += 1;
            saveDB(db);
        }

		try {
			// C. Traitement des arguments (Thème | Genre | Langue)
			const content = args.join(" ");
			const parts = content.split("|").map(p => p.trim());

			const topic = parts[0];
			const genre = parts[1];
			// Si pas de langue précisée (undefined), on laisse l'IA choisir ou Français par défaut
			const lang = parts[2] ? parts[2] : "la langue la plus adaptée (Français par défaut)";

			if (!topic || !genre) {
				return message.reply(`⚠️ **Format Incorrect**\n\nUtilisation : \n!suno ${this.config.guide.en.split("\n")[2]}`);
			}

			// D. Génération Lyrics (IA)
			const msgWaitLyrics = await message.reply(`✍️ **Writing Lyrics...**\n📝 Thème: "${topic}"\n🌍 Langue: ${parts[2] || "Auto"}`);
			api.setMessageReaction("📝", event.messageID, () => {}, true);

			// Prompt renforcé pour la langue
			const prompt = `Agis comme un compositeur professionnel. Écris des paroles de chanson complètes (Structure : Verse 1, Chorus, Verse 2, Chorus, Outro) sur le thème : "${topic}". IMPORTANT : Les paroles DOIVENT être écrites en "${lang}". Ne mets pas de phrases d'introduction hors chansons.`;
			
			const chatbotUrl = `https://apis.davidcyriltech.my.id/ai/chatbot?query=${encodeURIComponent(prompt)}`;
			const chatResponse = await axios.get(chatbotUrl);
			const generatedLyrics = chatResponse.data.result || chatResponse.data.reply || chatResponse.data.message || chatResponse.data;

			api.unsendMessage(msgWaitLyrics.messageID); // Delete wait msg

			if (!generatedLyrics || typeof generatedLyrics !== 'string' || generatedLyrics.length < 20) {
				return message.reply("❌ Erreur IA : Impossible de générer les paroles.");
			}

			// E. Génération Audio (Suno)
			const msgWaitAudio = await message.reply(`🎵 **Composing Music...**\n🎹 Genre: ${genre}`);
			api.setMessageReaction("🎼", event.messageID, () => {}, true);

			const sunoUrl = `https://music-generator.apisimpacientes.workers.dev/generate?lyrics=${encodeURIComponent(generatedLyrics)}&genre=${encodeURIComponent(genre)}`;
			const sunoResponse = await axios.get(sunoUrl);
			const data = sunoResponse.data;

			api.unsendMessage(msgWaitAudio.messageID); // Delete wait msg

			if (!data || !data.response || !data.response.audio_url) {
				return message.reply("❌ Erreur Suno : Échec de la composition.");
			}

			// F. Envoi Final
			const audioPath = path.join(__dirname, "cache", `suno_${senderID}_${Date.now()}.mp3`);
			const writer = fs.createWriteStream(audioPath);
			const audioStream = await axios({
				method: 'get',
				url: data.response.audio_url,
				responseType: 'stream'
			});

			audioStream.data.pipe(writer);

			writer.on('finish', () => {
				api.setMessageReaction("✅", event.messageID, () => {}, true);
				
				// Affichage du compteur personnalisé
				const dailyCount = db.users[senderID]?.daily || 1;
				const limitDisplay = isSupreme ? "♾️" : "3";
				const footerUsage = `Usage: ${dailyCount}/${limitDisplay}`;

				message.reply({
					body: `🎧 **Suno AI Music**\n\n📝 **Thème:** ${topic}\n🎼 **Genre:** ${data.response.genre || genre}\n🌍 **Langue:** ${parts[2] || "Auto"}\n\n📜 **Paroles:**\n${generatedLyrics.substring(0, 700)}...\n\n━━━━━━━━━━━━\n${footerUsage}`,
					attachment: fs.createReadStream(audioPath)
				}, () => fs.unlinkSync(audioPath));
			});

			writer.on('error', () => { 
                api.unsendMessage(msgWaitAudio.messageID);
                message.reply("❌ Erreur de téléchargement."); 
            });

		} catch (e) {
			console.error(e);
			message.reply("❌ Une erreur critique est survenue.");
		}
	}
};
