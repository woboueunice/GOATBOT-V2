const ADMIN_UIDS = ["100079402482429", "61550002466586"]; // Liste des UIDs des administrateurs
const STICKER_UID = "8298107380274979"; // UID du sticker à envoyer avant le message

// Fonction utilitaire pour formater les nombres
function formatNumber(number) {
    return Math.floor(number).toLocaleString('fr-FR');
}

module.exports = {
  config: {
    name: "sendmoney",
    aliases: ["gift", "give", "adminpay"],
    version: "1.3", // Version mise à jour
    description: "Permet à l'administrateur d'envoyer de l'argent illimité à n'importe quel utilisateur (y compris lui-même) via UID, mention ou réponse.",
    guide: "{pn} <montant> [UID/mention/réponse]",
    category: "👑 Admin",
    countDown: 5,
    role: 1, 
    author: "Joel"
  },

  onStart: async function ({ api, message, event, args, usersData }) {
    const senderID = event.senderID;

    // --- 1. Vérification Admin Strict ---
    if (!ADMIN_UIDS.includes(senderID)) {
        return message.reply("⛔️ | 🖕Cette commande est 😈strictement réservée à mon Boss Joel 👼.");
    }

    let targetID;
    let amount;
    let targetName;

    // --- 2. Détermination du Montant et de la Cible ---
    
    // Le montant est TOUJOURS le premier argument
    amount = parseInt(args[0]);

    if (isNaN(amount) || amount <= 0) {
        return message.reply(`❌ | Veuillez spécifier un montant valide et positif à envoyer. Utilisation: {pn} <montant> [UID/mention/réponse]`);
    }

    // A. Réponse à un message (prioritaire)
    if (event.messageReply) {
        targetID = event.messageReply.senderID;
    } 
    // B. Mention
    else if (event.mentions && Object.keys(event.mentions).length > 0) {
        targetID = Object.keys(event.mentions)[0];
    } 
    // C. UID direct (deuxième argument)
    else if (args[1]) {
        targetID = args[1].trim(); 
        if (isNaN(targetID)) {
             return message.reply(`❌ | L'UID spécifié ('${args[1]}') n'est pas un nombre valide. Veuillez vérifier.`);
        }
    } 
    // D. Auto-envoi par l'Admin
    else {
        targetID = senderID;
    }

    // --- 3. Vérification Finale de la Cible ---
    if (!targetID) {
        return message.reply(`❌ | Cible non spécifiée. Veuillez répondre à un message, mentionner quelqu'un, ou entrer son UID après le montant.`);
    }

    // --- 4. Exécution de la Transaction ---
    try {
        targetName = await usersData.getName(targetID); 
        const targetData = await usersData.get(targetID);
        const currentMoney = targetData.money || 0;
        
        // Mise à jour du solde de la cible
        const newMoney = currentMoney + amount;
        await usersData.set(targetID, { money: newMoney });

        // --- 5. Message de Confirmation et Sticker (Nouveau) ---
        
        // 5a. Envoi du sticker avant le message
        await api.sendMessage({ sticker: STICKER_UID }, event.threadID);
        
        // 5b. Confirmation à l'Admin
        const adminMessage = 
            `✅ ENVOI D'ARGENT RÉUSSI PAR L'ADMIN` +
            `\n-------------------------------------------------` +
            `\n➡️ Destinataire : ${targetName || 'Non trouvé'} (UID: ${targetID})` + 
            `\n💸 Montant envoyé : ${formatNumber(amount)}¥` +
            `\n-------------------------------------------------` +
            `\n🤑 Nouveau solde de la cible : ${formatNumber(newMoney)}¥`;

        message.reply(adminMessage);

        // --- NOTE: La notification à l'utilisateur ciblé a été complètement retirée comme demandé. ---

    } catch (error) {
        console.error("Erreur lors de l'envoi d'argent par l'Admin:", error);
        return message.reply(`❌ | Une erreur s'est produite lors du traitement. Assurez-vous que l'UID est correct et que l'utilisateur n'est pas bloqué.`);
    }
  }
};
