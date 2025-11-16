/**
 * @author Joel (Inspiré par GoatBot V2)
 * @description Une commande de machine à sous dynamique avec animation et une belle mise en forme.
 * @usages [mise]
 * @example /slot 100
 */

// Fonction utilitaire pour créer des délais (pauses)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports.config = {
  name: "slot",
  version: "1.1.2", // J'ai mis à jour la version
  credits: "Joel",
  description: "Jouez à la machine à sous stylée avec animation.",
  category: "economy",
  usages: "[mise]",
  cooldowns: 7 
};

// *** LA CORRECTION EST ICI ***
// Ajout de la fonction onLoad requise par ton framework (loadScripts.js)
module.exports.onLoad = function() {
  // Pas besoin de faire quoi que ce soit au chargement pour cette commande.
};

module.exports.run = async function({ api, event, args, usersData }) {
  const { senderID, threadID, messageID } = event;

  // --- 1. VALIDATION DE LA MISE ---

  const mise = parseInt(args[0]);

  // Erreurs de base
  if (isNaN(mise)) {
    return api.sendMessage("Veuillez entrer une mise (un nombre) pour jouer.", threadID, messageID);
  }
  if (mise <= 0) {
    return api.sendMessage("Votre mise doit être un nombre positif.", threadID, messageID);
  }

  try {
    // Récupérer la balance de l'utilisateur
    let userData = await usersData.get(senderID);
    let balance = userData.money || 0;

    // Vérifier s'il a assez d'argent
    if (balance < mise) {
      return api.sendMessage(`Vous n'avez pas assez d'argent. Votre balance est de ${balance}$.`, threadID, messageID);
    }

    // --- 2. LOGIQUE DU JEU (Symboles & Gains) ---

    // Pool de symboles (probabilités pondérées)
    // 🍒(x5), 🍋(x4), 🔔(x3), 💰(x2), 7️⃣(x1)
    const symbols = ["🍒", "🍒", "🍒", "🍒", "🍒", "🍋", "🍋", "🍋", "🍋", "🔔", "🔔", "🔔", "💰", "💰", "7️⃣"];
    
    // Table des gains (multiplicateurs)
    const payouts = {
      "🍒": 3,  // 3 cerises = 3x la mise
      "🍋": 5,  // 3 citrons = 5x la mise
      "🔔": 10, // 3 cloches = 10x la mise
      "💰": 25, // 3 sacs = 25x la mise
      "7️⃣": 100 // 3 sept = JACKPOT 100x la mise
    };

    // Fonction pour un tirage
    function spinReel() {
      return symbols[Math.floor(Math.random() * symbols.length)];
    }

    // Lancer les 3 bobines
    const reel1 = spinReel();
    const reel2 = spinReel();
    const reel3 = spinReel();
    const resultReels = [reel1, reel2, reel3];

    // Calculer les gains
    let winnings = 0;
    let multiplier = 0;
    let isWin = false;

    if (reel1 === reel2 && reel2 === reel3) {
      // C'est une victoire !
      isWin = true;
      multiplier = payouts[reel1];
      winnings = mise * multiplier;
    }

    // --- 3. ANIMATION ET MISE À JOUR ---

    // Indiquer que le bot "réfléchit"
    api.sendTypingIndicator(threadID);
    // Réagir au message du joueur
    api.setMessageReaction("👍", messageID);

    // Envoyer le message initial d'animation
    const spinMessage = await api.sendMessage("🎰 Lancement du tirage...", threadID);
    const messageIDToEdit = spinMessage.messageID;

    // Animation de spin (modification du message)
    try {
      await delay(1000);
      api.editMessage("🎰 [ ❓ | ❓ | ❓ ]", messageIDToEdit);
      await delay(1000);
      api.editMessage(`🎰 [ ${resultReels[0]} | ❓ | ❓ ]`, messageIDToEdit);
      await delay(1000);
      api.editMessage(`🎰 [ ${resultReels[0]} | ${resultReels[1]} | ❓ ]`, messageIDToEdit);
      await delay(1000);
      api.editMessage(`🎰 [ ${resultReels[0]} | ${resultReels[1]} | ${resultReels[2]} ]`, messageIDToEdit);
      await delay(1500); // Pause dramatique avant le résultat
    } catch (e) {
      console.log("Erreur lors de l'édition du message (peut-être supprimé):", e);
    }

    // --- 4. RÉSULTAT FINAL ET FORMATAGE ---

    let finalBalance;
    let resultEmoji;
    let resultText;
    let gainLossText;

    if (isWin) {
      finalBalance = balance - mise + winnings;
      resultEmoji = "🎉";
      if (multiplier === 100) {
        resultText = "👑 JACKPOT !!";
        gainLossText = `𝐘𝐎𝐔 𝐖𝐎𝐍 ${winnings}$`;
      } else {
        resultText = "🎊 𝐌𝐀𝐓𝐂H !";
        gainLossText = `𝐘𝐎U 𝐖𝐎𝐍 ${winnings}$ (x${multiplier})`;
      }
    } else {
      finalBalance = balance - mise;
      resultEmoji = "😢";
      resultText = "💀 𝐍𝐎 𝐌𝐀𝐓𝐂H.";
      gainLossText = `𝐘𝐎𝐔 𝐋𝐎𝐒T ${mise}$`;
    }

    // Mettre à jour la base de données
    await usersData.set(senderID, { money: finalBalance });

    // Construire le message final (ton format stylé)
    const finalMessageBody = `━━━━━━━━━━━━━━
🎰 𝐒𝐋𝐎𝐓 𝐌𝐀𝐂𝐇𝐈𝐍𝐄
╭─╼━━━━━━━━━━╾─╮
│     ${resultReels.join(" | ")}
│
│  ${resultEmoji} ${resultText}
│  ${gainLossText}
╰─╼━━━━━━━━━━╾─╯
💰 𝐁𝐀𝐋𝐀𝐍𝐂𝐄: ${finalBalance}$
━━━━━━━━━━━━━━`;

    // Envoyer le résultat final en modifiant le message d'animation
    api.editMessage(finalMessageBody, messageIDToEdit, async (err) => {
      if (err) {
        console.log("Échec de l'édition, envoi d'un nouveau message.", err);
        api.sendMessage(finalMessageBody, threadID);
      } else {
        // Si l'édition réussit, réagir au message
        api.setMessageReaction(isWin ? "🎉" : "😢", messageIDToEdit);
        
        // (Idée bonus : le GIF Jackpot)
        if (multiplier === 100) {
            try {
                const axios = require("axios");
                const gifStream = (await axios.get("https://i.giphy.com/media/l41YCERXqdx82S7uM/giphy.gif", { responseType: "stream" })).data;
                api.sendMessage({
                    body: "FÉLICITATIONS POUR LE JACKPOT !",
                    attachment: gifStream
                }, threadID);
            } catch (gifError) {
                console.error("Erreur lors de l'envoi du GIF Jackpot:", gifError);
                api.sendMessage("FÉLICITATIONS POUR LE JACKPOT ! (Impossible de charger le GIF)", threadID);
            }
        }
      }
    });

  } catch (error) {
    console.error("[SLOT_MACHINE] Erreur:", error);
    api.sendMessage("Une erreur est survenue lors du jeu. Réessayez plus tard.", threadID);
  }
};
