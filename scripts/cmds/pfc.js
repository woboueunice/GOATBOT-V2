const { log } = global.utils;

const CHOICES = ["pierre", "feuille", "ciseaux"];

module.exports = {
	config: {
		name: "pfc",
		version: "1.0",
		author: "Joel",
		countDown: 3,
		role: 0, 
		description: {
			vi: "Chơi oẳn tù tì (Kéo Búa Bao) với bot hoặc người khác",
			en: "Play Rock-Paper-Scissors (RPS) with the bot or another user"
		},
		category: "games",
		guide: {
			vi: "   {pn} <pierre|feuille|ciseaux> [tag user]\n   Ví dụ: {pn} pierre @User",
			en: "   {pn} <rock|paper|scissors> [tag user]\n   Ex: {pn} pierre @User"
		}
	},

	langs: {
		en: {
			invalidChoice: "❌ Veuillez choisir entre: Pierre, Feuille, ou Ciseaux.",
			challengeSent: "⚔️ Vous avez défié %1 à une partie de PFC ! Il doit répondre à ce message avec '%2 <pierre|feuille|ciseaux>' pour accepter.",
			challengeReceived: "⚔️ %1 vous a défié à une partie de PFC ! Répondez à ce message avec '%2 <pierre|feuille|ciseaux>' pour accepter.",
			botWin: "🤖 Le Bot gagne ! Le Bot a choisi %1. %2 bat %3.",
			userWin: "🎉 Vous gagnez ! Le Bot a choisi %1. %2 bat %3.",
			draw: "🤝 Égalité ! Le Bot a aussi choisi %1.",
			challengeNoBot: "Vous ne pouvez pas défier le bot pour jouer contre lui-même.",
			challengeExpired: "Le défi PFC avec %1 a expiré.",
			notYourTurn: "❌ Ce n'est pas votre tour ou vous n'êtes pas le joueur ciblé.",
			noReplyChoice: "❌ Pour accepter le défi, vous devez inclure votre choix (pierre, feuille ou ciseaux) dans votre réponse.",
			resultUserWin: "🎉 %1 gagne ! %1 a choisi %2 et %3 a choisi %4. %2 bat %4.",
			resultOpponentWin: "🎉 %1 gagne ! %1 a choisi %2 et %3 a choisi %4. %4 bat %2.",
			resultDraw: "🤝 Égalité ! Les deux joueurs ont choisi %1.",
			noSelfChallenge: "Vous ne pouvez pas vous défier vous-même au PFC."
		}
	},

	onStart: async function ({ args, message, event, api, commandName, getLang, usersData }) { // <<< usersData est bien là
		const prefix = (global.GoatBot.config.prefix || global.GoatBot.config.prefixes[0] || "/");
		const userChoice = args[0] ? args[0].toLowerCase() : null;
		const targetID = event.mentions[0]?.id;
		const senderID = event.senderID;
        
		// CORRECTION DE L'ERREUR : Appel direct à usersData.getName
		const senderName = await usersData.getName(senderID); 

		if (!userChoice || !CHOICES.includes(userChoice)) {
			return message.reply(getLang("invalidChoice"));
		}

		// ----------------------------------------------------
		// 1. Jeu contre le Bot (Mode solo)
		// ----------------------------------------------------
		if (!targetID) {
			const botChoice = CHOICES[Math.floor(Math.random() * CHOICES.length)];
			
			let result, winningItem, losingItem;

			if (userChoice === botChoice) {
				return message.reply(getLang("draw", botChoice));
			}

			if (
				(userChoice === "pierre" && botChoice === "ciseaux") ||
				(userChoice === "feuille" && botChoice === "pierre") ||
				(userChoice === "ciseaux" && botChoice === "feuille")
			) {
				result = "userWin";
				winningItem = userChoice;
				losingItem = botChoice;
			} else {
				result = "botWin";
				winningItem = botChoice;
				losingItem = userChoice;
			}
			
			const langKey = (result === "userWin") ? "userWin" : "botWin";
			return message.reply(getLang(langKey, botChoice, winningItem, losingItem));
		}
		
		// ----------------------------------------------------
		// 2. Jeu contre un autre Utilisateur (Mode multijoueur)
		// ----------------------------------------------------
		
		if (targetID === senderID) {
			return message.reply(getLang("noSelfChallenge"));
		}

		// Assurez-vous que le bot n'est pas défié
		const botID = api.getCurrentUserID();
		if (targetID === botID) {
			return message.reply(getLang("challengeNoBot"));
		}

		// CORRECTION DE L'ERREUR : Appel direct à usersData.getName
		const targetName = await usersData.getName(targetID);
		const challengeMessage = getLang("challengeSent", targetName, commandName);
		
		const formMessage = {
			body: challengeMessage,
			mentions: [{ tag: targetName, id: targetID }]
		};

		api.sendMessage(formMessage, event.threadID, (err, info) => {
			if (err) return log.err(err);

			global.GoatBot.onReply.set(info.messageID, {
				commandName,
				messageID: info.messageID,
				senderID: senderID, 
				targetID: targetID, 
				player1Choice: userChoice, 
				type: "pfcChallenge",
				time: Date.now() + (5 * 60 * 1000) 
			});
			
		}, event.messageID); 
	},

	onReply: async ({ args, event, message, Reply, commandName, getLang, usersData }) => { // <<< usersData est bien là
		const { type, senderID, targetID, player1Choice, time } = Reply;

		if (type !== "pfcChallenge") return;

		// Vérification de l'expiration du défi (5 minutes)
		if (Date.now() > time) {
			// CORRECTION DE L'ERREUR : Appel direct à usersData.getName
			const challengerName = await usersData.getName(senderID);
			const targetName = await usersData.getName(targetID);
			
			global.GoatBot.onReply.delete(event.messageReply.messageID); 
			return message.reply(getLang("challengeExpired", targetName));
		}

		// Vérification si c'est bien le joueur défié qui répond
		if (event.senderID !== targetID) {
			return message.reply(getLang("notYourTurn"));
		}

		const player2Choice = args[0] ? args[0].toLowerCase() : null;

		if (!player2Choice || !CHOICES.includes(player2Choice)) {
			return message.reply(getLang("invalidChoice"));
		}

		// Nettoie l'entrée onReply car le jeu est terminé
		global.GoatBot.onReply.delete(event.messageReply.messageID);

		// Détermination du résultat
		let result;
		// CORRECTION DE L'ERREUR : Appel direct à usersData.getName
		let player1Name = await usersData.getName(senderID);
		let player2Name = await usersData.getName(targetID);

		if (player1Choice === player2Choice) {
			result = "draw";
		} else if (
			(player1Choice === "pierre" && player2Choice === "ciseaux") ||
			(player1Choice === "feuille" && player2Choice === "pierre") ||
			(player1Choice === "ciseaux" && player2Choice === "feuille")
		) {
			result = "player1Win";
		} else {
			result = "player2Win";
		}

		// Construction du message de résultat
		let resultMessage;
		if (result === "draw") {
			resultMessage = getLang("resultDraw", player1Choice);
		} else if (result === "player1Win") {
			resultMessage = getLang("resultUserWin", player1Name, player1Choice, player2Name, player2Choice);
		} else { // player2Win
			resultMessage = getLang("resultOpponentWin", player2Name, player2Choice, player1Name, player1Choice);
		}
		
		// Envoi du résultat final
		return message.reply(resultMessage);
	}
};
