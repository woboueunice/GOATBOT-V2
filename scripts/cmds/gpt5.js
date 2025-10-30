const axios = require('axios');

// --- Configuration API GPT5  ---
const AI_API_URL = 'https://apis.davidcyriltech.my.id/ai/metaai';
// 🚨 TRÈS IMPORTANT : Remplacez par votre clé API réelle si vous en avez une.
const API_KEY = ''; // <-- LAISSER VIDE OU ENTRER UNE CLÉ SI NÉCESSAIRE.

// Objet pour stocker l'historique de la conversation (mémoire)
const conversationHistory = {};

// Liste des MessageIDs du bot qui sont des débuts de conversation.
const botMessageIDs = new Set(); 

// Préfixes d'activation de la commande
const Prefixes = [
  'gpt5',
  'chatgpt',
  '.gpt5',
  'g5',
];

// Préfixes spécifiques pour l'horloge
const TimePrefixes = [
  '/time',
  '/heure',
];

// =========================================================
// 1. FONCTIONS UTILITAIRES (Inchangées, mais utilisent la nouvelle API)
// =========================================================

/*
  Fonction pour obtenir l'heure et la date pour un lieu donné.
 */
async function getDateTimeForLocation(location) {
    try {
        // Construction de l'URL pour la recherche factuelle (Heure)
        const params = {
            text: `Quelle est l'heure et la date actuelles précises dans la ville de ${location}? Réponds uniquement avec l'heure et la date, sans autres phrases.`,
            apikey: API_KEY // Inclus la clé
        };

        const response = await axios.get(AI_API_URL, { params });

        let result = response.data.response || response.data.result || response.data.message || response.data.text; 
        
        if (typeof result === 'string' && result.trim()) {
             result = result.replace(/l'heure|actuelle|est|dans|la|ville|de|à|maintenant|il est|le/gi, '').trim();
             return `L'heure et la date actuelles à ${location} sont : ${result}.`;
        }
        
        const now = new Date();
        return `Je n'ai pas pu obtenir l'heure précise pour ${location}. Voici mon heure locale : ${now.toLocaleTimeString('fr-FR', { timeZoneName: 'long' })}.`;

    } catch (error) {
        console.error("Erreur lors de la récupération de l'heure/date (GPT5):", error.message);
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
        return `Utilisateur ${senderID}`;
    }
}

// =========================================================
// 2. CONFIGURATION ET ONCHAT (Logique principale)
// =========================================================

module.exports = {
  config: {
    name: "gpt5",
    aliases: ['chatgpt'], // Correction: ajout des crochets car aliases est généralement un tableau
    version: 1.1, // Version mise à jour
    author: "Tk Joel",
    longDescription: "GPT-5, avec mémoire de conversation, personnalité, conversation par réponse, heure mondiale et recherche (2025).",
    category: "ai",
    guide: {
      en: "{p} questions ou répondez à un message du bot pour continuer la conversation. Utilisez /time [ville] pour l'heure mondiale.",
    },
  },
  onStart: async function () {},
  onChat: async function ({ api, event, args, message }) {
    let waitingMessageID = null;
    const userMessageID = event.messageID;

    try {
      
      const senderID = event.senderID;
      const threadID = event.threadID; 
      let prompt = event.body ? event.body.trim() : "";
      let isReplyToBot = false;

      // ... [Détection du préfixe et de l'activation (Reply, Time, ou standard) - La logique reste la même] ...
      
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
              api.setMessageReaction('⏱️', userMessageID, (err) => { /*... */ }, true); 
              
              const timeResult = await getDateTimeForLocation(location);
              api.sendMessage(`🌍 HORLOGE MONDIALE (Via GPT5)\n\n${timeResult}`, threadID);
              api.setMessageReaction('☑️', userMessageID, (err) => { /* ... */ }, true);
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
      
      // ... [Messages d'attente et gestion de l'historique - La logique reste la même] ...
      
      // Réaction immédiate 🤖
      api.setMessageReaction('🤖', userMessageID, (err) => {
          if (err) console.error("Reaction 🤖 Error:", err);
      }, true); 

      // Envoi du message d'attente
      api.sendMessage("💬🧘🏾‍♂| GPT-5  réfléchit... Veuillez patienter s'il-vous-plaît... (𝙀́𝙙𝙞𝙩 𝙗𝙮 𝙏𝙠 𝙅𝙤𝙚𝙡 ㋡)", threadID, (err, info) => {
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
      
      const currentDate = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
      
      let fullPrompt = 
          `Tu es GPT-5, une IA amicale et serviable, basée sur la technologie CHATGPT. Ton créateur est Joel, un passionné d'informatique qui vit au Cameroun. Tu dois répondre en Français. ` + 
          `INFORMATION IMPORTANTE : La date actuelle est le ${currentDate}. ` + 
          `Tu as la capacité d'effectuer des recherches sur Internet pour répondre aux questions factuelles récentes. ` + 
          `Tu dois intégrer le nom de l'utilisateur (${userName}) dans ta réponse de façon naturelle. Son nom est ${userName}.`;
      
      const historyText = conversationHistory[senderID].slice(-3).map(h => `[Moi: ${h.userPrompt}] [Toi: ${h.aiResponse}]`).join('; ');
      
      if (historyText) {
          fullPrompt += ` CONTEXTE PRÉCÉDENT (3 derniers échanges): {${historyText}}`;
      }
      
      fullPrompt += ` Question de ${userName} : "${prompt}". Réponds maintenant.`;

      // --- APPEL DE L'API IA (Utilisation des paramètres pour la clarté) ---
      
      const requestParams = {
          text: fullPrompt,
          apikey: API_KEY // ENVOIE LA CLÉ (MÊME SI VIDE)
      };
      
      const response = await axios.get(AI_API_URL, { params: requestParams });
      
      // Récupération et nettoyage de la réponse
      let answer = response.data.response || response.data.result || response.data.message || response.data.text; 
      
      if (typeof answer !== 'string' || answer.trim() === '') {
          answer = "Désolé, l'IA GPT-5 (Meta AI) a retourné une réponse vide ou illisible.";
      } else {
          answer = answer.replace(/\[(?:Moi|Toi|User|AI)\]: ?/gi, '').trim(); 
          answer = answer.replace(/\[(?:Moi|Toi|User|AI)\]/gi, '').trim(); 
      }
      
      
      // ... [Suppression du message d'attente, stockage de l'historique et envoi de la réponse finale - La logique reste la même] ...
      
      // Supprimer le message d'attente
      if (waitingMessageID) {
          api.unsendMessage(waitingMessageID, (err) => {
              if (err) console.error("unsendMessage Error:", err);
          });
      }

      // 4. Stocker le nouvel échange pour la mémoire, seulement si la réponse n'était pas un échec
      if (answer !== "Désolé, l'IA GPT-5 (Meta AI) a retourné une réponse vide ou illisible.") {
        conversationHistory[senderID].push({
            userPrompt: prompt,
            aiResponse: answer,
            timestamp: Date.now()
        });
        
        if (conversationHistory[senderID].length > 10) {
            conversationHistory[senderID].shift(); 
        }
      }

      // 5. Envoi de la réponse finale
      const finalAnswer = `━━━━━━━━━━━━━━━━
     🤖𝗖𝗛𝗔𝗧 𝗚𝗣𝗧 𝟱
━━━━━━━━━━━━━━━━
\n\n${answer}

━━━━━━━ ✕ ━━━━━━━`; 

      let finalMessageID = null;
      api.sendMessage(finalAnswer, threadID, (err, info) => {
          if (!err && info && info.messageID) {
              finalMessageID = info.messageID;
              botMessageIDs.add(finalMessageID);
          } else if (err) {
              console.error("Error sending final message:", err);
          }

          // Changer la réaction pour ✅ ou ❌
          const reaction = (answer.startsWith("Désolé, l'IA GPT-5 a retourné une réponse vide ou illisible.")) ? '❌' : '✅';
          api.setMessageReaction(reaction, userMessageID, (err) => {
              if (err) console.error(`Reaction ${reaction} Error:`, err);
          }, true);
      });
      
    } catch (error) {
      console.error("Error:", error.message);
      
      // --- NOUVEAU DIAGNOSTIC POUR ERREUR 500 ---
      let errorMessage = `❌ Une erreur est survenue lors de la communication avec l'API GPT-5 (Meta AI). (Code HTTP: ${error.response?.status || error.code || 'Inconnu'}).`;
      
      if (error.response?.status === 500) {
          errorMessage = "❌ **Erreur Critique 500 (Internal Server Error).** Le serveur de l'API a eu un problème inattendu.";
          if (!API_KEY) {
              errorMessage += "\n\n💡 **Vérification :** Le serveur retourne souvent 500 si la **clé API est manquante** (`API_KEY` vide) ou invalide. Veuillez vérifier votre clé !";
          }
      } else if (error.response?.status === 400 || error.response?.status === 401) {
          errorMessage = "❌ Erreur : La clé API est probablement invalide ou manquante. Veuillez vérifier `API_KEY`.";
      }

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
