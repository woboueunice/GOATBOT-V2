const fs = require("fs");
const path = require("path");

// Définition du chemin du fichier de données de la banque
const bankDataPath = path.join(process.cwd(), 'scripts/cmds/bankData.json');
const adminRole = 1; // Rôle requis pour les commandes admin

// --- Fonctions d'Utilitaires ---

function loadBankData() {
  if (!fs.existsSync(bankDataPath)) {
    const initialBankData = {};
    fs.writeFileSync(bankDataPath, JSON.stringify(initialBankData), "utf8");
    return initialBankData;
  }
  try {
      return JSON.parse(fs.readFileSync(bankDataPath, "utf8"));
  } catch (error) {
      console.error("Erreur de lecture de bankData.json:", error);
      return {}; 
  }
}

function saveBankData(data) {
  fs.writeFileSync(bankDataPath, JSON.stringify(data, null, 2), "utf8");
}

function formatNumberWithFullForm(number) {
    const absNumber = Math.abs(number);
    const sign = number < 0 ? '-' : '';

    // Utilise le format brut (avec séparateur d'espace) jusqu'à 1 million
    if (absNumber < 1000000) {
        return `${sign}${Math.round(absNumber).toLocaleString('fr-FR').replace(/\s/g, ' ')}`;
    }
    
    const allForms = [
        "", "", "Million", "Billion", "Trillion", "Quadrillion", "Quintillion", 
        "Sextillion", "Septillion", "Octillion", "Nonillion", "Decillion", "Googol",
    ];

    let displayIndex = Math.floor(Math.log10(absNumber) / 3);
    const suffix = allForms[displayIndex] || "";
    
    const divisor = Math.pow(1000, displayIndex);
    const finalNumber = absNumber / divisor;
    
    return `${sign}${finalNumber.toFixed(2)} ${suffix}`.trim();
}

// --- Module principal ---

module.exports = {
  config: {
    name: "bank",
    version: "3.0", // Nouvelle version
    description: "Système bancaire complet avec économie, prêts et sécurité.",
    guide: {
      en: "{pn}Bank:\n- **Deposit** <montant>\n- **Withdraw** <montant> <pin>\n- **Balance**\n- **Interest**\n- **Transfer** <montant> <UID> <pin>\n- **Buybond** <montant> <jours>\n- **Richest**\n- **Setpin** <new_pin>\n- **Loan** <montant>\n- **Payloan** <montant>"
    },
    category: "💰 Economy",
    countDown: 15,
    role: 0,
    author: "Joel" 
  },
  onStart: async function ({ args, message, event, api, usersData }) {
    const user = parseInt(event.senderID);
    const userMoney = await usersData.get(event.senderID, "money");
    const bankData = loadBankData();

    // Initialisation
    if (!bankData[user]) {
      bankData[user] = { bank: 0, lastInterestClaimed: 0, loan: 0, loanPayed: true, pin: null, bonds: [] };
      saveBankData(bankData);
    }

    const userBank = bankData[user];
    let bankBalance = userBank.bank || 0;
    const userRole = event.senderID.toString() === api.getCurrentUserID().toString() ? 2 : (await usersData.get(event.senderID, "role") || 0);

    const command = args[0]?.toLowerCase();
    const amount = parseInt(args[1]);
    
    // --- Fonction d'aide pour la réponse ---
    const bankReply = (text) => message.reply(`╔════ஜ۩۞۩ஜ═══╗\n\n[🏦 Bank 🏦]\n\n❏${text}\n\n╚════ஜ۩۞۩ஜ═══╝`);
    
    // --- Traitement des Obligations (Mise à jour et Réclamation) ---
    const currentTime = Date.now();
    let bondInterestClaimed = 0;
    
    if (userBank.bonds && userBank.bonds.length > 0) {
        userBank.bonds = userBank.bonds.filter(bond => {
            if (currentTime >= bond.maturityTime) {
                const interestEarned = Math.round(bond.amount * bond.interestRate * bond.durationDays);
                bondInterestClaimed += bond.amount + interestEarned;
                return false; // Supprime l'obligation
            }
            return true; // Garde l'obligation
        });
        
        if (bondInterestClaimed > 0) {
            userBank.bank += bondInterestClaimed;
            await api.sendMessage(
                `🎉 Vos obligations ont atteint leur maturité ! $${formatNumberWithFullForm(bondInterestClaimed)} (Capital + Intérêts) a été ajouté à votre solde bancaire.`,
                event.threadID
            );
            saveBankData(bankData);
        }
    }
    
    // --- Gestion des commandes Administrateur (Privilèges) ---
    if (command === "admin" && userRole >= adminRole) {
      const adminCommand = args[1]?.toLowerCase();
      const targetUID = args[2];
      const adminAmount = parseInt(args[3]);
      
      switch (adminCommand) {
        case "stats":
            let totalBank = 0;
            let totalLoan = 0;
            let totalUsers = 0;
            
            for (const uid in bankData) {
                const data = bankData[uid];
                totalBank += data.bank || 0;
                totalLoan += data.loan || 0;
                totalUsers++;
            }
            
            const averageBalance = totalUsers > 0 ? totalBank / totalUsers : 0;
            
            return bankReply(
                `Statistiques Économiques Globales 📊:\n` +
                `\n- Nombre total d'utilisateurs: ${totalUsers}\n` +
                `- Argent total en banque: $${formatNumberWithFullForm(totalBank)}\n` +
                `- Total des prêts en cours: $${formatNumberWithFullForm(totalLoan)}\n` +
                `- Solde bancaire moyen: $${formatNumberWithFullForm(averageBalance)}`
            );

        case "resetall":
            if (args[2]?.toLowerCase() !== 'confirm') {
                return bankReply("ATTENTION: Cette commande réinitialise TOUS les soldes bancaires et prêts à zéro. Pour confirmer, utilisez: `admin resetall confirm`");
            }
            for (const uid in bankData) {
                bankData[uid].bank = 0;
                bankData[uid].loan = 0;
                bankData[uid].loanPayed = true;
                bankData[uid].bonds = [];
            }
            saveBankData(bankData);
            return bankReply("Réinitialisation complète de tous les comptes bancaires et prêts effectuée. L'économie est réinitialisée. ✅");
          case "check":
          // ... (Le code admin check reste le même que la version précédente) ...
          if (!targetUID) return bankReply("Veuillez spécifier l'UID de l'utilisateur à vérifier.");
          const targetUser = parseInt(targetUID);
          if (!bankData[targetUser]) return bankReply(`L'UID ${targetUID} n'a pas de compte bancaire.`);

          const targetBank = bankData[targetUser].bank || 0;
          const targetMoney = await usersData.get(targetUser, "money");
          const targetLoan = bankData[targetUser].loan || 0;
          const targetPin = bankData[targetUser].pin ? 'Défini' : 'Non Défini';
          const targetName = await usersData.getName(targetUser);

          return bankReply(
            `Audit pour **${targetName}** (UID: ${targetUID}):\n` +
            `\n- Solde en main: $${formatNumberWithFullForm(targetMoney)}\n` +
            `- Solde bancaire: $${formatNumberWithFullForm(targetBank)}\n` +
            `- Prêt en cours: $${formatNumberWithFullForm(targetLoan)}\n` +
            `- PIN Bancaire: ${targetPin}`
          );
        
        case "add":
        case "remove":
          // ... (Le code admin add/remove reste le même que la version précédente) ...
          if (!targetUID || isNaN(adminAmount) || adminAmount <= 0) return bankReply("Usage: admin <add/remove> <UID> <montant>");
          const targetUserID = parseInt(targetUID);
          if (!bankData[targetUserID]) {
            bankData[targetUserID] = { bank: 0, lastInterestClaimed: 0, loan: 0, loanPayed: true, pin: null };
          }
          const targetUserBank = bankData[targetUserID];
          
          if (adminCommand === "add") {
            targetUserBank.bank += adminAmount;
            saveBankData(bankData);
            return bankReply(`$${formatNumberWithFullForm(adminAmount)} **ajouté** au compte bancaire de l'UID ${targetUID}.`);
          } else { // remove
            targetUserBank.bank -= adminAmount;
            if (targetUserBank.bank < 0) targetUserBank.bank = 0; 
            saveBankData(bankData);
            return bankReply(`$${formatNumberWithFullForm(adminAmount)} **retiré** du compte bancaire de l'UID ${targetUID}.`);
          }

        default:
          return bankReply("Commande admin inconnue. Utilisez: check, add, remove, stats, resetall.");
      }
    } else if (command === "admin" && userRole < adminRole) {
        return bankReply("Vous n'avez pas le rôle requis pour exécuter les commandes d'administration. 🚫");
    }

    // --- Gestion des commandes Utilisateur ---
    switch (command) {
      case "deposit":
        if (isNaN(amount) || amount <= 0) return bankReply("Veuillez entrer un montant valide à déposer 🔁•");
        if (bankBalance >= 1e104) return bankReply("Vous ne pouvez pas déposer d'argent lorsque votre solde bancaire est déjà à $1e104 ✖️•");
        if (userMoney < amount) return bankReply("Vous n'avez pas le montant requis à déposer ✖️•");

        userBank.bank += amount;
        await usersData.set(event.senderID, { money: userMoney - amount });
        saveBankData(bankData);

        return bankReply(`Dépôt réussi de $${formatNumberWithFullForm(amount)} sur votre compte bancaire ✅•`);

      case "withdraw":
        const withdrawPin = args[2];
        if (isNaN(amount) || amount <= 0) return bankReply("Veuillez entrer le montant correct à retirer 😪•");
        if (!userBank.pin) return bankReply("Veuillez d'abord définir un PIN bancaire avec `!bank setpin <pin>` 🔒•");
        if (userBank.pin !== withdrawPin) return bankReply("PIN incorrect. Le retrait a été annulé ❌•");
        if (userMoney >= 1e104) return bankReply("Vous ne pouvez pas retirer d'argent lorsque votre solde en main est déjà à $1e104 😒•");
        if (amount > bankBalance) return bankReply("Le montant demandé est supérieur au solde disponible dans votre compte bancaire 🗿•");

        userBank.bank -= amount;
        await usersData.set(event.senderID, { money: userMoney + amount });
        saveBankData(bankData);

        return bankReply(`Retrait réussi de $${formatNumberWithFullForm(amount)} de votre compte bancaire ✅•`);

      case "balance":
        const formattedBankBalance = parseFloat(bankBalance);
        if (isNaN(formattedBankBalance)) return bankReply("Erreur: Votre solde bancaire n'est pas un nombre valide 🥲•");
        
        let bondsInfo = "";
        if (userBank.bonds && userBank.bonds.length > 0) {
            const nextMaturity = userBank.bonds.sort((a, b) => a.maturityTime - b.maturityTime)[0];
            const remainingTime = Math.ceil((nextMaturity.maturityTime - currentTime) / (1000 * 3600 * 24)); // Jours restants
            bondsInfo = `\n- Obligations en cours: ${userBank.bonds.length}\n- Maturité la plus proche: ${remainingTime} jours.`;
        }
        return bankReply(`Votre solde bancaire est: $${formatNumberWithFullForm(formattedBankBalance)}${bondsInfo}`);
        
      case "interest":
        const interestRate = 0.001; // 0.1% taux d'intérêt quotidien
        const lastInterestClaimed = userBank.lastInterestClaimed || 0;
        const dailySeconds = 86400; 
        const timeDiffInSeconds = (currentTime - lastInterestClaimed) / 1000;

        if (timeDiffInSeconds < dailySeconds) {
          const remainingTime = Math.ceil(dailySeconds - timeDiffInSeconds);
          const remainingHours = Math.floor(remainingTime / 3600);
          const remainingMinutes = Math.floor((remainingTime % 3600) / 60);
          return bankReply(`Vous pouvez réclamer l'intérêt à nouveau dans ${remainingHours} heures et ${remainingMinutes} minutes 😉•`);
        }
        
        if (userBank.bank <= 0) return bankReply("Vous n'avez pas d'argent dans votre compte pour gagner de l'intérêt 💸🥱•");

        const dailyRateFactor = interestRate / dailySeconds; 
        const interestEarned = userBank.bank * dailyRateFactor * timeDiffInSeconds; 

        userBank.lastInterestClaimed = currentTime;
        userBank.bank += interestEarned;
        saveBankData(bankData);

        return bankReply(`Vous avez gagné un intérêt de $${formatNumberWithFullForm(Math.round(interestEarned))}.\n\nIl a été ajouté à votre solde ✅•`);

      case "transfer":
        const recipientUID = parseInt(args[2]);
        const transferPin = args[3];
        const feeRate = 0.02; // 2% de frais

        if (isNaN(amount) || amount <= 0) return bankReply("Veuillez entrer un montant valide à transférer 🔁•");
        if (!userBank.pin) return bankReply("Veuillez d'abord définir un PIN bancaire avec `!bank setpin <pin>` 🔒•");
        if (userBank.pin !== transferPin) return bankReply("PIN incorrect. Le transfert a été annulé ❌•");

        if (!recipientUID || !bankData[recipientUID]) return bankReply("Destinataire non trouvé dans la base de données. Veuillez vérifier l'ID ✖️•");
        if (recipientUID === user) return bankReply("Vous ne pouvez pas vous transférer de l'argent 😹•");
        
        const feeAmount = Math.ceil(amount * feeRate);
        const totalDebit = amount + feeAmount; 

        if (bankData[recipientUID].bank >= 1e104) return bankReply("Le solde bancaire du destinataire est déjà à $1e104. Transfert impossible 🗿•");
        if (totalDebit > bankBalance) return bankReply(`Vous n'avez pas assez d'argent ($${formatNumberWithFullForm(totalDebit)}) dans votre banque pour ce transfert (incluant $${formatNumberWithFullForm(feeAmount)} de frais) ✖️•`);

        // Transaction
        userBank.bank -= totalDebit;
        bankData[recipientUID].bank += amount;
        saveBankData(bankData);

        // Notification de Transfert (Alerte)
        const recipientName = await usersData.getName(recipientUID);
        api.sendMessage(
            `🔔 **Notification de Transfert :** Vous avez reçu $${formatNumberWithFullForm(amount)} de la part de **${await usersData.getName(user)}**.`,
            event.threadID // Envoie la notification dans le même fil de discussion
        ).catch(e => console.error("Erreur envoi notification de transfert:", e));


        return bankReply(`Transfert réussi de $${formatNumberWithFullForm(amount)} à l'UID: ${recipientUID} ✅•\n(Frais de transfert: $${formatNumberWithFullForm(feeAmount)})`);

      case "buybond":
        const durationDays = parseInt(args[2]);
        const bondRate = 0.003; // Taux d'intérêt de l'obligation (0.3% par jour)
        const minAmount = 1000;
        
        if (isNaN(amount) || amount < minAmount) return bankReply(`Montant minimum pour acheter une obligation est $${formatNumberWithFullForm(minAmount)}.`);
        if (isNaN(durationDays) || durationDays < 1 || durationDays > 30) return bankReply("La durée de l'obligation doit être entre 1 et 30 jours.");
        if (amount > bankBalance) return bankReply("Vous n'avez pas assez d'argent en banque pour acheter cette obligation.");
        
        // Création de l'obligation
        const maturityTime = currentTime + (durationDays * 86400000); // 86400000 ms = 1 jour
        const estimatedInterest = Math.round(amount * bondRate * durationDays);
        
        userBank.bank -= amount;
        userBank.bonds.push({
            amount: amount,
            durationDays: durationDays,
            interestRate: bondRate,
            maturityTime: maturityTime
        });
        saveBankData(bankData);
        
        return bankReply(`Obligation achetée de $${formatNumberWithFullForm(amount)} pour ${durationDays} jours. Intérêt estimé: $${formatNumberWithFullForm(estimatedInterest)}. L'argent est maintenant bloqué jusqu'à maturité. 🔒`);

      case "richest":
        const topUsers = Object.entries(bankData)
          .sort(([, a], [, b]) => b.bank - a.bank)
          .slice(0, 10);

        const output = (await Promise.all(topUsers.map(async ([userID, userData], index) => {
          const userName = await usersData.getName(userID);
          const formattedBalance = formatNumberWithFullForm(userData.bank);
          return `[${index + 1}. ${userName} - $${formattedBalance}]`;
        }))).join('\n');

        return bankReply("Top 10 des personnes les plus riches selon leur solde bancaire 👑🤴:\n" + output);

      case "setpin":
        const newPin = args[1];
        if (!newPin || newPin.length !== 4 || isNaN(newPin)) return bankReply("Veuillez spécifier un nouveau PIN à 4 chiffres (ex: 1234) 🔒•");

        userBank.pin = newPin;
        saveBankData(bankData);
        return bankReply(`Votre nouveau PIN bancaire est **${newPin}**. Utilisez-le pour les retraits et les transferts. **Ne le partagez pas !** ✅•`);
      
      case "loan":
        const maxLoanAmount = 100000000;
        const userLoan = userBank.loan || 0;
        const loanPayed = userBank.loanPayed !== undefined ? userBank.loanPayed : true;
        
        if (!amount || amount <= 0) return bankReply("Veuillez entrer un montant de prêt valide ✖️•");
        if (amount > maxLoanAmount) return bankReply(`Le montant maximum du prêt est $${formatNumberWithFullForm(maxLoanAmount)} ❗•`);
        if (!loanPayed && userLoan > 0) return bankReply(`Vous ne pouvez pas prendre un nouveau prêt avant d'avoir remboursé le prêt actuel.\n\nPrêt en cours: $${formatNumberWithFullForm(userLoan)} 😑•`);

        userBank.loan = userLoan + amount;
        userBank.loanPayed = false;
        userBank.bank += amount;
        saveBankData(bankData);
        return bankReply(`Vous avez pris un prêt de $${formatNumberWithFullForm(amount)}. Le prêt doit être remboursé 😉•`);

      case "payloan":
        const loanBalance = userBank.loan || 0;

        if (isNaN(amount) || amount <= 0) return bankReply("Veuillez entrer un montant valide pour rembourser votre prêt ✖️•");
        if (loanBalance <= 0) return bankReply("Vous n'avez aucun paiement de prêt en attente•\n\n✧⁺⸜(●˙▾˙●)⸝⁺✧ʸᵃʸ\n");
        if (amount > loanBalance) return bankReply(`Le montant est supérieur à votre dû. Montant total: $${formatNumberWithFullForm(loanBalance)}. Veuillez payer le montant exact 😊•`);
        if (amount > userMoney) return bankReply(`Vous n'avez pas $${formatNumberWithFullForm(amount)} en main pour rembourser le prêt 😢•`);

        userBank.loan = loanBalance - amount;

        if (userBank.loan <= 0) {
          userBank.loan = 0; 
          userBank.loanPayed = true;
        }

        await usersData.set(event.senderID, { money: userMoney - amount });
        saveBankData(bankData);

        return bankReply(`Remboursement réussi de $${formatNumberWithFullForm(amount)} sur votre prêt. Prêt restant: $${formatNumberWithFullForm(userBank.loan)} ✅•`);

      default:
        return bankReply("Veuillez utiliser l'une des commandes valides: Deposit, Withdraw, Balance, Interest, Transfer, Buybond, Richest, Loan, PayLoan, Setpin\n\nPour les commandes admin, utilisez: Admin <commande>");
    }
  }
};

    
