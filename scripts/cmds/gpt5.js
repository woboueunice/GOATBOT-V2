const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Configuration API Gemini ---
// Modèle pour le TExte, la Recherche, et la VISION
const GEMINI_FLASH_MODEL = 'gemini-2.5-flash-preview-09-2025';
// Modèle pour la GÉNÉRATION d'image (Nano-Banana).
// NOTE: Ce modèle a une limite de 1-2 images par minute. Un cooldown est implémenté.
const GEMINI_IMAGE_GEN_MODEL = 'gemini-2.5-flash-image-preview';

// 🚨 VOTRE CLÉ API GEMINI 🚨
const API_KEY = "AIzaSyAbnxZuCt5Lv3VC4x3sU0PZGphN05alRNs"; // 👈 Votre clé est ici.

// Assurer que le dossier temporaire existe
const tmpPath = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpPath)) {
    fs.mkdirSync(tmpPath, { recursive: true });
}

// Objets de gestion
const conversationHistory = {};
const botMessageIDs = new Set();
// NOUVEAU: Cooldown (temps de recharge) pour la génération d'image (en millisecondes)
const IMAGE_GEN_COOLDOWN_MS = 60000; // 60 secondes
const imageGenCooldown = new Map();

// --- Préfixes ---
const Prefixes = ['gpt5', 'chatgpt', '.gpt5', 'g5'];
const TimePrefixes = ['/time', '/heure'];
const ImageGenPrefixes = ['/imagine', '/dessine', '/gen'];

// =========================================================
// 1. FONCTIONS UTILITAIRES
// =========================================================

/**
 * Construit l'URL de l'API Gemini
 */
function getGeminiApiUrl(modelName) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;
}

/**
 * Télécharge une pièce jointe (pour la vision)
 */
async function downloadAttachment(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const base64Data = Buffer.from(response.data, 'binary').toString('base64');
        const mimeType = response.headers['content-type'];
        return { base64Data, mimeType };
    } catch (error) {
        console.error("Erreur téléchargement pièce jointe:", error.message);
        return null;
    }
}

/**
 * Gère la génération d'image (Modèle 'nano-banana')
 */
async function handleImageGeneration(api, event, prompt) {
    const threadID = event.threadID;
    const userMessageID = event.messageID;
    let waitingMessageID = null;

    try {
        // Message d'attente pour la génération
        api.sendMessage("🎨 Je commence à dessiner votre image (Modèle Flash-Image)... Veuillez patienter.", threadID, (err, info) => {
            if (!err) waitingMessageID = info.messageID;
        });

        const apiUrl = getGeminiApiUrl(GEMINI_IMAGE_GEN_MODEL);
        
        const payload = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'] 
            },
        };

        const response = await axios.post(apiUrl, payload, { headers: { 'Content-Type': 'application/json' } });
        
        if (waitingMessageID) api.unsendMessage(waitingMessageID);

        const base64Data = response.data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

        if (!base64Data) {
            api.sendMessage("Désolé, je n'ai pas pu générer l'image. L'IA a peut-être refusé pour des raisons de sécurité (filtre).", threadID);
            return;
        }

        const imageBuffer = Buffer.from(base64Data, 'base64');
        const imagePath = path.join(tmpPath, `${event.messageID}.png`);
        fs.writeFileSync(imagePath, imageBuffer);

        api.sendMessage({
            body: `Voici votre image pour : "${prompt}"`,
            attachment: fs.createReadStream(imagePath)
        }, threadID, (err, msgInfo) => {
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        });

    } catch (error) {
        console.error("Erreur handleImageGeneration:", error.message);
        if (waitingMessageID) api.unsendMessage(waitingMessageID);

        let httpStatus = error.response?.status;
        let errorMsg = `❌ Une erreur est survenue lors de la génération de l'image. (HTTP: ${httpStatus})`;
        
        if (httpStatus === 429) {
            errorMsg += "\n\n💡 **Limite Atteinte (429)**: Vous avez fait trop de demandes trop rapidement. **Veuillez patienter 1 minute**.";
        } else if (httpStatus === 400) {
             errorMsg += "\n\n💡 **Erreur (400)**: Votre prompt a été refusé par les filtres de sécurité de Google.";
        }
        
        api.sendMessage(errorMsg, threadID);
    }
}

/**
 * Analyse l'intention de l'utilisateur (Chat vs Image)
 */
async function analyzeUserIntent(userPrompt, chatHistory) {
    try {
        const apiUrl = getGeminiApiUrl(GEMINI_FLASH_MODEL); 
        
        const history = (chatHistory || []).slice(-4).map(h => ([
            { role: "user", parts: h.userParts },
            { role: "model", parts: [{ text: h.aiResponse }] }
        ])).flat();

        const systemPrompt = `Tu es un analyseur d'intention. L'utilisateur va te donner un prompt. Tu dois déterminer s'il veut "chatter" ou "générer une image".
Réponds UNIQUEMENT en JSON.
Si l'utilisateur demande de dessiner, créer, imaginer, ou générer une image, fixe "intent" à "image".
Pour tout le reste (questions, salutations, etc.), fixe "intent" à "chat".
Extrait le prompt de génération si nécessaire. Si c'est un chat, le prompt est le texte de l'utilisateur.

Exemples:
- "créé une image d'un chat" -> {"intent": "image", "prompt": "un chat"}
- "dessine un dragon" -> {"intent": "image", "prompt": "un dragon"}
- "salut ça va?" -> {"intent": "chat", "prompt": "salut ça va?"}
- "c'est quoi la capitale du Cameroun?" -> {"intent": "chat", "prompt": "c'est quoi la capitale du Cameroun?"}`;

        const payload = {
            contents: [ ...history, { role: "user", parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "intent": { "type": "STRING", "enum": ["chat", "image"] },
                        "prompt": { "type": "STRING" }
                    },
                    required: ["intent", "prompt"]
                }
            }
        };

        const response = await axios.post(apiUrl, payload, { headers: { 'Content-Type': 'application/json' } });
        const jsonText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (jsonText) {
            return JSON.parse(jsonText);
        }
        return { intent: "chat", prompt: userPrompt }; // Fallback

    } catch (error) {
        console.error("Erreur analyzeUserIntent:", error.message);
        return { intent: "chat", prompt: userPrompt };
    }
}


/**
 * Gère la récupération de l'heure
 */
async function getDateTimeForLocation(location) {
    try {
        const apiUrl = getGeminiApiUrl(GEMINI_FLASH_MODEL);
        const userPrompt = `Quelle est l'heure et la date actuelles précises dans la ville de ${location}? Réponds uniquement avec l'heure et la date, sans autres phrases.`;
        const payload = {
            contents: [{ parts: [{ text: userPrompt }] }],
            tools: [{ "google_search": {} }]
        };
        const response = await axios.post(apiUrl, payload, { headers: { 'Content-Type': 'application/json' } });
        let result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (typeof result === 'string' && result.trim()) {
             result = result.replace(/l'heure|actuelle|est|dans|la|ville|de|à|maintenant|il est|le/gi, '').trim();
             return `L'heure et la date actuelles à ${location} sont : ${result}.`;
        }
        const now = new Date();
        return `Je n'ai pas pu obtenir l'heure précise pour ${location}. Voici mon heure locale : ${now.toLocaleTimeString('fr-FR', { timeZoneName: 'long' })}.`;
    } catch (error) {
        console.error("Erreur getDateTimeForLocation:", error.message);
        return `Désolé, une erreur est survenue lors de la tentative de récupération de l'heure pour ${location}.`;
    }
}

/**
 * Gère le nom d'utilisateur
 */
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

/**
 * NOUVEAU: Vérifie le cooldown de l'utilisateur
 */
function checkCooldown(senderID) {
    const now = Date.now();
    if (imageGenCooldown.has(senderID)) {
        const lastGenTime = imageGenCooldown.get(senderID);
        const timeElapsed = now - lastGenTime;
        if (timeElapsed < IMAGE_GEN_COOLDOWN_MS) {
            const timeLeft = Math.ceil((IMAGE_GEN_COOLDOWN_MS - timeElapsed) / 1000);
            return timeLeft; // Retourne le temps restant
        }
    }
    return 0; // Pas de cooldown
}

/**
 * NOUVEAU: Active le cooldown de l'utilisateur
 */
function setCooldown(senderID) {
    imageGenCooldown.set(senderID, Date.now());
    setTimeout(() => {
        imageGenCooldown.delete(senderID);
    }, IMAGE_GEN_COOLDOWN_MS);
}

// =========================================================
// 2. CONFIGURATION ET ONCHAT (Logique principale)
// =========================================================

module.exports = {
  config: {
    name: "gpt5",
    aliases: ['chatgpt'],
    version: 4.1, // Version 4.1 (Cooldown Fix + UI Tweaks)
    author: "Tk Joel (Adapté par Gemini)",
    longDescription: "GPT-5 (Gemini Flash) avec Vision, Génération d'image (Intelligente), Mémoire, Heure mondiale et Recherche.",
    category: "ai",
    guide: {
      en: "{p} [question] (analyse d'image incluse)\n{p} créé une image de... (génère une image)\n{p} /imagine [prompt] (génère une image)\n{p} /time [ville] (donne l'heure)",
    },
  },
  onStart: async function () {},
  onChat: async function ({ api, event, args, message }) {
    
    if (API_KEY === "VOTRE_CLÉ_API_GEMINI_ICI" || !API_KEY) {
        api.sendMessage("❌ Erreur de configuration : La commande 'gpt5' n'a pas de clé API Gemini.", event.threadID);
        return;
    }

    let waitingMessageID = null;
    const userMessageID = event.messageID;
    const senderID = event.senderID;
    const threadID = event.threadID; 
    let prompt = event.body ? event.body.trim() : "";
    let isReplyToBot = false;

    // --- 1. DÉTECTION DE LA GÉNÉRATION (ACCÈS DIRECT) ---
    const imageGenPrefix = ImageGenPrefixes.find((p) => prompt.toLowerCase().startsWith(p));
    if (imageGenPrefix) {
        const imagePrompt = prompt.substring(imageGenPrefix.length).trim();
        if (!imagePrompt) {
            api.sendMessage("Veuillez fournir une description de l'image à générer (ex: /imagine un chaton cybernétique).", threadID);
            return;
        }
        
        // NOUVEAU: Vérification du Cooldown
        const cooldownLeft = checkCooldown(senderID);
        if (cooldownLeft > 0) {
            api.sendMessage(`⏳ Vous avez généré une image récemment. Veuillez patienter encore ${cooldownLeft} secondes. (Limite de 1/min)`, threadID);
            return;
        }
        setCooldown(senderID); // Activer le cooldown
        
        api.setMessageReaction('🎨', userMessageID, (err) => {}, true);
        await handleImageGeneration(api, event, imagePrompt);
        return; 
    }

    // --- 2. DÉTECTION DE L'HORLOGE (ACCÈS DIRECT) ---
    const timePrefix = TimePrefixes.find((p) => prompt.toLowerCase().startsWith(p));
    if (timePrefix) {
        const location = prompt.substring(timePrefix.length).trim();
        if (!location) {
            api.sendMessage("Veuillez spécifier la ville ou le pays (ex: /time Tokyo).", threadID);
            return;
        }
        api.setMessageReaction('⏱️', userMessageID, (err) => {}, true); 
        const timeResult = await getDateTimeForLocation(location);
        api.sendMessage(`🌍 HORLOGE MONDIALE (Via Gemini)\n\n${timeResult}`, threadID);
        api.setMessageReaction('☑️', userMessageID, (err) => {}, true);
        return;
    }

    // --- 3. DÉTECTION DU CHAT (TEXTE / VISION / INTENTION DE GEN) ---
    
    if (event.type === "message_reply" && event.messageReply.senderID === api.getCurrentUserID()) {
         if (botMessageIDs.has(event.messageReply.messageID)) {
              isReplyToBot = true;
         }
    }
    const prefix = Prefixes.find((p) => prompt.toLowerCase().startsWith(p));
    
    if (!isReplyToBot && !prefix) {
      return; 
    }
    
    if (prefix) {
      prompt = prompt.substring(prefix.length).trim();
    }

    // --- DÉBUT DE LA LOGIQUE PRINCIPALE ---
    try {
      
      let imageAttachment = (event.attachments && event.attachments.find(a => a.type === "photo" || a.type === "sticker")) || 
                            (event.messageReply && event.messageReply.attachments && event.messageReply.attachments.find(a => a.type === "photo" || a.type === "sticker"));

      if (!prompt && !imageAttachment && !isReplyToBot) {
          api.sendMessage("Veuillez poser une question, joindre une image, ou répondre à ma conversation. (𝙀́𝙙𝙞𝙩 𝙗𝙮 𝙏𝙠 J𝙤𝙚𝙡 ㋡)", threadID);
          return;
      }
      
      // NOUVEAU: Message d'attente dynamique
      const waitingMessage = imageAttachment 
          ? "💬🧘🏾‍♂| GPT-5 analyse ton image...⏳(𝙀́𝙙𝙞𝙩 𝙗𝙮 𝙏𝙠 𝙅𝙤𝙚𝙡 ㋡)" 
          : "💬🧘🏾‍♂| GPT-5 réfléchit...⏳(𝙀́𝙙𝙞𝙩 𝙗𝙮 𝙏𝙠 𝙅𝙤𝙚𝙡 ㋡)";
      
      api.setMessageReaction('🤖', userMessageID, (err) => {}, true); 
      api.sendMessage(waitingMessage, threadID, (err, info) => {
          if (!err) waitingMessageID = info.messageID;
      });
      
      // NOUVEAU: Analyse d'intention (Chat vs Image)
      if (!isReplyToBot && !imageAttachment && prompt) {
          const analysis = await analyzeUserIntent(prompt, conversationHistory[senderID]);
          
          if (analysis && analysis.intent === 'image') {
              if (waitingMessageID) api.unsendMessage(waitingMessageID);

              // NOUVEAU: Vérification du Cooldown
              const cooldownLeft = checkCooldown(senderID);
              if (cooldownLeft > 0) {
                  api.sendMessage(`⏳ Vous avez généré une image récemment. Veuillez patienter encore ${cooldownLeft} secondes. (Limite de 1/min)`, threadID);
                  return;
              }
              setCooldown(senderID); // Activer le cooldown
              
              api.setMessageReaction('🎨', userMessageID, (err) => {}, true);
              await handleImageGeneration(api, event, analysis.prompt);
              return;
          }
      }

      // --- LOGIQUE DE CHAT & VISION ---
      
      const geminiParts = []; 
      if (imageAttachment) {
          const imageData = await downloadAttachment(imageAttachment.url);
          if (imageData) {
              geminiParts.push({
                  inlineData: {
                      mimeType: imageData.mimeType,
                      data: imageData.base64Data
                  }
              });
          }
      }

      if (!prompt && imageAttachment) {
          prompt = "Tu es un expert. Décris cette image en détail pour moi. Si c'est un exercice (maths, physique...), résous-le.";
      }
      
      geminiParts.push({ text: prompt });
      
      const userName = await getUserName(api, senderID);
      if (!conversationHistory[senderID]) {
          conversationHistory[senderID] = [];
      }

      const currentDate = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
      
      // NOUVEAU: Prompt système mis à jour
      const systemPrompt = 
          `Tu es GPT-5, une IA amicale, serviable et très compétente, basée sur Gemini 2.5 Flash. Ton créateur est Joel, un développeur passionné d'informatique qui vit au Cameroun. Tu dois répondre en Français. ` + 
          `INFORMATION IMPORTANTE : La date actuelle est le ${currentDate}. ` + 
          `Tu as la capacité d'effectuer des recherches sur Internet ET de voir les images qu'on t'envoie. ` + 
          `L'utilisateur actuel s'appelle ${userName}. Tu dois intégrer son nom dans ta réponse de façon naturelle.`;

      const geminiChatHistory = [];
      
      conversationHistory[senderID].slice(-5).forEach(exchange => {
          geminiChatHistory.push({ role: "user", parts: exchange.userParts });
          geminiChatHistory.push({ role: "model", parts: [{ text: exchange.aiResponse }] });
      });
      
      geminiChatHistory.push({
          role: "user",
          parts: geminiParts 
      });

      const apiUrl = getGeminiApiUrl(GEMINI_FLASH_MODEL);
      
      const payload = {
          contents: geminiChatHistory,
          systemInstruction: {
              parts: [{ text: systemPrompt }]
          },
          tools: [{ "google_search": {} }] 
      };
      
      const response = await axios.post(apiUrl, payload, { headers: { 'Content-Type': 'application/json' } });
      
      if (waitingMessageID) api.unsendMessage(waitingMessageID);

      let answer = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (typeof answer !== 'string' || answer.trim() === '') {
          if (response.data?.candidates?.[0]?.finishReason === 'SAFETY') {
              answer = "Désolé, je ne peux pas répondre à cette demande car elle enfreint mes règles de sécurité.";
          } else {
              answer = "Désolé, l'IA (Gemini) a retourné une réponse vide ou illisible.";
          }
      }
      
      conversationHistory[senderID].push({
          userParts: geminiParts, 
          aiResponse: answer,
          timestamp: Date.now()
      });
      
      if (conversationHistory[senderID].length > 10) { 
          conversationHistory[senderID].shift(); 
      }

      // NOUVEAU: Titre de réponse dynamique
      const responseTitle = imageAttachment ? "🤖𝗖𝗛𝗔T 𝗚𝗣𝗧 𝟱 🖼️" : "🤖𝗖𝗛𝗔T 𝗚𝗣𝗧 𝟱";

      const finalAnswer = `━━━━━━━━━━━━━━━━
     ${responseTitle}
━━━━━━━━━━━━━━━━
\n\n${answer}

━━━━━━━ ✕ ━━━━━━━`; 

      api.sendMessage(finalAnswer, threadID, (err, info) => {
          if (!err && info) botMessageIDs.add(info.messageID);
          const reaction = (answer.startsWith("Désolé,")) ? '❌' : '✅';
          api.setMessageReaction(reaction, userMessageID, (err) => {}, true);
      });
      
    } catch (error) {
        console.error("Erreur principale dans onChat (Vision/Texte):", error.message);
        let errorMessage = `❌ Une erreur est survenue avec l'API Gemini. (Code: ${error.code || 'Inconnu'}).`;
        if (error.response) {
            const status = error.response.status;
            const errorData = error.response.data?.error;
            errorMessage = `❌ Erreur de l'API Gemini (HTTP ${status}).`;
            if (status === 400) { errorMessage += "\n\n💡 **Vérification :** Erreur 'Bad Request' (400). L'image envoyée est peut-être corrompue ou trop volumineuse."; }
            else if (status === 401 || status === 403) { errorMessage += `\n\n💡 **Vérification :** L'authentification a échoué. La clé API est invalide.`; }
            else if (status === 429) { errorMessage += `\n\n💡 **Vérification :** Trop de requêtes (429). Limite de l'API atteinte. Veuillez patienter 1 minute.`; }
            if (errorData) { errorMessage += `\n\nMessage: ${errorData.message}`; }
        }
        if (waitingMessageID) api.unsendMessage(waitingMessageID);
        api.sendMessage(errorMessage, event.threadID);
        api.setMessageReaction('❌', userMessageID, (err) => {}, true);
    }
  }
};
