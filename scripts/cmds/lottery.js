const fs = require('fs');
const path = require('path');

// --- Configuration ---
const LOTTERY_DATA_FILE = 'scripts/cmds/lotteryData.json';
const DRAW_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 heures
const WIN_FEE_PERCENTAGE = 0.05; // 5% de frais de gestion sur le gain
const CASHBACK_PERCENTAGE = 0.25; // 25% de cashback pour les perdants

const ADMIN_UID = "100079402482429"; // UID de l'administrateur

// Fonctions utilitaires
function formatNumber(number) {
    // Supprime la mise en gras pour les montants, mais garde le formatage
    return Math.floor(number).toLocaleString('fr-FR');
}

function loadLotteryData() {
    if (!fs.existsSync(LOTTERY_DATA_FILE)) {
        const initialData = {
            ticketPrice: 1000,
            basePot: 5000,
            pot: 5000, // Initialisé avec le pot de base
            tickets: {}, // { userID: number_of_tickets }
            // ⭐ CORRECTION 1 : lastDrawTime est initialisé à Date.now() pour que le compte à rebours démarre
            // dès le premier ticket acheté dans l'état initial.
            lastDrawTime: Date.now(),
            drawHistory: []
        };
        fs.writeFileSync(LOTTERY_DATA_FILE, JSON.stringify(initialData, null, 2), 'utf8');
        return initialData;
    }
    return JSON.parse(fs.readFileSync(LOTTERY_DATA_FILE, 'utf8'));
}

function saveLotteryData(data) {
    fs.writeFileSync(LOTTERY_DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// --- LOGIQUE DU TIRAGE AU SORT (Intègre le Cashback) ---
async function performDraw(api, usersData, data) {
    const { pot, tickets, basePot } = data;
    const ticketEntries = Object.entries(tickets);
    
    if (pot <= basePot) {
        data.lastDrawTime = Date.now();
        saveLotteryData(data);
        return { isDrawn: false, message: "⚠️ Le tirage a été reporté car aucun ticket n'a été vendu." };
    }

    const drawPool = [];
    for (const [userID, count] of ticketEntries) {
        for (let i = 0; i < count; i++) {
            drawPool.push(userID);
        }
    }

    const winnerID = drawPool[Math.floor(Math.random() * drawPool.length)];
    const winnerName = await usersData.getName(winnerID);

    // Calcul du gain
    const fee = Math.floor(pot * WIN_FEE_PERCENTAGE);
    const netWin = pot - fee;

    // --- 1. DISTRIBUTION DU GAIN ---
    await usersData.set(winnerID, { money: (await usersData.get(winnerID, "money")) + netWin });

    // --- 2. DISTRIBUTION DU CASHBACK (aux perdants) ---
    const cashbackMsg = [];
    const participants = new Set(Object.keys(tickets));

    for (const userID of participants) {
        if (userID !== winnerID) {
            const userTicketCount = tickets[userID];
            const moneySpent = userTicketCount * data.ticketPrice;
            const cashbackAmount = Math.floor(moneySpent * CASHBACK_PERCENTAGE);
            
            if (cashbackAmount > 0) {
                await usersData.set(userID, { money: (await usersData.get(userID, "money")) + cashbackAmount });
                const userName = await usersData.getName(userID);
                cashbackMsg.push(`  + ${userName} (${userID}) : ${formatNumber(cashbackAmount)}¥`);
            }
        }
    }

    // Enregistrement de l'historique
    const historyEntry = {
        time: Date.now(),
        winner: winnerID,
        name: winnerName,
        pot: pot,
        netWin: netWin,
        ticketsSold: drawPool.length
    };
    data.drawHistory.unshift(historyEntry);
    if (data.drawHistory.length > 5) data.drawHistory.pop(); 

    // Réinitialisation pour le prochain tirage
    data.pot = data.basePot; 
    data.tickets = {};
    data.lastDrawTime = Date.now();
    saveLotteryData(data);

    // Message de résultat - NOUVEAU DESIGN
    const drawMessage = 
        `🎉 RÉSULTAT DU TIRAGE DE LA LOTERIE 🎉` +
        `\n-------------------------------------------------` +
        `\n💶 MONTANT TOTAL À GAGNER : ${formatNumber(pot)}¥` +
        `\n-------------------------------------------------` +
        `\n🎫 TICKETS VENDUS : ${drawPool.length}` +
        `\n-------------------------------------------------` +
        `\n👑 LE GRAND GAGNANT EST : ${winnerName} (UID: ${winnerID})` +
        `\n  💸 Gain NET : ${formatNumber(netWin)}¥` +
        `\n\n💰 CASHBACK DE 25% DISTRIBUÉ AUX PERDANTS :` +
        (cashbackMsg.length > 0 ? "\n" + cashbackMsg.join('\n') : "\n  - Aucun perdant n'avait de mise éligible au cashback.") +
        `\n\nFélicitations ! Le prochain tirage commence avec une Somme de Départ Garanti de ${formatNumber(data.basePot)}¥ !`;
        
    return { isDrawn: true, message: drawMessage };
}


module.exports = {
  config: {
    name: "lottery",
    aliases: ["loto", "draw"],
    version: "4.1", // Mise à jour de la version
    description: "Achète des tickets de loterie et participe au tirage quotidien pour gagner le pot.",
    guide: "{pn} buy <nombre> | {pn} info | {pn} list | {pn} history",
    category: "💰 Economy",
    countDown: 5,
    author: "Joel | Modifié: Gemini",
    longDescription:
      "=== 📜 GUIDE DÉTAILLÉ DE LA LOTERIE 📜 ===\n\n" +
      "La loterie est un tirage au sort quotidien. Le pot est composé d'une Somme de Départ Garanti (fixée par l'Admin) et des contributions de tous les tickets achetés.\n" +
      "Plus vous achetez de tickets, plus le pot augmente et plus vos chances de gagner sont grandes !\n" +
      "-------------------------------------------\n\n" +
      
      "1. COMMENT JOUER\n" +
      "   • Acheter un ticket : `{pn} buy <nombre>`\n" +
      "     > Le prix d'un ticket est affiché via la commande `info`.\n" +
      "   • Vérifier le pot : `{pn} info`\n" +
      "     > Montre la Somme de Départ, l'Ajout des Tickets, le Total du Pot et le temps restant avant le tirage.\n\n" +
      
      "2. LE TIRAGE ET LE CASHBACK\n" +
      "   • Le tirage a lieu automatiquement toutes les **24 heures** si des tickets ont été vendus.\n" +
      "   • **Le Gagnant** remporte le pot total moins 5% de frais de gestion.\n" +
      "   • **Les Perdants** reçoivent un **cashback de 25%** du montant qu'ils ont dépensé pour leurs tickets, remboursé automatiquement après le tirage. Cela réduit le risque de participation.\n\n" +
      
      "3. COMMANDES UTILES\n" +
      "   • Voir les participants : `{pn} list` (Affiche tous les joueurs et leurs tickets).\n" +
      "   • Historique des gains : `{pn} history` (Montre les 5 derniers tirages et les montants remportés).\n\n" +
      
      "4. COMMANDES ADMINISTRATEUR (UID: 100079402482429)\n" +
      "   Ces commandes sont réservées à l'administrateur pour la gestion du jeu :\n" +
      "   • Changer le prix du ticket : `{pn} admin setprice <montant}`\n" +
      "   • Changer la Somme de Départ Garanti : `{pn} admin setbasepot <montant}`\n" +
      "   • Forcer le tirage : `{pn} admin draw` (Nécessite des tickets vendus.)\n" +
      "   • Ajouter des fonds au pot : `{pn} admin add <montant}`\n" +
      "   • Annuler et rembourser : `{pn} admin reset`"
  },

  onStart: async function ({ args, message, event, api, usersData }) {
    const user = event.senderID;
    const userData = await usersData.get(user);
    let data = loadLotteryData();
    const now = Date.now();
    
    // --- Vérification du Tirage Automatique ---
    // Note : La correction 1 dans loadLotteryData assure que lastDrawTime n'est pas 0 pour le premier cycle.
    if (now - data.lastDrawTime >= DRAW_INTERVAL_MS && Object.keys(data.tickets).length > 0) {
        // La condition data.lastDrawTime !== 0 est implicite si vous utilisez la correction 1 pour l'état initial
        // et qu'elle est mise à jour après chaque tirage.
        const drawResult = await performDraw(api, usersData, data);
        // Recharge les données après un tirage
        data = loadLotteryData();

        if (drawResult.isDrawn) {
            await api.sendMessage(drawResult.message, event.threadID);
        }
    }
    
    const command = args[0]?.toLowerCase();

    // --- COMMANDE ADMIN ---
    if (command === "admin") {
        if (user !== ADMIN_UID) {
            return message.reply("⛔️ | Seul l'administrateur peut utiliser cette fonction.");
        }
        
        const adminCmd = args[1]?.toLowerCase();
        const value = parseInt(args[2]);

        // .loto admin setprice <montant>
        if (adminCmd === "setprice") {
            if (!value || value <= 0) return message.reply("❌ | Le prix du ticket doit être un nombre positif.");
            data.ticketPrice = value;
            saveLotteryData(data);
            return message.reply(
                `✅ MODIFICATION RÉUSSIE` +
                `\n-------------------------------------------------` +
                `\n💰 Nouveau prix du ticket : ${formatNumber(value)}¥` +
                `\n-------------------------------------------------`
            );
        }
        
        // .loto admin setbasepot <montant>
        if (adminCmd === "setbasepot") {
            if (!value || value < 0) return message.reply("❌ | Le montant de la Somme de Départ Garanti doit être un nombre positif ou nul.");
            data.basePot = value;
            
            if (Object.keys(data.tickets).length === 0) {
                 data.pot = value;
            } else {
                 const oldBasePot = loadLotteryData().basePot;
                 data.pot = (data.pot - oldBasePot) + value;
            }
            saveLotteryData(data);
            return message.reply(
                `✅ MODIFICATION RÉUSSIE` +
                `\n-------------------------------------------------` +
                `\n💶 Somme de Départ Garanti fixée à : ${formatNumber(value)}¥` +
                `\n-------------------------------------------------`
            );
        }

        // .loto admin add <montant>
        if (adminCmd === "add") {
            if (!value || value <= 0) return message.reply("❌ | Spécifiez un montant positif à ajouter au pot.");
            data.pot += value;
            saveLotteryData(data);
            return message.reply(
                `✅ AJOUT DE FONDS RÉUSSI` +
                `\n-------------------------------------------------` +
                `\n💰 Montant ajouté : ${formatNumber(value)}¥` +
                `\n🤑 Nouveau Total du Pot : ${formatNumber(data.pot)}¥` +
                `\n-------------------------------------------------`
            );
        }
        
        // .loto admin draw
        if (adminCmd === "draw") {
            if (data.pot <= data.basePot) {
                return message.reply("❌ | Pas assez de tickets achetés pour justifier un tirage. Le pot est toujours à la Somme de Départ Garanti.");
            }
            const drawResult = await performDraw(api, usersData, data);
            data = loadLotteryData();
            // Le message de drawResult a déjà le nouveau design
            return api.sendMessage(`👑 TIRAGE FORCÉ PAR L'ADMIN (${await usersData.getName(user)}) :\n\n${drawResult.message}`, event.threadID);
        }

        // .loto admin reset
        if (adminCmd === "reset") {
             const totalRefund = Object.values(data.tickets).reduce((sum, count) => sum + count, 0) * data.ticketPrice;
            
            for (const [userID, count] of Object.entries(data.tickets)) {
                const refundAmount = count * data.ticketPrice;
                await usersData.set(userID, { money: (await usersData.get(userID, "money")) + refundAmount });
            }
            
            data.pot = data.basePot;
            data.tickets = {};
            data.lastDrawTime = Date.now();
            saveLotteryData(data);

            return message.reply(
                `♻️ LOTERIE RÉINITIALISÉE` +
                `\n-------------------------------------------------` +
                `\n🔄 Participants remboursés : ${Object.keys(data.tickets).length}` +
                `\n💰 Total Remboursé : ${formatNumber(totalRefund)}¥` +
                `\n-------------------------------------------------`
            );
        }
        
        return message.reply(`💡 Commandes Admin : setprice <montant>, setbasepot <montant>, add <montant>, draw, reset.`);
    }

    // --- COMMANDE LIST ---
    if (command === "list") {
        const ticketEntries = Object.entries(data.tickets);
        const totalTicketsSold = Object.values(data.tickets).reduce((sum, count) => sum + count, 0);

        if (ticketEntries.length === 0) {
            return message.reply("📜 | Personne n'a encore acheté de ticket pour ce tirage.");
        }

        const participantsList = [];
        for (const [userID, count] of ticketEntries) {
            const name = await usersData.getName(userID);
            participantsList.push(`• ${name} (${userID}) : ${count} tickets`);
        }

        return message.reply(
            `📜 LISTE DES PARTICIPANTS (Tickets totaux: ${totalTicketsSold})` +
            `\n-------------------------------------------------\n` +
            participantsList.join('\n') +
            `\n-------------------------------------------------`
        );
    }


    // --- COMMANDE BUY ---
    if (command === "buy") {
        const count = parseInt(args[1]) || 1;
        const TICKET_PRICE = data.ticketPrice;
        
        if (isNaN(count) || count <= 0) {
            return message.reply(`🎫 | Entre le nombre de tickets que tu souhaites acheter. Prix unitaire : ${formatNumber(TICKET_PRICE)}¥.`);
        }

        const totalCost = count * TICKET_PRICE;
        if (userData.money < totalCost) {
            return message.reply(`❌ | Tu n'as pas assez d'argent pour acheter ${count} tickets. Coût : ${formatNumber(totalCost)}¥.`);
        }

        // ⭐ CORRECTION 2 : Enregistrement du pot avant l'achat
        const potBeforeBuy = data.pot;

        // Transaction
        data.pot += totalCost;
        data.tickets[user] = (data.tickets[user] || 0) + count;
        await usersData.set(user, { money: userData.money - totalCost });
        
        // ⭐ CORRECTION 2 : Si le pot était au niveau de base AVANT cet achat,
        // on définit le temps du dernier tirage à 'maintenant' pour lancer le compte à rebours.
        if (potBeforeBuy === data.basePot && data.pot > data.basePot) {
             data.lastDrawTime = Date.now();
        }

        saveLotteryData(data);

        const totalTickets = data.tickets[user];

        return message.reply(
            `✅ ACHAT RÉUSSI` +
            `\n-------------------------------------------------` +
            `\n➖ Coût total : ${formatNumber(totalCost)}¥` +
            `\n-------------------------------------------------` +
            `\n➕ Pot actuel : ${formatNumber(data.pot)}¥` +
            `\n-------------------------------------------------` +
            `\n🔢 Tes tickets : ${totalTickets}` +
            `\n-------------------------------------------------`
        );
    }

    // --- COMMANDE INFO (et commande par défaut) ---
    if (command === "info" || !command) {
        const timeSinceLastDraw = now - data.lastDrawTime;
        const timeLeftMS = Math.max(0, DRAW_INTERVAL_MS - timeSinceLastDraw);

        // Si le temps restant est très faible (moins de 5 secondes), on affiche "IMMÉDIATEMENT"
        const isImmediat = timeLeftMS < 5000;

        const hours = Math.floor(timeLeftMS / (1000 * 3600));
        const minutes = Math.floor((timeLeftMS % (1000 * 3600)) / (1000 * 60));

        let timeLeft = "IMMÉDIATEMENT (tirage en attente)";
        if (timeLeftMS > 0 && !isImmediat) {
            // Affichage complet du compte à rebours
            const seconds = Math.floor((timeLeftMS % (1000 * 60)) / 1000);
            timeLeft = `${hours}h ${minutes}min ${seconds}s`;
        } else if (timeLeftMS > 0) {
             // Pour les très petits temps, affichage immédiat
             timeLeft = "IMMÉDIATEMENT (tirage en attente)";
        }
        
        const userTickets = data.tickets[user] || 0;
        const totalTicketsSold = Object.values(data.tickets).reduce((sum, count) => sum + count, 0);
        const potWithoutBase = data.pot - data.basePot;

        let infoMsg = 
            `🎰 INFORMATIONS LOTERIE` +
            `\n-------------------------------------------------` +
            `\n💶 Somme de Départ Garanti : ${formatNumber(data.basePot)}¥` +
            `\n-------------------------------------------------` +
            `\n➕💱 Contributions Des participants : +${formatNumber(potWithoutBase)}¥` +
            `\n-------------------------------------------------` +
            `\n🤑 Sommes total a gagné : ${formatNumber(data.pot)}¥` +
            `\n-------------------------------------------------` +
            `\n⏳ PROCHAIN TIRAGE DANS : ${timeLeft}` +
            `\n-------------------------------------------------` +
            `\n💰 Prix du ticket : ${formatNumber(data.ticketPrice)}¥` +
            `\n-------------------------------------------------` +
            `\n🎟️ Tickets Totaux Vendus : ${totalTicketsSold}` +
            `\n-------------------------------------------------` +
            `\n🔢 Tes tickets : ${userTickets}` +
            `\n-------------------------------------------------` +
            `\n🔔 Rappel : Les perdants reçoivent un cashback de 25% de leur mise. Bonne chance !`;
            
        return message.reply(infoMsg);
    }
    
    // --- COMMANDE HISTORY ---
    if (command === "history") {
        if (data.drawHistory.length === 0) {
            return message.reply("📜 | Aucun tirage n'a encore eu lieu.");
        }

        const historyMsg = data.drawHistory.map((entry, index) => {
            const date = new Date(entry.time).toLocaleDateString('fr-FR', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
            });
            // Pas de lignes pour l'historique afin qu'il soit compact
            return `[#${index + 1}] Le ${date} : ${entry.name} a gagné ${formatNumber(entry.netWin)}¥ (Pot: ${formatNumber(entry.pot)}¥)`;
        }).join('\n');

        return message.reply(
            `📜 HISTORIQUE DES 5 DERNIERS TIRAGES 📜` +
            `\n-------------------------------------------------\n` +
            historyMsg +
            `\n-------------------------------------------------`
        );
    }

    // --- Si commande inconnue ---
    return message.reply("💡 | Commande invalide. Utilisation : `{pn} buy <nombre>`, `{pn} info`, `{pn} list`, ou `{pn} history`.");
  }
};
