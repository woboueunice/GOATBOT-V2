const axios = require("axios");

module.exports.config = {
    name: "slot",
    version: "2.1.0",
    hasPermssion: 0,
    credits: "Joel",
    description: "Machine à sous (Version Stable)",
    commandCategory: "economy",
    usages: "[mise]",
    cooldowns: 5
};

// Fonction pour créer une pause (Suspense)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports.onStart = async function({ api, event, args, usersData }) {
    const { senderID, threadID, messageID } = event;

    // =========================================================
    // 1. VÉRIFICATIONS & ARGENT
    // =========================================================

    const mise = parseInt(args[0]);

    // Vérif si c'est un nombre
    if (isNaN(mise) || mise <= 0) {
        return api.sendMessage("⚠️ **Erreur**\nVeuillez entrer une mise valide.\nEx: `/slot 100`", threadID, messageID);
    }

    // Récupération du solde
    let userData = await usersData.get(senderID);
    let balance = userData.money || 0;

    // Vérif si assez d'argent
    if (balance < mise) {
        return api.sendMessage(`💵 **Fonds insuffisants !**\nVotre solde : ${balance}$\nMise nécessaire : ${mise}$`, threadID, messageID);
    }

    // =========================================================
    // 2. LOGIQUE DU JEU
    // =========================================================

    // Symboles
    const symbols = ["🍒", "🍒", "🍒", "🍒", "🍋", "🍋", "🍋", "🔔", "🔔", "💰", "💰", "7️⃣"];
    
    // Gains
    const payouts = {
        "🍒": 3,
        "🍋": 5,
        "🔔": 10,
        "💰": 25,
        "7️⃣": 100 // Jackpot
    };

    function spin() {
        return symbols[Math.floor(Math.random() * symbols.length)];
    }

    const r1 = spin();
    const r2 = spin();
    const r3 = spin();
    // On garde tes symboles pour le visuel
    const resultReels = [r1, r2, r3];

    let isWin = false;
    let winnings = 0;
    let multiplier = 0;

    // Logique : 3 symboles identiques
    if (r1 === r2 && r2 === r3) {
        isWin = true;
        multiplier = payouts[r1];
        winnings = mise * multiplier;
    }

    // Calcul du nouveau solde
    let finalBalance = isWin ? (balance - mise + winnings) : (balance - mise);
    
    // Sauvegarde immédiate
    await usersData.set(senderID, { money: finalBalance });

    // =========================================================
    // 3. ANIMATION & AFFICHAGE (Compatible GoatBot V2)
    // =========================================================

    // 1. Indicateur de frappe
    api.sendTypingIndicator(threadID);

    // 2. Message de lancement (On n'utilise pas editMessage ici)
    let spinMsgInfo;
    try {
        spinMsgInfo = await api.sendMessage("🎰 **Les rouleaux tournent...**", threadID);
    } catch (e) {
        // Si erreur d'envoi, on stop
        return;
    }

    // 3. Pause de suspense (2 secondes)
    await delay(2000);

    // 4. Suppression du message "Les rouleaux tournent..."
    // C'est ça qui remplace l'animation qui buggait
    if (spinMsgInfo) {
        api.unsendMessage(spinMsgInfo.messageID);
    }

    // 5. Préparation du message final (Ton design exact)
    let resultEmoji, resultText, gainLossText;

    if (isWin) {
        resultEmoji = multiplier === 100 ? "👑" : "🎉";
        resultText = multiplier === 100 ? "𝐉𝐀𝐂𝐊𝐏𝐎𝐓 !!" : "𝐌𝐀𝐓𝐂𝐇 !";
        gainLossText = `𝐘𝐎𝐔 𝐖𝐎𝐍 ${winnings}$ (x${multiplier})`;
    } else {
        resultEmoji = "💀";
        resultText = "𝐍𝐎 𝐌𝐀𝐓𝐂𝐇.";
        gainLossText = `𝐘𝐎𝐔 𝐋𝐎𝐒𝐓 ${mise}$`;
    }

    const finalBody = `━━━━━━━━━━━━━━
🎰 𝐒𝐋𝐎𝐓 𝐌𝐀𝐂𝐇𝐈𝐍𝐄
╭─╼━━━━━━━━━━╾─╮
│   ${r1}  |  ${r2}  |  ${r3}
│
│  ${resultEmoji} ${resultText}
│  ${gainLossText}
╰─╼━━━━━━━━━━╾─╯
💰 𝐁𝐀𝐋𝐀𝐍𝐂𝐄: ${finalBalance}$
━━━━━━━━━━━━━━`;

    // 6. Envoi du résultat final
    api.sendMessage(finalBody, threadID, async (err) => {
        if (!err) {
            // Réaction finale sur le résultat
            api.setMessageReaction(isWin ? "🎉" : "😢", messageID, () => {}, true);
        }

        // Petit bonus : GIF si Jackpot (Optionnel)
        if (isWin && multiplier >= 25) {
            try {
                const gifLink = multiplier === 100 
                    ? "https://i.giphy.com/media/l41YCERXqdx82S7uM/giphy.gif" 
                    : "https://media.giphy.com/media/StKiS6x698JAl9d6Zj/giphy.gif"; 
                
                const gifStream = (await axios.get(gifLink, { responseType: "stream" })).data;
                api.sendMessage({ attachment: gifStream }, threadID);
            } catch (e) {
                // Pas grave si le gif échoue
            }
        }
    });
};
