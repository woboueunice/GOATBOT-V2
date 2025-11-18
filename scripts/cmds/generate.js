const axios = require('axios');
const fs = require('fs');
const path = require('path');

// =========================================================
// ⚙️ CONFIGURATION ET CLÉS
// =========================================================

// 🚨 VOTRE CLÉ API (Google AI Studio)
const API_KEY = "AIzaSyAbnxZuCt5Lv3VC4x3sU0PZGphN05alRNs"; 

// Modèle "Nano / Flash Image" (Rapide et efficace)
const MODEL_NAME = 'gemini-2.5-flash-image-preview';

// Protection Anti-Ban (1 requête par minute autorisée par Google)
const COOLDOWN_SECONDS = 65; 
const cooldowns = new Map();

// Dossier temporaire
const tmpFolder = path.resolve(__dirname, 'tmp_gen_images');
if (!fs.existsSync(tmpFolder)) {
    fs.mkdirSync(tmpFolder, { recursive: true });
}

// =========================================================
// 🧠 MOTEUR INTELLIGENT (LOGIQUE & API)
// =========================================================

/**
 * Calcule le temps d'attente restant pour un utilisateur
 */
function getRemainingCooldown(userID) {
    if (!cooldowns.has(userID)) return 0;
    const lastTime = cooldowns.get(userID);
    const now = Date.now();
    const diff = (now - lastTime) / 1000;
    return diff < COOLDOWN_SECONDS ? Math.ceil(COOLDOWN_SECONDS - diff) : 0;
}

/**
 * Analyse les arguments pour trouver le format (--ar)
 * Exemple: "un chat --ar 16:9" -> prompt: "un chat", ratio: "16:9"
 */
function parseArgs(rawArgs) {
    let prompt = rawArgs.join(" ");
    let ratio = "1:1"; // Carré par défaut

    // Détection du ratio (Aspect Ratio)
    const arMatch = prompt.match(/--ar\s+(\d+:\d+)/i);
    if (arMatch) {
        ratio = arMatch[1];
        prompt = prompt.replace(arMatch[0], "").trim();
    }

    return { prompt, ratio };
}

/**
 * Fonction principale de génération via l'API Google
 */
async function generateImage(prompt, aspectRatio) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
    
    // Optimisation du prompt pour le modèle Flash
    // On injecte le ratio directement dans le prompt car Flash Image le comprend mieux ainsi
    const enhancedPrompt = `${prompt}, high resolution, detailed, aspect ratio ${aspectRatio}`;

    const payload = {
        contents: [
            { parts: [{ text: enhancedPrompt }] }
        ],
        generationConfig: {
            responseModalities: ["IMAGE"], // Force le mode image
            temperature: 0.9,             // Créativité maximale
            candidateCount: 1             // 1 seule image pour économiser le quota
        },
        // Réglages de sécurité pour éviter les blocages inutiles sur des demandes artistiques
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
        ]
    };

    const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' }
    });

    const candidate = response.data?.candidates?.[0];

    // Gestion des erreurs de sécurité (Safety Filters)
    if (candidate?.finishReason === 'SAFETY') {
        throw new Error("SAFETY_VIOLATION");
    }

    // Extraction de l'image (Base64)
    const imagePart = candidate?.content?.parts?.find(p => p.inlineData);
    if (!imagePart || !imagePart.inlineData || !imagePart.inlineData.data) {
        throw new Error("NO_IMAGE_DATA");
    }

    return imagePart.inlineData.data;
}

// =========================================================
// 🚀 COMMANDE GOATBOT (ONCHAT)
// =========================================================

module.exports = {
    config: {
        name: "generate",
        aliases: ["gen", "nano", "banana", "img", "dessine"],
        version: "3.0", // Version Pro
        author: "Tk Joel",
        countDown: 5,
        role: 0,
        longDescription: "Génère des images avec Google Gemini Flash (Supporte --ar 16:9).",
        category: "image",
        guide: {
            en: "{p}gen [description] [--ar 16:9]\nEx: {p}gen un lion --ar 16:9"
        }
    },

    onStart: async function() {},

    onChat: async function({ api, event, args }) {
        const { threadID, messageID, senderID } = event;
        
        // 1. Validation de base
        if (args.length === 0) {
            return api.sendMessage("🎨 **Studio Nano (Flash)**\n\nCommandes :\n- `/gen un chat` (Carré)\n- `/gen un paysage --ar 16:9` (Cinéma)\n- `/gen un portrait --ar 9:16` (Story)", threadID, messageID);
        }

        // 2. Vérification du Cooldown (CRUCIAL pour éviter l'erreur 429)
        const waitTime = getRemainingCooldown(senderID);
        if (waitTime > 0) {
            return api.sendMessage(`⏳ **Quota Atteint**\nGoogle limite ce modèle à 1 image/minute.\n\nRevenez dans : **${waitTime} secondes** ⏱️`, threadID, messageID);
        }

        let waitingMessageID = null;

        try {
            // Active le timer immédiatement
            cooldowns.set(senderID, Date.now());

            // Analyse des arguments (Prompt + Ratio)
            const { prompt, ratio } = parseArgs(args);

            // Feedback visuel
            api.setMessageReaction("🎨", messageID, () => {}, true);
            api.sendMessage(`🎨 **Génération en cours...**\nPrompt : "${prompt}"\nFormat : ${ratio}\nModèle : Gemini Nano`, threadID, (err, info) => {
                if (!err) waitingMessageID = info.messageID;
            });

            // 3. Génération
            const base64Data = await generateImage(prompt, ratio);

            // 4. Sauvegarde temporaire
            const fileName = `nano_${senderID}_${Date.now()}.png`;
            const filePath = path.join(tmpFolder, fileName);
            fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

            // 5. Envoi
            if (waitingMessageID) api.unsendMessage(waitingMessageID);

            const msg = {
                body: `✅ **Image Terminée !**\n\n🖌️ **Prompt :** ${prompt}\n📐 **Ratio :** ${ratio}\n👤 **Créateur :** Joel`,
                attachment: fs.createReadStream(filePath)
            };

            api.sendMessage(msg, threadID, (err) => {
                // Nettoyage (Toujours supprimer le fichier après)
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                
                if (err) {
                    api.sendMessage("❌ Erreur d'envoi (Fichier peut-être trop lourd).", threadID);
                } else {
                    api.setMessageReaction("✅", messageID, () => {}, true);
                }
            });

        } catch (error) {
            console.error("Erreur Gen:", error);
            if (waitingMessageID) api.unsendMessage(waitingMessageID);
            api.setMessageReaction("❌", messageID, () => {}, true);

            // Diagnostic intelligent pour Joel
            let reply = "❌ Une erreur inconnue est survenue.";

            if (error.message === "SAFETY_VIOLATION") {
                reply = "🔞 **Censuré**\nGoogle a bloqué ce prompt car il enfreint les règles de sécurité (Violence, Adulte, etc.).";
            } else if (error.response?.status === 429) {
                reply = "🔥 **Surcharge Mondiale**\nLe serveur Google est saturé. Réessaie dans 2 minutes.";
            } else if (error.response?.status === 400) {
                reply = "❌ **Erreur 400**\nLe prompt est invalide.";
            } else if (error.message === "NO_IMAGE_DATA") {
                reply = "⚠️ L'IA a répondu mais n'a pas fourni d'image. Réessaie.";
            }

            api.sendMessage(reply, threadID);
        }
    }
};
