const ADMIN_UID = "100079402482429"; // UID de l'administrateur

// Fonction utilitaire pour formater les nombres
function formatNumber(number) {
    return Math.floor(number).toLocaleString('fr-FR');
}

module.exports = {
  config: {
    name: "sendmoney",
    aliases: ["gift", "give", "adminpay"],
    version: "1.1", // Version corrigée
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
    if (senderID !== ADMIN_UID) {
        return message.reply("⛔️ | Cette commande est strictement réservée à l'administrateur (UID: 100079402482429).");
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
        // Prend le premier UID mentionné
        targetID = Object.keys(event.mentions)[0];
    } 
    // C. UID direct (deuxième argument)
    else if (args[1]) {
        // Tente de lire le deuxième argument comme un UID
        targetID = args[1].trim(); 
        if (isNaN(targetID)) {
             return message.reply(`❌ | L'UID spécifié ('${args[1]}') n'est pas un nombre valide. Veuillez vérifier.`);
        }
    } 
    // D. Auto-envoi par l'Admin (si pas de cible spécifiée, l'Admin s'envoie à lui-même)
    else {
        targetID = senderID;
    }

    // --- 3. Vérification Finale de la Cible ---
    if (!targetID) {
        return message.reply(`❌ | Cible non spécifiée. Veuillez répondre à un message, mentionner quelqu'un, ou entrer son UID après le montant.`);
    }

    // --- 4. Exécution de la Transaction ---
    try {
        // Récupérer le nom, même si la cible est 'null' (nouvel utilisateur)
        targetName = await usersData.getName(targetID); 
        const targetData = await usersData.get(targetID);
        const currentMoney = targetData.money || 0;
        
        // Mise à jour du solde de la cible
        const newMoney = currentMoney + amount;
        await usersData.set(targetID, { money: newMoney });

        // --- 5. Message de Confirmation et Notification (Nouveau Design) ---
        
        // Confirmation à l'Admin
        const adminMessage = 
            `✅ ENVOI D'ARGENT RÉUSSI PAR L'ADMIN` +
            `\n-------------------------------------------------` +
            `\n➡️ Destinataire : ${targetName || 'Non trouvé'} (UID: ${targetID})` + 
            `\n💸 Montant envoyé : ${formatNumber(amount)}¥` +
            `\n-------------------------------------------------` +
            `\n🤑 Nouveau solde de la cible : ${formatNumber(newMoney)}¥`;

        message.reply(adminMessage);

        // Notification à l'utilisateur (si la cible n'est pas l'Admin qui utilise la commande dans un groupe)
        if (targetID !== senderID || event.threadID !== targetID) {
             const userNotification = 
                `🎉 CADEAU DE L'ADMINISTRATEUR !` +
                `\n-------------------------------------------------` +
                `\nVous avez reçu ${formatNumber(amount)}¥ de la part de l'Administrateur !` +
                `\n-------------------------------------------------` +
                `\n🤑 Votre nouveau solde : ${formatNumber(newMoney)}¥`;
                
            // Tente d'envoyer en privé ou dans le chat de groupe si c'est la seule option
            await api.sendMessage(userNotification, targetID)
                     .catch(() => {
                         api.sendMessage(userNotification, event.threadID);
                     });
        }


    } catch (error) {
        console.error("Erreur lors de l'envoi d'argent par l'Admin:", error);
        return message.reply(`❌ | Une erreur s'est produite lors du traitement. Assurez-vous que l'UID est correct et que l'utilisateur n'est pas bloqué.`);
    }
  }
};
