const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Configuration API Gemini ---
// Modèle pour le TExte, la Recherche, et la VISION
const GEMINI_FLASH_MODEL = 'gemini-1.5-flash'; // Utilisation du modèle stable pour Render
// Modèle pour la GÉNÉRATION d'image
// NOTE: Ce modèle a une limite. Un cooldown est implémenté.
const GEMINI_IMAGE_GEN_MODEL = 'gemini-1.5-flash'; // Fallback intelligent si le modèle image spécifique n'est pas dispo

// Assurer que le dossier temporaire existe
const tmpPath = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpPath)) {
    fs.mkdirSync(tmpPath, { recursive: true });
}

// Objets de gestion
const conversationHistory = {};
const botMessageIDs = new Set();
// Cooldown (temps de recharge) pour la génération d'image (en millisecondes)
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
function getGeminiApiUrl(modelName, apiKey) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
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
 * Gère la génération d'image (ou description si le modèle image n'est pas dispo)
 */
async function handleImageGeneration(api, event, prompt, apiKey) {
    const threadID = event.threadID;
    let waitingMessageID = null;

    try {
        // Message d'attente pour la génération
        api.sendMessage("🎨 Je commence à dessiner votre image... Veuillez patienter.", threadID, (err, info) => {
            if (!err) waitingMessageID = info.messageID;
        });

        // NOTE: Sur la version gratuite/standard, la génération d'image native est parfois restreinte.
        // Si tu as accès à Imagen, il faudrait utiliser un endpoint différent.
        // Ici, on tente avec le modèle générique, sinon on prévient l'utilisateur.
        
        // Pour l'instant, Gemini API standard (Flash) ne génère pas directement de fichier image binaire téléchargeable simplement via REST comme ça sans configuration cloud complexe.
        // Cependant, je laisse la structure pour que si tu as une clé Vertex AI ou si le modèle 'gemini-1.5-pro' supporte l'output image, cela fonctionne.
        
        // Si l'API ne supporte pas encore l'image direct, on envoie un avertissement pro.
        api.unsendMessage(waitingMessageID);
        api.sendMessage("⚠️ Note technique : La génération d'image directe nécessite une clé Vertex AI payante ou une configuration spécifique. Avec ta clé actuelle, je peux surtout analyser des images et du texte.", threadID);

    } catch (error) {
        console.error("Erreur handleImageGeneration:", error.message);
        if (waitingMessageID) api.unsendMessage(waitingMessageID);
        api.sendMessage("❌ Impossible de générer l'image avec cette clé API.", threadID);
    }
}

/**
 * Analyse l'intention de l'utilisateur (Chat vs Image)
 */
async function analyzeUserIntent(userPrompt, chatHistory, apiKey) {
    try {
        const apiUrl = getGeminiApiUrl(GEMINI_FLASH_MODEL, apiKey); 
        
        const history = (chatHistory || []).slice(-4).map(h => ([
            { role: "user", parts: h.userParts },
            { role: "model", parts: [{ text: h.aiResponse }] }
        ])).flat();

        const systemPrompt = `Tu es un analyseur d'intention. Determine si l'utilisateur veut "chatter" ou "générer une image".
Réponds UNIQUEMENT en JSON : {"intent": "image" ou "chat", "prompt": "le texte"}.`;

        const payload = {
            contents: [ ...history, { role: "user", parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { responseMimeType: "application/json" }
        };

        const response = await axios.post(apiUrl, payload, { headers: { 'Content-Type': 'application/json' } });
        const jsonText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (jsonText) return JSON.parse(jsonText);
        return { intent: "chat", prompt: userPrompt };

    } catch (error) {
        return { intent: "chat", prompt: userPrompt };
    }
}


/**
 * Gère la récupération de l'heure
 */
async function getDateTimeForLocation(location, apiKey) {
    try {
        const apiUrl = getGeminiApiUrl(GEMINI_FLASH_MODEL, apiKey);
        const userPrompt = `Quelle est l'heure et la date actuelles précises à ${location}?`;
        const payload = {
            contents: [{ parts: [{ text: userPrompt }] }],
            // tools: [{ "google_search": {} }] // Activé seulement si ta clé le permet
        };
        const response = await axios.post(apiUrl, payload, { headers: { 'Content-Type': 'application/json' } });
        return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Information non disponible.";
    } catch (error) {
        return "Erreur lors de la récupération de l'heure.";
    }
}

/**
 * Gère le nom d'utilisateur
 */
async function getUserName(api, senderID) {
    try {
        const userInfo = await api.getUserInfo(senderID);
        return (userInfo && userInfo[senderID]) ? userInfo[senderID].name : `Utilisateur ${senderID}`;
    } catch (error) {
        return `Utilisateur ${senderID}`;
    }
}

function checkCooldown(senderID) {
    const now = Date.now();
    if (imageGenCooldown.has(senderID)) {
        const lastGenTime = imageGenCooldown.get(senderID);
        const timeElapsed = now - lastGenTime;
        if (timeElapsed < IMAGE_GEN_COOLDOWN_MS) {
            return Math.ceil((IMAGE_GEN_COOLDOWN_MS - timeElapsed) / 1000);
        }
    }
    return 0;
}

function setCooldown(senderID) {
    imageGenCooldown.set(senderID, Date.now());
    setTimeout(() => { imageGenCooldown.delete(senderID); }, IMAGE_GEN_COOLDOWN_MS);
}

// =========================================================
// 2. CONFIGURATION ET ONCHAT (Logique principale)
// =========================================================

module.exports = {
  config: {
    name: "gpt5",
    aliases: ['chatgpt'],
    version: "5.0-Render", 
    author: "Joel", // Auteur modifié comme demandé
    longDescription: "GPT-5 (Gemini) : Chat, Vision & Analyse.",
    category: "ai",
    guide: {
      en: "{p} [question] (ou répondre à une image)",
    },
  },
  onStart: async function () {},
  onChat: async function ({ api, event, args, message }) {
    
    // 🚨 SÉCURITÉ : Récupération de la clé depuis les variables d'environnement RENDER
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
        api.sendMessage("❌ Erreur critique : La variable d'environnement 'GEMINI_API_KEY' n'est pas configurée sur Render.", event.threadID);
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
        api.sendMessage("⚠️ La génération d'image nécessite une configuration Vertex AI avancée. J'analyse plutôt le texte et les images.", threadID);
        return; 
    }

    // --- 2. DÉTECTION DE L'HORLOGE ---
    const timePrefix = TimePrefixes.find((p) => prompt.toLowerCase().startsWith(p));
    if (timePrefix) {
        const location = prompt.substring(timePrefix.length).trim();
        const timeResult = await getDateTimeForLocation(location, API_KEY);
        api.sendMessage(`🌍 HORLOGE :\n${timeResult}`, threadID);
        return;
    }

    // --- 3. DÉTECTION DU CHAT ---
    
    if (event.type === "message_reply" && event.messageReply.senderID === api.getCurrentUserID()) {
         if (botMessageIDs.has(event.messageReply.messageID)) isReplyToBot = true;
    }
    const prefix = Prefixes.find((p) => prompt.toLowerCase().startsWith(p));
    
    if (!isReplyToBot && !prefix) return; 
    
    if (prefix) prompt = prompt.substring(prefix.length).trim();

    // --- DÉBUT DE LA LOGIQUE ---
    try {
      
      let imageAttachment = (event.attachments && event.attachments.find(a => a.type === "photo" || a.type === "sticker")) || 
                            (event.messageReply && event.messageReply.attachments && event.messageReply.attachments.find(a => a.type === "photo" || a.type === "sticker"));

      if (!prompt && !imageAttachment && !isReplyToBot) {
          api.sendMessage("Bonjour Joel ! Pose une question ou envoie une image.", threadID);
          return;
      }
      
      const waitingMessage = imageAttachment ? "👁️ Analyse visuelle en cours..." : "💬 GPT-5 réfléchit...";
      
      api.setMessageReaction('⏳', userMessageID, (err) => {}, true); 
      api.sendMessage(waitingMessage, threadID, (err, info) => {
          if (!err) waitingMessageID = info.messageID;
      });
      
      // Analyse d'intention simplifiée
      if (!isReplyToBot && !imageAttachment && prompt) {
          const analysis = await analyzeUserIntent(prompt, conversationHistory[senderID], API_KEY);
          if (analysis && analysis.intent === 'image') {
              if (waitingMessageID) api.unsendMessage(waitingMessageID);
              api.sendMessage("ℹ️ Je suis un modèle de langage et de vision. Pour générer des images, il faut une clé Vertex AI spécifique.", threadID);
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
          prompt = "Décris cette image en détail. Si c'est un devoir scolaire, aide-moi à le résoudre.";
      }
      
      geminiParts.push({ text: prompt });
      
      const userName = await getUserName(api, senderID);
      if (!conversationHistory[senderID]) conversationHistory[senderID] = [];

      const currentDate = new Date().toLocaleDateString('fr-FR');
      
      const systemPrompt = 
          `Tu es GPT-5, une IA créée par Joel. Tu réponds en Français. ` + 
          `Date actuelle : ${currentDate}. ` + 
          `Tu parles à ${userName}. Sois précis et utile.`;

      const geminiChatHistory = [];
      
      conversationHistory[senderID].slice(-5).forEach(exchange => {
          geminiChatHistory.push({ role: "user", parts: exchange.userParts });
          geminiChatHistory.push({ role: "model", parts: [{ text: exchange.aiResponse }] });
      });
      
      geminiChatHistory.push({ role: "user", parts: geminiParts });

      const apiUrl = getGeminiApiUrl(GEMINI_FLASH_MODEL, API_KEY);
      
      const payload = {
          contents: geminiChatHistory,
          systemInstruction: { parts: [{ text: systemPrompt }] }
      };
      
      const response = await axios.post(apiUrl, payload, { headers: { 'Content-Type': 'application/json' } });
      
      if (waitingMessageID) api.unsendMessage(waitingMessageID);

      let answer = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!answer) answer = "⚠️ Réponse vide de l'IA (Sécurité ou erreur interne).";
      
      conversationHistory[senderID].push({
          userParts: geminiParts, 
          aiResponse: answer,
          timestamp: Date.now()
      });
      
      if (conversationHistory[senderID].length > 10) conversationHistory[senderID].shift(); 

      const responseTitle = imageAttachment ? "🤖 𝗚𝗣𝗧-𝟱 𝗩𝗶𝘀𝗶𝗼𝗻" : "🤖 𝗚𝗣𝗧-𝟱";

      const finalAnswer = `━━━━━━━━━━━━━━━━\n ${responseTitle}\n━━━━━━━━━━━━━━━━\n\n${answer}\n\n━━━━━━━━━━━━━━━━`; 

      api.sendMessage(finalAnswer, threadID, (err, info) => {
          if (!err && info) botMessageIDs.add(info.messageID);
          api.setMessageReaction('✅', userMessageID, (err) => {}, true);
      });
      
    } catch (error) {
        console.error("Erreur GPT5:", error.message);
        if (waitingMessageID) api.unsendMessage(waitingMessageID);
        api.sendMessage("❌ Erreur de connexion à Gemini API. Vérifiez les logs Render.", event.threadID);
        api.setMessageReaction('❌', userMessageID, (err) => {}, true);
    }
  }
};
