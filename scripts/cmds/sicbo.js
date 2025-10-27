module.exports = {
  config: {
    name: "sicbo",
    aliases: ["sic"],
    version: "2.1",
    author: "Tk joel",
    countDown: 10,
    role: 0,
    shortDescription: "🎲 Sicbo, le jeu de dés et de chance absolu.",
    longDescription: "Joue au Sic Bo et tente de devenir millionnaire virtuel ! \n\n"
                  + "=== 📜 MODE D'EMPLOI 📜 ===\n\n"
                  + "La commande se fait toujours sous la forme : {pn} <type_pari> <valeur_ou_rien> <mise>\n"
                  + "Mise minimale : 50¥.\n\n"
                  + "1. Pari Small/Big (Gain x1) :\n"
                  + "   - {pn} big 100\n"
                  + "   - {pn} small 500\n"
                  + "   *Attention : Un Triple fait perdre tous les paris Small/Big !*\n\n"
                  + "2. Pari Total Exact (Gains x6 à x60) :\n"
                  + "   - Parier sur la somme exacte des 3 dés (de 4 à 17).\n"
                  + "   - {pn} total 11 100 (Parier 100¥ que la somme sera 11)\n\n"
                  + "3. Pari Double Spécifique (Gain x8) :\n"
                  + "   - Parier qu'un numéro précis (1 à 6) sortira au moins deux fois.\n"
                  + "   - {pn} double 5 100 (Parier 100¥ sur le double 5)\n\n"
                  + "4. Pari Triple Général (Gain x30) :\n"
                  + "   - Parier que N'IMPORTE QUEL triple sortira (ex: 1-1-1 ou 6-6-6).\n"
                  + "   - {pn} triple 500\n\n"
                  + "⭐ Le Triple 1 donne accès au JACKPOT MAJEUR ! Bonne chance ! ⭐",
    category: "game",
    guide: "{pn} <type_pari> <valeur> <montant>"
  },

  onStart: async function ({ args, message, usersData, event }) {
    const betType = args[0] ? args[0].toLowerCase() : null;
    const betValue = args[1]; // Pour total ou double
    const betAmount = parseInt(args.slice(-1)[0]);
    const user = event.senderID;
    const userData = await usersData.get(user);
    const ADMIN_UID = "100079402482429"; 

    // --- 1. Vérification des conditions initiales ---
    if (!betType || !betAmount || isNaN(betAmount)) {
        return message.reply("🎲 | Utilisation invalide. Voir {pn} guide pour le mode d'emploi.");
    }

    if (!Number.isInteger(betAmount) || betAmount < 50) {
      return message.reply("💰 | Tu ne peux miser qu'à partir de 50¥. Ne sois pas radin !");
    }

    if (betAmount > userData.money) {
      return message.reply(`😭 | T'es trop pauvre ! Solde actuel : ${userData.money}¥. Va mendier ailleurs.`);
    }

    // --- 2. Lancement des Dés ---
    const rollDice = () => Math.floor(Math.random() * 6) + 1;
    const results = [rollDice(), rollDice(), rollDice()];
    const total = results.reduce((a, b) => a + b, 0);
    const resultString = results.join(" | ");

    // Forçage de Triple 1 (0.5% de chance) pour le fun/test du Jackpot
    if (Math.random() < 0.005) { 
        results[0] = results[1] = results[2] = 1;
    }
    
    // Détection des Triples
    const isTriple = results[0] === results[1] && results[1] === results[2];
    const tripleValue = isTriple ? results[0] : null;

    let winAmount = 0;
    let winMessage = "";
    let lostMessage = `\n(💔) T'as perdu ${betAmount}¥. Le destin t'a boudé.`;
    let isWin = false;

    // --- 3. Détermination de la Victoire selon le Type de Pari ---
    
    // --- Small/Big (Gain 1:1) ---
    if (["small", "big"].includes(betType)) {
        if (isTriple) {
            winMessage = `🎲 [ ${resultString} ] 🎲\n🚫 TRIPLE ! Les paris Small/Big sont ANULÉS. L'argent part dans le Jackpot ! Tu perds ${betAmount}¥.`;
        } else {
            const isSmall = total >= 4 && total <= 10;
            const isBig = total >= 11 && total <= 17;
            
            if ((betType === "small" && isSmall) || (betType === "big" && isBig)) {
                winAmount = betAmount; // Gain net (x2 la mise totale)
                winMessage = `🎲 [ ${resultString} ] (Total: ${total})\n🎉 GAGNÉ ! Ton pari sur ${betType.toUpperCase()} est validé. Tu gagnes ${winAmount}¥ !`;
                isWin = true;
            } else {
                lostMessage = `\n(😂) T'as perdu ${betAmount}¥. Le résultat était ${isSmall ? 'SMALL' : 'BIG'}. Vas te faire hara-kiri.`;
            }
        }
    }

    // --- Total Exact ---
    else if (betType === "total") {
        const target = parseInt(betValue);
        const PAYOUTS = { 4: 60, 5: 30, 6: 18, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 18, 16: 30, 17: 60 };

        if (!PAYOUTS[target]) {
            return message.reply("🔢 | Le Total Exact doit être compris entre 4 et 17.");
        }

        if (total === target) {
            const multiplier = PAYOUTS[target];
            winAmount = betAmount * multiplier;
            winMessage = `🎲 [ ${resultString} ] (Total: ${total})\n👑 JACKPOT ! Le total exact est ${total}. Tu multiplies ta mise par ${multiplier} et gagnes ${winAmount}¥ !`;
            isWin = true;
        } else {
            lostMessage = `\n(🔥) T'as perdu ${betAmount}¥. Le total était ${total}, pas ${target}... Chaud, non ?`;
        }
    }

    // --- Double Spécifique ---
    else if (betType === "double") {
        const target = parseInt(betValue);
        if (target < 1 || target > 6) {
             return message.reply("🔢 | La valeur du Double doit être comprise entre 1 et 6.");
        }

        const count = results.filter(d => d === target).length;
        
        if (count >= 2) { 
            const multiplier = (count === 3) ? 25 : 8; 
            winAmount = betAmount * multiplier;
            winMessage = `🎲 [ ${resultString} ]\n🥳 MIRACLE ! Le Double ${target} est sorti ${count} fois. Tu gagnes ${winAmount}¥ !`;
            isWin = true;
        } else {
            lostMessage = `\n(🙄) T'as perdu ${betAmount}¥. Seulement ${count} dés sur ${target} sont sortis. Essaie encore, tu y es presque... ou pas.`;
        }
    }
    
    // --- Triple Général (Any Triple) ---
    else if (betType === "triple" && args.length === 2) {
        if (isTriple) {
            winAmount = betAmount * 30; // Gain net 30:1
            winMessage = `🎲 [ ${resultString} ]\n🚨 TRIPLE MONDIAL ! Pari gagné. Tu gagnes ${winAmount}¥ !`;
            isWin = true;
        } else {
             lostMessage = `\n(😫) T'as perdu ${betAmount}¥. Il te manquait juste un troisième dé identique. Pauvre de toi.`;
        }
    } else {
        return message.reply("🎲 | Type de pari inconnu ou format incorrect. Voir {pn} guide.");
    }

    // --- 4. Gestion du Jackpot (Triple 1) ---
    if (isTriple && tripleValue === 1) {
        const adminMention = ADMIN_UID ? `(CC: @${ADMIN_UID})` : '';
        winMessage += `\n\n⭐ JACKPOT MAJEUR ! C'est le TRIPLE 1 ! Contacte l'admin pour le gros lot ! ${adminMention}`;
    }
    
    // --- 5. Mise à jour de l'argent et réponse finale ---
    if (isWin) {
        userData.money += winAmount;
        await usersData.set(user, userData);
        return message.reply(`${winMessage}\n\n🎉 Solde actuel : ${userData.money}¥`);
    } else {
        if (!winMessage.includes("TRIPLE")) { 
            userData.money -= betAmount;
            await usersData.set(user, userData);
        }
        
        // Affichage des résultats du dé dans le message de perte/annulation
        const finalMessage = winMessage.includes("TRIPLE") 
            ? winMessage 
            : `🎲 [ ${resultString} ] (Total: ${total}) ${lostMessage}`;

        return message.reply(`${finalMessage}\n\n💸 Solde actuel : ${userData.money}¥`);
    }
  }
};
