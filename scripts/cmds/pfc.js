const { getStreamsFromAttachment, log } = global.utils;
const CHOICES = ["pierre", "feuille", "ciseaux"];

// --- ⚠️ CONFIGURATION DES TIDs SECRETS ⚠️ ---
// Assurez-vous que le bot est membre de ces discussions (threads)
const TID_PLAYER1_SECRET = "1504157924123016"; // TID du groupe secret pour le Joueur 1 (pour son choix secret)
const TID_PLAYER2_SECRET = "1570824117702200"; // TID du groupe secret pour le Joueur 2 (pour son choix secret)
// ------------------------------------------

module.exports = {
	config: {
		name: "pfc",
		version: "3.2", // Version finale compilée
		author: "Joel",
		countDown: 5,
		role: 0, 
		description: {
			vi: "Chơi oẳn tù tì (Kéo Búa Bao) avec de l'argent ou lancer un tournoi secret.",
			en: "Play Rock-Paper-Scissors (RPS) with a bet or launch a secret P2P tournament."
		},
		category: "games",
		guide: {
			vi: "   {pn} (pour lancer le menu interactif)\n   {pn} <pierre|feuille|ciseaux> <mise> (contre bot)",
			en: "   {pn} (to start interactive menu)\n   {pn} <rock|paper|scissors> <bet> (vs bot)"
		}
	},

	langs: {
		en: {
			// --- Messages de Sélection de Mode ---
			modeSelect: "🤖 Souhaitez-vous jouer :\n\n1. Contre le Bot (Mise rapide)\n2. Contre un Adversaire (Tournoi secret P2P)\n\nRépondez à ce message par **1** ou **2**.",
            invalidMode: "❌ Réponse invalide. Veuillez répondre par **1** ou **2**.",
            // --- Messages Mode Guidé P2P ---
            opponentPrompt: "👤 **Mode Tournoi P2P sélectionné.**\n\nPour commencer le défi, veuillez **mentionner votre adversaire** ou fournir son **UID** (son identifiant).\n\nRépondez à ce message avec la mention ou l'UID de votre adversaire.",
            betPrompt: "💰 Veuillez indiquer le montant de la mise que vous souhaitez proposer à %1. (La mise doit être égale pour les deux joueurs).",
            invalidOpponent: "❌ Je n'ai pas pu identifier votre adversaire. Veuillez mentionner ou donner un UID valide.",
            // --- Messages Standard Bot/Mise ---
			invalidChoice: "❌ Veuillez choisir entre: Pierre, Feuille, ou Ciseaux.",
			invalidBet: "💰 Veuillez spécifier une mise valide (nombre entier positif) pour jouer.\nExemple: **{pn} pierre 500**",
            notEnoughMoney: "❌ Vous n'avez pas assez d'argent pour miser %1$. Votre solde actuel est de %2$.",
			botWin: "🤖 Le Bot gagne ! Le Bot a choisi %1. %2 bat %3. Vous perdez **%4$**.",
			userWin: "🎉 Vous gagnez ! Le Bot a choisi %1. %2 bat %3. Vous gagnez **%4$** !",
			draw: "🤝 Égalité ! Le Bot a aussi choisi %1. Votre mise de **%2$** vous est retournée.",
            // --- Messages Tournoi Secret ---
            opponentNotEnoughMoney: "❌ L'adversaire %1 n'a pas assez d'argent pour couvrir la mise de %2$.",
            challengeSentSecret: "⚔️ **DÉFI PFC (SECRET) INITIÉ**\n\nVous avez été défié par **%1** pour un pot de **%2$** chacun !\n\n➡️ **%3**, vous devez confirmer votre participation en répondant à ce message par le mot-clé : **player1**",
            challengeConfirm1: "✅ **CONFIRMATION RÉUSSIE !**\n\n%1 a confirmé sa participation. Vous êtes maintenant dans la zone de choix secrète.\n\n➡️ Tapez **.player1** pour accéder à votre groupe de jeu secret.\n\n❌ Le défi expirera si le choix n'est pas fait dans 5 minutes.",
            challengeWait: "⏳ **Mise en place du tournoi...**\n\n%1 a fait son choix secret. C'est au tour de %2 de jouer.\n\n➡️ %2, Tapez **.player2** pour accéder à votre zone de jeu secrète.",
            
            // --- Messages de Fin de Tournoi ---
            resultDraw: "🤝 **TOURNOI TERMINÉ - ÉGALITÉ**\n\nLes deux joueurs ont choisi **%1**. La mise de **%2$** est retournée aux deux joueurs.",
            resultUserWin: "👑 **VICTOIRE DU TOURNOI !** 👑\n\n%1 (Choix : %2) bat %3 (Choix : %4).\n\n💰 Gain : **%5$** (Mise + Mise adversaire + Bonus).",
            resultOpponentWin: "💥 **DÉFAITE DU TOURNOI** 💥\n\n%1 (Choix : %2) bat %3 (Choix : %4).\n\n consolation : **%5$** (5%% de la mise).",
			noSelfChallenge: "Vous ne pouvez pas vous défier vous-même au PFC.",
            casinoRule: "🚨 Règle Spéciale Casino : Si vous gagnez, vous avez **20%%** de chance de doubler votre gain !",
            
		}
	},

	onStart: async function ({ args, message, event, api, commandName, getLang, usersData, threadsData }) {
		const prefix = (global.GoatBot.config.prefix || global.GoatBot.config.prefixes[0] || "/");
        const senderID = event.senderID;

        // --- Démarrage direct Contre Bot (Ex: !pfc pierre 100) ---
        if (CHOICES.includes(args[0]?.toLowerCase())) {
            return startBotGame({ args, message, event, api, commandName, getLang, usersData, prefix });
        }
        
        // --- Lancement du Menu Interactif ---
        global.GoatBot.onReply.set(event.messageID, {
            commandName,
            messageID: event.messageID,
            senderID,
            type: "pfcModeSelect"
        });
        return message.reply(getLang("modeSelect"));
	},

	onReply: async ({ args, event, message, Reply, commandName, getLang, usersData, api, threadsData }) => {
		const { type, messageID, senderID: replySenderID } = Reply;
        const currentSenderID = event.senderID;
        const prefix = (global.GoatBot.config.prefix || global.GoatBot.config.prefixes[0] || "/");

        // --- VÉRIFICATION DE L'AUTEUR DE LA RÉPONSE ---
        if (type !== "pfcSecretChoice1" && type !== "pfcSecretChoice2" && currentSenderID !== replySenderID) {
             // Seules les étapes secrètes peuvent être répondues par le joueur 2
             return; 
        }

        // --- PHASE 2: RÉPONSE À LA SÉLECTION DE MODE ---
        if (type === "pfcModeSelect") {
            const mode = args[0];
            
            if (mode === "1") {
                global.GoatBot.onReply.delete(messageID);
                return message.reply(`🤖 Vous avez choisi de jouer contre le Bot.\n\n➡️ Veuillez taper la commande avec votre choix et la mise.\nEx: **${prefix}${commandName} pierre 100**`);
            } else if (mode === "2") {
                // Passage à l'étape suivante : Capture de l'adversaire
                const newReply = {
                    ...Reply,
                    type: "pfcSelectOpponent"
                };
                global.GoatBot.onReply.set(messageID, newReply);
                return message.reply(getLang("opponentPrompt"));
            } else {
                return message.reply(getLang("invalidMode"));
            }
        }
        
        // --- PHASE 3 : CAPTURE DE L'ADVERSAIRE (GUIDÉ) ---
        if (type === "pfcSelectOpponent") {
            let targetID = event.mentions[0]?.id || args[0];
            
            if (!targetID || targetID === currentSenderID) {
                return message.reply(getLang("invalidOpponent"));
            }

            // Vérifie si l'ID est valide (un utilisateur connu)
            try {
                const targetName = await usersData.getName(targetID);
                if (!targetName) throw new Error("ID non trouvé");
            } catch (e) {
                 return message.reply(getLang("invalidOpponent"));
            }
            
            // Passage à l'étape suivante : Saisie de la mise
            const newReply = {
                ...Reply,
                targetID: targetID,
                type: "pfcSetBet"
            };
            global.GoatBot.onReply.set(messageID, newReply);
            
            return message.reply(getLang("betPrompt", await usersData.getName(targetID)));
        }

        // --- PHASE 4 : SAISIE DE LA MISE (GUIDÉ) ---
        if (type === "pfcSetBet") {
            const betAmount = parseInt(args[0]);
            
            if (isNaN(betAmount) || betAmount <= 0) {
                return message.reply(getLang("invalidBet", { pn: prefix + commandName }));
            }
            
            // Prépare pour lancer le défi secret 
            global.GoatBot.onReply.delete(messageID);
            
            // Lance la logique de défi P2P secret avec toutes les informations
            return startP2PChallenge({ 
                message, 
                event, 
                api, 
                commandName, 
                getLang, 
                usersData, 
                betAmount, 
                targetID: Reply.targetID, 
                prefix, 
                threadsData 
            });
        }
        
        // --- PHASE 5 : CONFIRMATION DU DÉFI P2P (Mot-clé 'player1') ---
        if (type === "pfcChallengeConfirm") {
            const keyword = args[0]?.toLowerCase();
            const senderName = await usersData.getName(currentSenderID);
            const originalThreadID = Reply.originalThreadID;
            
            if (keyword !== "player1") {
                return message.reply(`❌ Mot-clé de confirmation incorrect. Veuillez répondre uniquement par : **player1**`);
            }
            
            // Vérifier que c'est bien le J1 (challenger) qui répond
            if (currentSenderID !== Reply.player1ID) {
                 return message.reply(`❌ Seul **${await usersData.getName(Reply.player1ID)}** peut confirmer le défi.`);
            }
            
            // Met à jour la Reply pour le choix J1
            const newReply = {
                ...Reply,
                type: "pfcSecretChoice1", // Prochaine étape : Choix secret J1
                time: Date.now() + (5 * 60 * 1000), // 5 minutes pour faire le choix
                player1TID: TID_PLAYER1_SECRET,
                player2TID: TID_PLAYER2_SECRET
            };
            
            // 1. Notifier le J1 de l'accès à son groupe secret
            const confirmMsg = getLang("challengeConfirm1", senderName);
            message.reply(confirmMsg);
            
            // 2. Envoyer le message d'instruction au groupe secret du J1 (Utilise un nouveau message ID)
            const instructionMsgJ1 = "🔒 **ZONE DE CHOIX SECRÈTE**\n\nVous jouez contre " 
                + (await usersData.getName(Reply.player2ID)) 
                + ".\n\nMise : " + Reply.betAmount.toLocaleString() + "$\n\n➡️ Faites votre choix maintenant en répondant à ce message avec :\n**pfc pierre**\n**pfc feuille**\n**pfc ciseaux**";
            
            const messageSend = await api.sendMessage(instructionMsgJ1, TID_PLAYER1_SECRET);
            
            // 3. Mettre à jour la Reply pour le choix J1 (basé sur le message secret)
            newReply.messageID = messageSend.messageID;
            global.GoatBot.onReply.set(messageSend.messageID, newReply);
            global.GoatBot.onReply.delete(messageID); // Supprime l'ancienne reply du groupe original

            return;
        }

        // --- PHASE 6 & 7 (Choix Secrets J1 & J2) ---
        if (type === "pfcSecretChoice1" || type === "pfcSecretChoice2") {
             return handleSecretChoice({ args, event, message, Reply, commandName, getLang, usersData, api, threadsData });
        }
	}
};


// ----------------------------------------------------------------------------------
// --- FONCTIONS EXTERNES ---
// ----------------------------------------------------------------------------------

/**
 * Lance le jeu PFC en mode Tournoi Secret P2P.
 */
async function startP2PChallenge({ message, event, api, commandName, getLang, usersData, betAmount, targetID, threadsData }) {
    const senderID = event.senderID;
    
    if (targetID === senderID) {
        return message.reply(getLang("noSelfChallenge"));
    }
    
    const senderName = await usersData.getName(senderID);
    const senderMoney = await usersData.getMoney(senderID);
    const targetName = await usersData.getName(targetID);
    const targetMoney = await usersData.getMoney(targetID);
    
    // Vérifications
    if (senderMoney < betAmount) {
        return message.reply(getLang("notEnoughMoney", betAmount.toLocaleString(), senderMoney.toLocaleString()));
    }
    if (targetMoney < betAmount) {
        return message.reply(getLang("opponentNotEnoughMoney", targetName, betAmount.toLocaleString()));
    }
    
    // 🚨 PRÉLÈVEMENT DES MISES
    try {
        await usersData.subtractMoney(senderID, betAmount); 
        await usersData.subtractMoney(targetID, betAmount);
    } catch (e) {
        return message.reply("Une erreur critique est survenue lors du prélèvement des mises. Annulation du défi.");
    }
    
    // Défi : Le J1 doit répondre par 'player1'
    const challengeMessage = getLang("challengeSentSecret", targetName, betAmount.toLocaleString(), senderName);
    
    const formMessage = {
        body: challengeMessage,
        mentions: [{ tag: senderName, id: senderID }]
    };

    api.sendMessage(formMessage, event.threadID, (err, info) => {
        if (err) return log.err(err);

        global.GoatBot.onReply.set(info.messageID, {
            commandName,
            messageID: info.messageID,
            player1ID: senderID, 
            player2ID: targetID, 
            betAmount: betAmount, 
            type: "pfcChallengeConfirm", // Prochaine étape : Confirmation du défi
            time: Date.now() + (5 * 60 * 1000), 
            originalThreadID: event.threadID
        });
        
    }, event.messageID); 
}

/**
 * Lance le jeu PFC en mode Bot.
 */
async function startBotGame({ args, message, event, api, commandName, getLang, usersData, prefix }) {
    const userChoice = args[0] ? args[0].toLowerCase() : null;
    const betAmount = parseInt(args[1]);
    const senderID = event.senderID;
    
    const senderMoney = await usersData.getMoney(senderID);

    if (isNaN(betAmount) || betAmount <= 0) {
        return message.reply(getLang("invalidBet", { pn: prefix + commandName }));
    }
    if (senderMoney < betAmount) {
        return message.reply(getLang("notEnoughMoney", betAmount.toLocaleString(), senderMoney.toLocaleString()));
    }

    if (!userChoice || !CHOICES.includes(userChoice)) {
        return message.reply(getLang("invalidChoice"));
    }
    
    // Retirer la mise avant de jouer
    await usersData.subtractMoney(senderID, betAmount);
    
    const botChoice = CHOICES[Math.floor(Math.random() * CHOICES.length)];
    
    let result, winningItem, losingItem;

    if (userChoice === botChoice) {
        // Retourner la mise en cas d'égalité
        await usersData.addMoney(senderID, betAmount);
        return message.reply(getLang("draw", botChoice, betAmount.toLocaleString()));
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
    
    let finalMessage = "";
    
    // Gestion des Gains/Pertes
    if (result === "userWin") {
        const winAmount = betAmount * 2; // Récupère la mise + double le montant
        let finalWinAmount = winAmount;

        // 🚨 Défi Casino : 20% de chance de doubler le gain
        if (Math.random() < 0.20) { 
            finalWinAmount = betAmount * 4; // Quadruple la mise
            finalMessage += getLang("casinoRule") + "\n";
        }
        
        await usersData.addMoney(senderID, finalWinAmount);
        finalMessage += getLang("userWin", botChoice, winningItem, losingItem, finalWinAmount.toLocaleString());

    } else { // botWin
        // L'argent est déjà soustrait (perdu)
        finalMessage = getLang("botWin", botChoice, winningItem, losingItem, betAmount.toLocaleString());
    }

    return message.reply(finalMessage);
}

/**
 * Gère les étapes de choix secret J1 et J2 (dans les threads secrets).
 */
async function handleSecretChoice({ args, event, message, Reply, commandName, getLang, usersData, api, threadsData }) {
    const { type, player1ID, player2ID, betAmount, player1Choice, originalThreadID, originalMessageID } = Reply;
    const currentSenderID = event.senderID;
    
    const player1Name = await usersData.getName(player1ID);
    const player2Name = await usersData.getName(player2ID);
    
    // --- PHASE 6: CHOIX SECRET J1 (dans le groupe secret J1) ---
    if (type === "pfcSecretChoice1" && currentSenderID === player1ID) {
        const player1Choice_ = args[0]?.toLowerCase();
        
        if (!player1Choice_ || !CHOICES.includes(player1Choice_)) {
            return message.reply(getLang("invalidChoice"));
        }
        
        // Met à jour la Reply avec le choix J1
        const newReply = {
            ...Reply,
            player1Choice: player1Choice_,
            type: "pfcSecretChoice2" // Prochaine étape : Choix secret J2
        };
        
        // 1. Retourner au groupe original pour notifier J2
        const messageOriginal = getLang("challengeWait", player1Name, player2Name);
        const msgToOriginal = await api.sendMessage(messageOriginal, originalThreadID);

        // 2. Envoyer le message d'instruction au groupe secret du J2
        const instructionMsgJ2 = "🔒 **ZONE DE CHOIX SECRÈTE**\n\nC'est votre tour. Vous jouez contre " 
            + player1Name 
            + ".\n\nMise : " + betAmount.toLocaleString() + "$\n\n➡️ Faites votre choix maintenant en répondant à ce message avec :\n**pfc pierre**\n**pfc feuille**\n**pfc ciseaux**";
        
        const messageSendJ2 = await api.sendMessage(instructionMsgJ2, TID_PLAYER2_SECRET);
        
        // 3. Mettre à jour la Reply pour le choix J2 (basé sur le message secret J2)
        newReply.messageID = messageSendJ2.messageID;
        newReply.originalMessageID = msgToOriginal.messageID; // Pour la suppression/update
        
        global.GoatBot.onReply.set(messageSendJ2.messageID, newReply);
        global.GoatBot.onReply.delete(Reply.messageID); // Supprime l'ancienne reply du groupe J1

        return;
    }

    // --- PHASE 7: CHOIX SECRET J2 (dans le groupe secret J2) et FIN ---
    if (type === "pfcSecretChoice2" && currentSenderID === player2ID) {
        const player2Choice = args[0]?.toLowerCase();
        
        if (!player2Choice || !CHOICES.includes(player2Choice)) {
            return message.reply(getLang("invalidChoice"));
        }

        // Nettoie l'entrée onReply car le jeu est terminé
        global.GoatBot.onReply.delete(Reply.messageID);
        
        // Détermination du résultat
        let result;
        if (player1Choice === player2Choice) {
            result = "draw";
        } else if (
            (player1Choice === "pierre" && player2Choice === "ciseaux") ||
            (player1Choice === "feuille" && player2Choice === "pierre") ||
            (player1Choice === "ciseaux" && player2Choice === "feuille")
        ) {
            result = "player1Win";
        } else { // player2Win
            result = "player2Win";
        }
        
        // --- LOGIQUE DE TRANSACTION AVEC BONUS ---
        const totalBet = betAmount * 2; // Mise totale (J1 + J2)
        const bonus = Math.round(betAmount * 0.50); // 50% de bonus sur la mise initiale
        const consolation = Math.round(betAmount * 0.05); // 5% de consolation sur la mise initiale

        let finalMessage;

        if (result === "player1Win") {
            const winAmount = totalBet + bonus; // Gain total
            await usersData.addMoney(player1ID, winAmount);
            await usersData.addMoney(player2ID, consolation); // Consolation pour le perdant
            
            finalMessage = getLang("resultUserWin", player1Name, player1Choice, player2Name, player2Choice, winAmount.toLocaleString());
        } else if (result === "player2Win") {
            const winAmount = totalBet + bonus; // Gain total
            await usersData.addMoney(player2ID, winAmount);
            await usersData.addMoney(player1ID, consolation); // Consolation pour le perdant

            
            finalMessage = getLang("resultOpponentWin", player2Name, player2Choice, player1Name, player1Choice, winAmount.toLocaleString());
        } else { // draw
            // Remboursement de la mise car elles ont été prélevées au début
            await usersData.addMoney(player1ID, betAmount); 
            await usersData.addMoney(player2ID, betAmount); 
            finalMessage = getLang("resultDraw", player1Choice, betAmount.toLocaleString());
        }
        
        // Envoi du résultat final au groupe original
        return api.sendMessage(finalMessage, originalThreadID);
    }
    
    // Si c'est une réponse dans le groupe secret qui n'est pas le choix attendu (ou pas le joueur)
    if (type === "pfcSecretChoice1" && currentSenderID === player1ID) {
        return message.reply(`❌ Veuillez répondre uniquement par votre choix de PFC (**pierre, feuille, ciseaux**) au message d'instruction.`);
    }
    if (type === "pfcSecretChoice2" && currentSenderID === player2ID) {
        return message.reply(`❌ Veuillez répondre uniquement par votre choix de PFC (**pierre, feuille, ciseaux**) au message d'instruction.`);
    }
}
