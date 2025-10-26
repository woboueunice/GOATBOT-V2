const axios = require('axios');

// Objet pour stocker l'historique de la conversation (mémoire)
const conversationHistory = {};

// Liste des MessageIDs du bot qui sont des débuts de conversation.
const botMessageIDs = new Set(); 

const Prefixes = [
  '/ai',
  'bot',
  'rone',
  '.ai',
  'aryan',
  'ai',
  'ask',
];

// Fonction utilitaire pour récupérer le nom d'utilisateur
async function getUserName(api, senderID) {
    try {
        const userInfo = await api.getUserInfo(senderID);
        if (userInfo && userInfo[senderID] && userInfo[senderID].name) {
            return userInfo[senderID].name;
        }
        return `Utilisateur ${senderID}`;
    } catch (error) {
        console.error("Erreur lors de la récupération du nom d'utilisateur:", error.message);
        return `Utilisateur ${senderID}`;
    }
}

module.exports = {
  config: {
    name: "ask",
    version: 2.3, // Mise à jour de la version pour la correction
    author: "OtinXSandip & Tk Joel (Corrigé par l'IA)",
    longDescription: "AI avec mémoire, nom d'utilisateur, conversation par réponse, et réactions dynamiques.",
    category: "ai",
    guide: {
      en: "{p} questions ou répondez à un message du bot pour continuer la conversation.",
    },
  },
  onStart: async function () {},
  onChat: async function ({ api, event, args, message }) {
    try {
      
      const senderID = event.senderID;
      const threadID = event.threadID; // ID de la conversation
      const userMessageID = event.messageID; // ID du message de l'utilisateur
      let prompt = event.body ? event.body.trim() : "";
      let isReplyToBot = false;

      // 1. Détection de la condition d'activation
      
      // A) Détection de la réponse (Reply)
      if (event.type === "message_reply" && event.messageReply.senderID === api.getCurrentUserID()) {
           if (botMessageIDs.has(event.messageReply.messageID)) {
                prompt = event.body.trim();
                isReplyToBot = true;
           } else {
               return; 
           }
      }

      // B) Détection du préfixe
      let prefix = null;
      if (!isReplyToBot) {
          prefix = Prefixes.find((p) => event.body && event.body.toLowerCase().startsWith(p));
          if (!prefix) {
            return; // Ni préfixe ni réponse au bot, ignorer
          }
          prompt = event.body.substring(prefix.length).trim();
      }

      // Si le prompt est vide après détection
      if (!prompt) {
        if (!isReplyToBot) {
            // Utilisation de api.sendMessage pour une meilleure compatibilité
            api.sendMessage("Veuillez poser la question à votre convenance et je m'efforcerai de vous fournir une réponse efficace🤓. Votre satisfaction est ma priorité absolue😼. (𝙀́𝙙𝙞𝙩 𝙗𝙮 𝙏𝙠 𝙅𝙤𝙚𝙡 ㋡)", threadID);
        }
        return;
      }
      
      // **********************************************
      // NOUVELLE TENTATIVE 1 : Réaction immédiate 🤔
      // **********************************************
      // Note: 'api.setMessageReaction' doit être disponible et correctement implémentée.
      api.setMessageReaction('🤔', userMessageID, (err) => {
          if (err) console.error("Reaction 🤔 Error:", err);
      }, true); // Le 'true' force parfois la réaction dans certains frameworks

      // Envoi du message d'attente et récupération de son ID
      let waitingMessageID = null;
      
      // Utiliser api.sendMessage pour obtenir l'ID du message plus facilement
      api.sendMessage("💬🧘🏾‍♂|veuillez Patientez s'il-vous-plait...(𝙀́𝙙𝙞𝙩 𝙗𝙮 𝙏𝙠 𝙅𝙤𝙚𝙡 ㋡)", threadID, (err, info) => {
          if (!err && info && info.messageID) {
              waitingMessageID = info.messageID;
          } else if (err) {
              console.error("Error sending waiting message:", err);
          }
      });
      
      // Attendre un court instant pour que le message soit envoyé et que l'ID soit récupéré
      // avant de procéder à l'appel API (sinon waitingMessageID peut être null)
      await new Promise(resolve => setTimeout(resolve, 500)); 

      // 2. Récupération du nom d'utilisateur
      const userName = await getUserName(api, senderID);

      // 3. Gestion de l'historique et du prompt pour la mémoire
      if (!conversationHistory[senderID]) {
          conversationHistory[senderID] = [];
      }

      const historyText = conversationHistory[senderID].slice(-5).map(h => `[Moi]: ${h.userPrompt}\n[IA]: ${h.aiResponse}`).join('\n');
      
      let fullPrompt = `L'utilisateur ${userName} demande : "${prompt}".`;
      if (historyText) {
          fullPrompt = `Historique de conversation avec ${userName} :\n${historyText}\n[Moi]: ${prompt}\n[IA]:`;
      }

      // --- APPEL DE L'API IA ---
      const response = await axios.get(`https://sandipbaruwal.onrender.com/gpt?prompt=${encodeURIComponent(fullPrompt)}`);
      let answer = response.data.answer;

      // **********************************************
      // NOUVELLE TENTATIVE 2 : Supprimer le message d'attente (unsendMessage)
      // **********************************************
      if (waitingMessageID) {
          api.unsendMessage(waitingMessageID, (err) => {
              if (err) console.error("unsendMessage Error:", err);
          });
      }

      // 4. Stocker le nouvel échange pour la mémoire
      conversationHistory[senderID].push({
          userPrompt: prompt,
          aiResponse: answer,
          timestamp: Date.now()
      });

      // 5. Préparation et envoi de la réponse finale
      const finalAnswer = `[Réponse pour ${userName}]:\n${answer}`;

      let finalMessageID = null;
      api.sendMessage(finalAnswer, threadID, (err, info) => {
          if (!err && info && info.messageID) {
              finalMessageID = info.messageID;
              // 6. Stocker l'ID du message du bot pour la conversation par référence
              botMessageIDs.add(finalMessageID);
          } else if (err) {
              console.error("Error sending final message:", err);
          }

          // **********************************************
          // NOUVELLE TENTATIVE 3 : Changer la réaction pour ✅ (dans le callback)
          // **********************************************
          api.setMessageReaction('✅', userMessageID, (err) => {
              if (err) console.error("Reaction ✅ Error:", err);
          }, true);
      });
      
    } catch (error) {
      console.error("Error:", error.message);
      // S'assurer que le message d'erreur est envoyé si l'API IA échoue
      api.sendMessage(`Une erreur est survenue lors du traitement de la requête : ${error.message}`, event.threadID);
    }
  }
};
