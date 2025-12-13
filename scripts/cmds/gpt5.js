const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Configuration API Gemini ---
// ✅ CORRECTION ICI : On utilise le nom complet et stable
const GEMINI_FLASH_MODEL = 'gemini-1.5-flash-latest'; 
const GEMINI_IMAGE_GEN_MODEL = 'gemini-1.5-flash-latest'; 

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
// 2. LOGIQUE PRINCIPALE (AVEC PROTECTION ANTI-SPAM)
// =========================================================

module.exports = {
  config: {
    name: "gpt5",
    aliases: ['chatgpt'],
    version: "5.3-Stable", 
    author: "Joel",
    longDescription: "GPT-5 (Gemini) : Chat, Vision & Analyse.",
    category: "ai",
    guide: { en: "{p} [question]" },
  },
  onStart: async function () {},
  onChat: async function ({ api, event, args, message }) {
    
    // 1. Définition des variables
    const userMessageID = event.messageID;
    const senderID = event.senderID;
    const threadID = event.threadID; 
    let prompt = event.body ? event.body.trim() : "";
    let isReplyToBot = false;

    // 2. DÉTECTION
    const imageGenPrefix = ImageGenPrefixes.find((p) => prompt.toLowerCase().startsWith(p));
    const timePrefix = TimePrefixes.find((p) => prompt.toLowerCase().startsWith(p));
    if (event.type === "message_reply" && event.messageReply.senderID === api.getCurrentUserID()) {
         if (botMessageIDs.has(event.messageReply.messageID)) isReplyToBot = true;
    }
    const prefix = Prefixes.find((p) => prompt.toLowerCase().startsWith(p));

    // 🛑 FILTRE
    if (!imageGenPrefix && !timePrefix && !isReplyToBot && !prefix) return; 

    // 🔐 3. VÉRIFICATION CLÉ API
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        return api.sendMessage("❌ Erreur : Clé API manquante dans Render.", threadID);
    }

    // --- 4. EXÉCUTION ---

    if (imageGenPrefix) {
        api.sendMessage("⚠️ La génération d'image nécessite une clé Vertex AI.", threadID);
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
          return api.sendMessage("Bonjour Joel ! Pose une question.", threadID);
      }
      
      // Message d'attente
      api.setMessageReaction('⏳', userMessageID, (err) => {}, true); 
      
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
      const systemPrompt = `Tu es GPT-5, IA créée par Joel. Date: ${currentDate}. Utilisateur: ${userName}. Réponds en Français.`;

      const geminiChatHistory = [];
      conversationHistory[senderID].slice(-5).forEach(exchange => {
          geminiChatHistory.push({ role: "user", parts: exchange.userParts });
          geminiChatHistory.push({ role: "model", parts: [{ text: exchange.aiResponse }] });
      });
      geminiChatHistory.push({ role: "user", parts: geminiParts });

      const apiUrl = getGeminiApiUrl(GEMINI_FLASH_MODEL, API_KEY);
      const payload = { contents: geminiChatHistory, systemInstruction: { parts: [{ text: systemPrompt }] } };
      
      const response = await axios.post(apiUrl, payload, { headers: { 'Content-Type': 'application/json' } });

      let answer = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ Erreur interne Gemini.";
      
      conversationHistory[senderID].push({ userParts: geminiParts, aiResponse: answer, timestamp: Date.now() });
      if (conversationHistory[senderID].length > 10) conversationHistory[senderID].shift(); 

      const responseTitle = imageAttachment ? "🤖 𝗚𝗣𝗧-𝟱 𝗩𝗶𝘀𝗶𝗼𝗻" : "🤖 𝗚𝗣𝗧-𝟱";
      const finalAnswer = `━━━━━━━━━━━━━━━━\n ${responseTitle}\n━━━━━━━━━━━━━━━━\n\n${answer}\n\n━━━━━━━━━━━━━━━━`; 

      // 🛑 PROTECTION ANTI-SPAM (Délai 2s)
      setTimeout(() => {
          api.sendMessage(finalAnswer, threadID, (err, info) => {
              if (!err && info) botMessageIDs.add(info.messageID);
              api.setMessageReaction('✅', userMessageID, (err) => {}, true);
          });
      }, 2000); 
      
    } catch (error) {
        // --- DIAGNOSTIC CORRIGÉ ---
        const errStatus = error.response ? error.response.status : "Inconnu";
        let msg = `❌ Erreur Google (Code: ${errStatus})\n`;
        
        if (errStatus === 404) {
             msg += "⚠️ Modèle introuvable. Essaie de changer 'gemini-1.5-flash-latest' par 'gemini-pro' dans le code.";
        } else if (errStatus === 400) {
            msg += "⚠️ Requête invalide (Vérifie la clé sur Render, attention aux espaces).";
        } else {
            msg += `Détail : ${error.message}`;
        }

        console.error("ERREUR GEMINI:", error.message);
        api.sendMessage(msg, threadID);
        api.setMessageReaction('❌', userMessageID, (err) => {}, true);
    }
  }
};
