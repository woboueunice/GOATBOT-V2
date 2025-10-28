const axios = require('axios');

// API Configuration
const AI_API_URL = 'https://apis.davidcyriltech.my.id/ai/chatbot';
const API_KEY = ''; // <-- LAISSER VIDE OU ENTRER UNE CLÉ SI NÉCESSAIRE.

// Objet pour stocker l'historique de la conversation (mémoire)
const conversationHistory = {};

// Liste des MessageIDs du bot qui sont des débuts de conversation.
const botMessageIDs = new Set(); 

const Prefixes = [
  'tk',
  'bot',
  'rone',
  '.ai',
  'aryan',
  'ai',
  'ask',
];

// NOUVEAUX PRÉFIXES SPÉCIFIQUES POUR L'HORLOGE
const TimePrefixes = [
  '/time',
  '/heure',
];

// =========================================================
// 1. FONCTIONS UTILITAIRES AJOUTÉES
// =========================================================

/**
 * Fonction pour obtenir l'heure et la date pour un lieu donné.
 * @param {string} location - Ville ou pays.
 * @returns {Promise<string>} - Chaîne formatée de l'heure et de la date.
 */
async function getDateTimeForLocation(location) {
    try {
        // Simulation de recherche factuelle via l'API IA
        const apiUrl = `${AI_API_URL}?query=${encodeURIComponent(`Quelle est l'heure et la date actuelles précises dans la ville de ${location}? Réponds uniquement avec l'heure et la date, sans autres phrases.`)}`;
        const response = await axios.get(apiUrl);

        let result = response.data.result || response.data.response || response.data.message || response.data.text; 
        
        if (typeof result === 'string' && result.trim()) {
             // Nettoyage de la réponse de l'IA si elle ajoute du texte inutile
             result = result.replace(/l'heure|actuelle|est|dans|la|ville|de|à|maintenant|il est|le/gi, '').trim();
             return `L'heure et la date actuelles à ${location} sont : ${result}.`;
        }
        
        // Option de secours: utiliser la date locale et indiquer qu'il s'agit d'une estimation
        const now = new Date();
        const fallbackTime = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
        const fallbackDate = now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        return `Je n'ai pas pu obtenir l'heure précise pour ${location}. Voici mon heure locale : ${now.toLocaleTimeString('fr-FR', { timeZoneName: 'long' })}.`;

    } catch (error) {
        console.error("Erreur lors de la récupération de l'heure/date:", error.message);
        return `Désolé, une erreur est survenue lors de la tentative de récupération de l'heure pour ${location}.`;
    }
}

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

// =========================================================
// 2. CONFIGURATION ET ONCHAT MODIFIÉ
// =========================================================

module.exports = {
  config: {
    name: "ask",
    version: 2.8,
    author: "Tk Joel",
    longDescription: "AI avec mémoire, personnalité, conversation par réponse, heure mondiale et recherche (2025).",
    category: "ai",
    guide: {
      en: "{p} questions ou répondez à un message du bot pour continuer la conversation. Utilisez /time [ville] pour l'heure mondiale.",
    },
  },
  onStart: async function () {},
  onChat: async function ({ api, event, args, message }) {
    let waitingMessageID = null; // Déclaration en haut du bloc pour être accessible dans try et catch
    const userMessageID = event.messageID; // Pour la réaction

    try {
      
      const senderID = event.senderID;
      const threadID = event.threadID; 
      let prompt = event.body ? event.body.trim() : "";
      let isReplyToBot = false;

      // 1. Détection de la condition d'activation
      
      // A) Détection de la réponse (Reply)
      if (event.type === "message_reply" && event.messageReply.senderID === api.getCurrentUserID()) {
           if (botMessageIDs.has(event.messageReply.messageID)) {
                prompt = event.body.trim();
                isReplyToBot = true;
           } else {
               return; // Réponse à un autre message que le début de conversation du bot
           }
      }

      // B) Détection du préfixe
      let prefix = null;
      if (!isReplyToBot) {
          
          // Vérification des préfixes d'heure
          const timePrefix = TimePrefixes.find((p) => event.body && event.body.toLowerCase().startsWith(p));
          
          if (timePrefix) {
              const location = event.body.substring(timePrefix.length).trim();
              
              if (!location) {
                  api.sendMessage("Veuillez spécifier la ville ou le pays dont vous souhaitez connaître l'heure et la date (ex: /time Tokyo).", threadID);
                  return;
              }
              
              // --- FONCTIONNALITÉ D'HORLOGE MONDIALE ---
              api.setMessageReaction('⏱️', userMessageID, (err) => { /* ... */ }, true); 
              
              const timeResult = await getDateTimeForLocation(location);
              api.sendMessage(timeResult, threadID);
              api.setMessageReaction('✅', userMessageID, (err) => { /* ... */ }, true);
              return; // Terminer après l'horloge
          }
          
          // Vérification des préfixes standard
          prefix = Prefixes.find((p) => event.body && event.body.toLowerCase().startsWith(p));
          
          if (!prefix) {
            return; // Ni préfixe standard ni réponse au bot, ignorer
          }
          prompt = event.body.substring(prefix.length).trim();
      }

      // Si le prompt est vide après détection
      if (!prompt) {
        if (!isReplyToBot) {
            api.sendMessage("Veuillez poser la question à votre convenance et je m'efforcerai de vous fournir une réponse efficace🤓. Votre satisfaction est ma priorité absolue😼. (𝙀́𝙙𝙞𝙩 𝙗𝙮 𝙏𝙠 𝙅𝙤𝙚𝙡 ㋡)", threadID);
        }
        return;
      }
      
      // Réaction immédiate 🤔
      api.setMessageReaction('🤔', userMessageID, (err) => {
          if (err) console.error("Reaction 🤔 Error:", err);
      }, true); 

      // Envoi du message d'attente
      api.sendMessage("💬🧘🏾‍♂|veuillez Patientez s'il-vous-plait...(𝙀́𝙙𝙞𝙩 𝙗𝙮 𝙏𝙠 𝙅𝙤𝙚𝙡 ㋡)", threadID, (err, info) => {
          if (!err && info && info.messageID) {
              waitingMessageID = info.messageID;
          } else if (err) {
              console.error("Error sending waiting message:", err);
          }
      });
      
      await new Promise(resolve => setTimeout(resolve, 500)); 

      // 2. Récupération du nom d'utilisateur
      const userName = await getUserName(api, senderID);

      // 3. Gestion de l'historique et du prompt pour la mémoire
      if (!conversationHistory[senderID]) {
          conversationHistory[senderID] = [];
      }

      // --- CRÉATION DU PROMPT D'INSTRUCTION ET DE CONTEXTE ---
      
      // Contexte et Date Actuelle (2025)
      const currentDate = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
      
      // Instruction de personnalité et de style
      let fullPrompt = 
          `Tu es ARYAN, une IA amicale et serviable. ` + 
          `Ton créateur est Joel, un passionné d'informatique qui vit au Cameroun. ` + 
          `Tu dois répondre en Français. ` + 
          `**INFORMATION IMPORTANTE :** La date actuelle est le **${currentDate}**. ` + 
          `Tu as la capacité d'effectuer des recherches sur Internet pour répondre aux questions factuelles récentes. ` + 
          `Tu dois intégrer le nom de l'utilisateur (${userName}) dans ta réponse de façon naturelle. ` + 
          `Son nom est ${userName}.`;
      
      // Injection de l'historique (Mémoire)
      const historyText = conversationHistory[senderID].slice(-3).map(h => `[Moi: ${h.userPrompt}] [Toi: ${h.aiResponse}]`).join('; ');
      
      if (historyText) {
          fullPrompt += ` CONTEXTE PRÉCÉDENT (3 derniers échanges): {${historyText}}`;
      }
      
      // Question finale de l'utilisateur
      fullPrompt += ` Question de ${userName} : "${prompt}". Réponds maintenant.`;

      // --- APPEL DE L'API IA ---
      
      let apiUrl = `${AI_API_URL}?query=${encodeURIComponent(fullPrompt)}`;
      if (API_KEY) {
          apiUrl += `&apikey=${API_KEY}`;
      }

      const response = await axios.get(apiUrl);
      
      // Récupération de la réponse (response.data.result est prioritaire)
      let answer = response.data.result || response.data.response || response.data.message || response.data.text; 
      
      if (typeof answer !== 'string' || answer.trim() === '') {
          answer = "Désolé, l'IA a retourné une réponse vide ou illisible.";
      } else {
          // Nettoyage des balises de prompt injectées par l'IA
          answer = answer.replace(/\[(?:Moi|Toi|User|AI)\]: ?/gi, '').trim(); 
          answer = answer.replace(/\[(?:Moi|Toi|User|AI)\]/gi, '').trim(); 
      }
      
      
      // Supprimer le message d'attente
      if (waitingMessageID) {
          api.unsendMessage(waitingMessageID, (err) => {
              if (err) console.error("unsendMessage Error:", err);
          });
      }

      // 4. Stocker le nouvel échange pour la mémoire, seulement si la réponse n'était pas un échec
      if (answer !== "Désolé, l'IA a retourné une réponse vide ou illisible.") {
        // Stocker la réponse nettoyée et le prompt
        conversationHistory[senderID].push({
            userPrompt: prompt,
            aiResponse: answer,
            timestamp: Date.now()
        });
        
        // Nettoyage de l'historique si trop long (pour éviter de surcharger la mémoire du bot)
        if (conversationHistory[senderID].length > 10) {
            conversationHistory[senderID].shift(); // Retirer l'échange le plus ancien
        }
      }

      // 5. Envoi de la réponse finale
      const finalAnswer = answer; 

      let finalMessageID = null;
      api.sendMessage(finalAnswer, threadID, (err, info) => {
          if (!err && info && info.messageID) {
              finalMessageID = info.messageID;
              // 6. Stocker l'ID du message du bot pour la conversation par référence
              botMessageIDs.add(finalMessageID);
          } else if (err) {
              console.error("Error sending final message:", err);
          }

          // Changer la réaction pour ✅ ou ❌
          const reaction = (answer.startsWith("Désolé, l'IA a retourné une réponse vide ou illisible.")) ? '❌' : '✅';
          api.setMessageReaction(reaction, userMessageID, (err) => {
              if (err) console.error(`Reaction ${reaction} Error:`, err);
          }, true);
      });
      
    } catch (error) {
      console.error("Error:", error.message);
      
      // Affichage de l'erreur réseau ou API pour le debug
      let errorMessage = `❌ Une erreur est survenue lors de la communication avec l'API. (Code HTTP: ${error.response?.status || error.code || 'Inconnu'}).`;
      
      // Supprimer le message d'attente en cas d'échec
      if (waitingMessageID) {
          api.unsendMessage(waitingMessageID, () => {});
      }
      
      api.sendMessage(errorMessage, event.threadID);
      
      // Changer la réaction pour ❌ en cas d'échec final
      api.setMessageReaction('❌', userMessageID, (err) => {
          if (err) console.error("Reaction ❌ Error:", err);
      }, true);
    }
  }
};
                 
