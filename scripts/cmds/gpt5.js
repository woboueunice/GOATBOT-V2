const axios = require('axios');
const fs = require('fs');
const path = require('path');

// =========================================================
// ⚙️ CONFIGURATION INTERNE
// =========================================================

// Modèle officiel et stable (Évite les erreurs 404)
const GEMINI_MODEL = 'gemini-1.5-flash';

// Dossier temporaire (sécurité)
const tmpPath = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath, { recursive: true });

// Mémoire de conversation (par utilisateur)
const conversationHistory = {};

// Préfixes acceptés pour appeler le bot
const Prefixes = ['gpt5', 'chatgpt', 'bot', 'ia'];

// =========================================================
// 🛠️ FONCTIONS UTILITAIRES
// =========================================================

/**
 * Télécharge une image et la convertit en Base64 pour Gemini
 */
async function downloadImageToBase64(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        const mime = response.headers['content-type'];
        return { inlineData: { mimeType: mime, data: base64 } };
    } catch (e) {
        console.error("Erreur téléchargement image:", e);
        return null;
    }
}

/**
 * Récupère le nom de l'utilisateur pour personnaliser la réponse
 */
async function getUserName(api, uid) {
    try {
        const info = await api.getUserInfo(uid);
        return info[uid]?.name || "Utilisateur";
    } catch { return "Ami"; }
}

// =========================================================
// 🚀 COMMANDE PRINCIPALE
// =========================================================

module.exports = {
    config: {
        name: "gpt5",
        version: "6.0-Final",
        author: "Joel", // Crédit auteur
        countDown: 5,
        role: 0,
        shortDescription: "IA Multimodale (Texte & Vision)",
        longDescription: "Discute avec Gemini, analyse des images et résout des problèmes.",
        category: "ai",
        guide: "{pn} <question> ou réponds à une photo"
    },

    onStart: async function ({ message }) {
        message.reply("Le module Gemini GPT-5 est actif. Utilisez 'gpt5 <message>' pour discuter.");
    },

    onChat: async function ({ api, event, message }) {
        const { body, senderID, threadID, messageID, type, messageReply, attachments } = event;

        // 1. FILTRE : Est-ce que l'utilisateur s'adresse au bot ?
        let prompt = body ? body.trim() : "";
        const triggerWord = Prefixes.find(p => prompt.toLowerCase().startsWith(p));
        
        let isReplyToBot = false;
        if (type === "message_reply" && messageReply.senderID === api.getCurrentUserID()) {
            isReplyToBot = true;
        }

        // Si ce n'est ni une commande (gpt5...), ni une réponse au bot, on ignore.
        if (!triggerWord && !isReplyToBot) return;

        // Nettoyage du prompt (enlever "gpt5")
        if (triggerWord) prompt = prompt.slice(triggerWord.length).trim();

        // 2. VÉRIFICATION CLÉ API (RENDER)
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return message.reply("❌ ERREUR CONFIGURATION : La clé 'GEMINI_API_KEY' est absente des variables Render.");
        }

        // 3. GESTION DES IMAGES (Vision)
        // Cas A : L'utilisateur envoie une image AVEC le message
        let targetImage = attachments && attachments.find(a => a.type === "photo");
        // Cas B : L'utilisateur RÉPOND à une image
        if (!targetImage && type === "message_reply" && messageReply.attachments) {
            targetImage = messageReply.attachments.find(a => a.type === "photo");
        }

        // Si pas de texte et pas d'image, on demande quoi faire
        if (!prompt && !targetImage && !isReplyToBot) {
            return message.reply("Bonjour Joel ! Envoie-moi une question ou une image à analyser.");
        }

        // 4. PRÉPARATION DE LA REQUÊTE
        message.reaction("⏳"); // Réaction "Sablier" pour dire "Je réfléchis"
        
        // Initialisation de l'historique utilisateur si vide
        if (!conversationHistory[senderID]) conversationHistory[senderID] = [];

        // Construction du contenu pour Gemini
        const contentParts = [];
        
        // Ajout de l'image si présente
        if (targetImage) {
            const imageData = await downloadImageToBase64(targetImage.url);
            if (imageData) contentParts.push(imageData);
            if (!prompt) prompt = "Décris cette image en détail. Si c'est un exercice, donne la solution.";
        }

        // Ajout du texte
        if (prompt) contentParts.push({ text: prompt });

        // Contexte Système (Personnalité)
        const userName = await getUserName(api, senderID);
        const date = new Date().toLocaleDateString("fr-FR");
        const systemPrompt = `Tu es GPT-5, une IA intelligente créée par Joel au Cameroun. 
        Date: ${date}. Interlocuteur: ${userName}.
        Réponds toujours en Français, de manière claire, précise et utile.
        Si on t'envoie une image, analyse-la en profondeur.`;

        // Assemblage de l'historique pour le contexte
        const fullPayload = {
            contents: [
                ...conversationHistory[senderID], // Passé
                { role: "user", parts: contentParts } // Présent
            ],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        };

        // 5. ENVOI À GOOGLE (API REQUEST)
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
            const { data } = await axios.post(url, fullPayload);

            // Récupération de la réponse
            const aiResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (!aiResponse) throw new Error("Réponse vide de l'API");

            // Sauvegarde dans l'historique (Rotation: max 6 échanges)
            conversationHistory[senderID].push({ role: "user", parts: contentParts });
            conversationHistory[senderID].push({ role: "model", parts: [{ text: aiResponse }] });
            if (conversationHistory[senderID].length > 12) conversationHistory[senderID] = conversationHistory[senderID].slice(-6);

            // Mise en forme
            const finalMessage = `🤖 𝗚𝗣𝗧-𝟱 (Gemini)\n━━━━━━━━━━━━━━━━\n\n${aiResponse}\n\n━━━━━━━━━━━━━━━━\n👤 Maître: Joel`;

            // 6. ENVOI DE LA RÉPONSE (Avec délai anti-ban)
            setTimeout(() => {
                message.reply(finalMessage, (err) => {
                    if (!err) message.reaction("✅");
                });
            }, 2000); // Pause de 2 secondes

        } catch (error) {
            console.error("Erreur Gemini:", error.response?.data || error.message);
            
            let errorMsg = "❌ Erreur de connexion.";
            const status = error.response?.status;

            if (status === 400) errorMsg = "❌ Requête invalide (400). Vérifie que ta clé sur Render n'a pas d'espace en trop.";
            else if (status === 403) errorMsg = "⛔ Accès refusé (403). La clé est peut-être mal configurée (localisation/facturation).";
            else if (status === 404) errorMsg = "⚠️ Modèle introuvable (404). Google a changé les noms, contacte le dev.";
            else if (status === 429) errorMsg = "⏳ Trop de demandes (429). Attends un peu.";

            message.reply(errorMsg);
            message.reaction("❌");
        }
    }
};
