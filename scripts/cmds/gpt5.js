const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Configuration API Gemini ---
const GEMINI_FLASH_MODEL = 'gemini-1.5-flash'; 
const GEMINI_IMAGE_GEN_MODEL = 'gemini-1.5-flash'; 

// Assurer que le dossier temporaire existe
const tmpPath = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpPath)) {
    fs.mkdirSync(tmpPath, { recursive: true });
}

// Objets de gestion
const conversationHistory = {};
const botMessageIDs = new Set();
// Cooldown pour éviter le spam
const IMAGE_GEN_COOLDOWN_MS = 60000; 
const imageGenCooldown = new Map();

// --- Préfixes ---
const Prefixes = ['gpt5', 'chatgpt', '.gpt5', 'g5'];
const TimePrefixes = ['/time', '/heure'];
const ImageGenPrefixes = ['/imagine', '/dessine', '/gen'];

// =========================================================
// 1. FONCTIONS UTILITAIRES
// =========================================================

function getGeminiApiUrl(modelName, apiKey) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
}

async function downloadAttachment(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const base64Data = Buffer.from(response.data, 'binary').toString('base64');
        const mimeType = response.headers['content-type'];
        return { base64Data, mimeType };
    } catch (error) {
        console.error("Erreur téléchargement:", error.message);
        return null;
    }
}

async function handleImageGeneration(api, event, prompt, apiKey) {
    // (Fonction simplifiée pour l'exemple, nécessite config Vertex AI pour vraie image)
    api.sendMessage("⚠️ Note : La création d'image directe nécessite une configuration Vertex AI. J'analyse plutôt le texte et les images pour le moment.", event.threadID);
}

async function analyzeUserIntent(userPrompt, chatHistory, apiKey) {
    try {
        const apiUrl = getGeminiApiUrl(GEMINI_FLASH_MODEL, apiKey); 
        const history = (chatHistory || []).slice(-4).map(h => ([
            { role: "user", parts: h.userParts },
            { role: "model", parts: [{ text: h.aiResponse }] }
        ])).flat();

        const systemPrompt = `Analyse l'intention. JSON: {"intent": "image" ou "chat"}`;
        const payload = {
            contents: [ ...history, { role: "user", parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { responseMimeType: "application/json" }
        };

        const response = await axios.post(apiUrl, payload, { headers: { 'Content-Type': 'application/json' } });
        const jsonText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (jsonText) return JSON.parse(jsonText);
        return { intent: "chat" };
    } catch (error) { return { intent: "chat" }; }
}

async function getDateTimeForLocation(location, apiKey) {
    try {
        const apiUrl = getGeminiApiUrl(GEMINI_FLASH_MODEL, apiKey);
        const userPrompt = `Quelle est l'heure et la date à ${location}?`;
        const payload = { contents: [{ parts: [{ text: userPrompt }] }] };
        const response = await axios.post(apiUrl, payload, { headers: { 'Content-Type': 'application/json' } });
        return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Info indisponible.";
    } catch (error) { return "Erreur horloge."; }
}

async function getUserName(api, senderID) {
    try {
        const userInfo = await api.getUserInfo(senderID);
        return (userInfo && userInfo[senderID]) ? userInfo[senderID].name : `Utilisateur`;
    } catch (error) { return `Utilisateur`; }
}

function checkCooldown(senderID) {
    const now = Date.now();
    if (imageGenCooldown.has(senderID)) {
        const timeElapsed = now - imageGenCooldown.get(senderID);
        if (timeElapsed < IMAGE_GEN_COOLDOWN_MS) return Math.ceil((IMAGE_GEN_COOLDOWN_MS - timeElapsed) / 1000);
    }
    return 0;
}

function setCooldown(senderID) {
    imageGenCooldown.set(senderID, Date.now());
    setTimeout(() => { imageGenCooldown.delete(senderID); }, IMAGE_GEN_COOLDOWN_MS);
}

// =========================================================
// 2. LOGIQUE PRINCIPALE (AVEC DIAGNOSTIC)
// =========================================================

module.exports = {
  config: {
    name: "gpt5",
    aliases: ['chatgpt'],
    version: "5.2-Debug", 
    author: "Joel",
    longDescription: "GPT-5 (Gemini) : Chat, Vision & Analyse.",
    category: "ai",
    guide: { en: "{p} [question]" },
  },
  onStart: async function () {},
  onChat: async function ({ api, event, args, message }) {
    
    // 1. Définition des variables de base
    const userMessageID = event.messageID;
    const senderID = event.senderID;
    const threadID = event.threadID; 
    let prompt = event.body ? event.body.trim() : "";
    let isReplyToBot = false;

    // 2. DÉTECTION : Est-ce que l'utilisateur parle au bot ?
    const imageGenPrefix = ImageGenPrefixes.find((p) => prompt.toLowerCase().startsWith(p));
    const timePrefix = TimePrefixes.find((p) => prompt.toLowerCase().startsWith(p));
    if (event.type === "message_reply" && event.messageReply.senderID === api.getCurrentUserID()) {
         if (botMessageIDs.has(event.messageReply.messageID)) isReplyToBot = true;
    }
    const prefix = Prefixes.find((p) => prompt.toLowerCase().startsWith(p));

    // 🛑 FILTRE : Si ce n'est pas pour le bot, on arrête ici.
    if (!imageGenPrefix && !timePrefix && !isReplyToBot && !prefix) {
        return; 
    }

    // 🔐 3. VÉRIFICATION CLÉ API
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        return api.sendMessage("❌ Erreur critique : La variable d'environnement 'GEMINI_API_KEY' n'est pas configurée sur Render.", threadID);
    }

    // --- 4. EXÉCUTION ---

    if (imageGenPrefix) {
        api.sendMessage("⚠️ La génération d'image nécessite une configuration Vertex AI avancée.", threadID);
        return; 
    }

    if (timePrefix) {
        const location = prompt.substring(timePrefix.length).trim();
        const timeResult = await getDateTimeForLocation(location, API_KEY);
        api.sendMessage(`🌍 HORLOGE :\n${timeResult}`, threadID);
        return;
    }

    if (prefix) prompt = prompt.substring(prefix.length).trim();

    try {
      let imageAttachment = (event.attachments && event.attachments.find(a => a.type === "photo" || a.type === "sticker")) || 
                            (event.messageReply && event.messageReply.attachments && event.messageReply.attachments.find(a => a.type === "photo" || a.type === "sticker"));

      if (!prompt && !imageAttachment && !isReplyToBot) {
          return api.sendMessage("Bonjour Joel ! Pose une question ou envoie une image.", threadID);
      }
      
      const waitingMessage = imageAttachment ? "👁️ Analyse visuelle..." : "💬 GPT-5 réfléchit...";
      
      api.setMessageReaction('⏳', userMessageID, (err) => {}, true); 
      let waitingMessageID = null;
      api.sendMessage(waitingMessage, threadID, (err, info) => { if (!err) waitingMessageID = info.messageID; });
      
      // Analyse
      const geminiParts = []; 
      if (imageAttachment) {
          const imageData = await downloadAttachment(imageAttachment.url);
          if (imageData) {
              geminiParts.push({ inlineData: { mimeType: imageData.mimeType, data: imageData.base64Data } });
          }
      }

      if (!prompt && imageAttachment) prompt = "Décris cette image en détail.";
      geminiParts.push({ text: prompt });
      
      const userName = await getUserName(api, senderID);
      if (!conversationHistory[senderID]) conversationHistory[senderID] = [];

      const currentDate = new Date().toLocaleDateString('fr-FR');
      const systemPrompt = `Tu es GPT-5, IA créée par Joel. Date: ${currentDate}. Utilisateur: ${userName}. Réponds en Français, sois utile et précis.`;

      const geminiChatHistory = [];
      conversationHistory[senderID].slice(-5).forEach(exchange => {
          geminiChatHistory.push({ role: "user", parts: exchange.userParts });
          geminiChatHistory.push({ role: "model", parts: [{ text: exchange.aiResponse }] });
      });
      geminiChatHistory.push({ role: "user", parts: geminiParts });

      const apiUrl = getGeminiApiUrl(GEMINI_FLASH_MODEL, API_KEY);
      const payload = { contents: geminiChatHistory, systemInstruction: { parts: [{ text: systemPrompt }] } };
      
      const response = await axios.post(apiUrl, payload, { headers: { 'Content-Type': 'application/json' } });
      
      if (waitingMessageID) api.unsendMessage(waitingMessageID);

      let answer = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ Erreur interne Gemini.";
      
      conversationHistory[senderID].push({ userParts: geminiParts, aiResponse: answer, timestamp: Date.now() });
      if (conversationHistory[senderID].length > 10) conversationHistory[senderID].shift(); 

      const responseTitle = imageAttachment ? "🤖 𝗚𝗣𝗧-𝟱 𝗩𝗶𝘀𝗶𝗼𝗻" : "🤖 𝗚𝗣𝗧-𝟱";
      const finalAnswer = `━━━━━━━━━━━━━━━━\n ${responseTitle}\n━━━━━━━━━━━━━━━━\n\n${answer}\n\n━━━━━━━━━━━━━━━━`; 

      api.sendMessage(finalAnswer, threadID, (err, info) => {
          if (!err && info) botMessageIDs.add(info.messageID);
          api.setMessageReaction('✅', userMessageID, (err) => {}, true);
      });
      
    } catch (error) {
        // --- DIAGNOSTIC D'ERREUR ---
        const errData = error.response ? error.response.data : null;
        const errStatus = error.response ? error.response.status : "Inconnu";
        
        let msg = `❌ Erreur Google (Code: ${errStatus})\n`;
        
        if (errStatus === 400) {
            msg += "⚠️ Clé API invalide ou requête mal formée. (Vérifie qu'il n'y a pas d'espace avant/après la clé sur Render)";
        } else if (errStatus === 403) {
            msg += "⛔ Permission refusée. (Ta clé est peut-être bannie ou mal configurée dans Google AI Studio)";
        } else if (errStatus === 429) {
            msg += "⏳ Trop de demandes. (Quota gratuit dépassé, attends 2 minutes)";
        } else if (errData && errData.error && errData.error.message) {
            msg += `Détail : ${errData.error.message}`;
        } else {
            msg += `Détail : ${error.message}`;
        }

        console.error("ERREUR GEMINI:", error);
        api.sendMessage(msg, threadID);
        api.setMessageReaction('❌', userMessageID, (err) => {}, true);
    }
  }
};
