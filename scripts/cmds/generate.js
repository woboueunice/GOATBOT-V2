const axios = require('axios');
const fs = require('fs');
const path = require('path');

// =========================================================
// ⚙️ CONFIGURATION
// =========================================================

// ⚠️ TA CLÉ API (Celle que tu m'as donnée pour le test)
const API_KEY = "AIzaSyAbnxZuCt5Lv3VC4x3sU0PZGphN05alRNs"; 

// Nom du modèle d'image Google (Essai avec la version Imagen 3)
// Si cela échoue, c'est que ta clé n'a pas encore l'accès à ce modèle spécifique.
const MODEL_NAME = 'imagen-3.0-generate-001';

// Dossier temporaire pour les images
const tmpFolder = path.resolve(__dirname, 'tmp_gen_images');
if (!fs.existsSync(tmpFolder)) {
    fs.mkdirSync(tmpFolder, { recursive: true });
}

// Temps d'attente (60 secondes pour éviter le blocage Google)
const COOLDOWN_SECONDS = 60; 
const cooldowns = new Map();

// =========================================================
// 🧠 LOGIQUE
// =========================================================

function checkCooldown(userID) {
    if (!cooldowns.has(userID)) return 0;
    const lastTime = cooldowns.get(userID);
    const timePassed = (Date.now() - lastTime) / 1000;
    if (timePassed < COOLDOWN_SECONDS) return Math.ceil(COOLDOWN_SECONDS - timePassed);
    return 0;
}

async function generateImage(prompt) {
    // Endpoint spécifique pour la génération (Predict)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:predict?key=${API_KEY}`;
    
    // Structure des données pour Imagen
    const payload = {
        instances: [
            { prompt: prompt }
        ],
        parameters: {
            sampleCount: 1,
            aspectRatio: "1:1"
        }
    };

    try {
        console.log(`[INFO] Envoi de la demande à Google pour : "${prompt}"...`);
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        // Analyse de la réponse
        const predictions = response.data?.predictions;
        
        if (!predictions || predictions.length === 0) {
            throw new Error("NO_PREDICTION_DATA");
        }

        // Google renvoie souvent l'image dans 'bytesBase64Encoded'
        const base64Image = predictions[0]?.bytesBase64Encoded || predictions[0]?.image?.bytesBase64Encoded;

        if (!base64Image) {
            throw new Error("IMAGE_DATA_MISSING");
        }

        return base64Image;

    } catch (error) {
        // Affichage de l'erreur exacte dans la console pour le débogage
        if (error.response) {
            console.error(`[ERREUR API] Status: ${error.response.status}`);
            console.error(`[ERREUR API] Message: ${JSON.stringify(error.response.data)}`);
        } else {
            console.error("[ERREUR CODE]", error.message);
        }
        throw error;
    }
}

// =========================================================
// 🚀 COMMANDE
// =========================================================

module.exports = {
    config: {
        name: "generate",
        aliases: ["gen", "img"],
        version: "3.0 Beta",
        author: "Joel",
        countDown: 5,
        role: 0,
        description: "Génère une image via Google Imagen",
        category: "IA",
        guide: "{p}gen un chat bleu"
    },

    onStart: async function() {},

    onChat: async function({ api, event, args }) {
        const { threadID, messageID, senderID } = event;
        const prompt = args.join(" ").trim();

        if (!prompt) return api.sendMessage("❌ Il faut décrire l'image !", threadID, messageID);

        const timeLeft = checkCooldown(senderID);
        if (timeLeft > 0) return api.sendMessage(`⏳ Attends ${timeLeft}s...`, threadID, messageID);

        let waitMsgID = null;
        
        try {
            cooldowns.set(senderID, Date.now());
            
            api.sendMessage(`🎨 **Génération...**\n"${prompt}"`, threadID, (err, info) => {
                if (!err) waitMsgID = info.messageID;
            });

            const base64Data = await generateImage(prompt);
            
            const fileName = `img_${Date.now()}.png`;
            const filePath = path.join(tmpFolder, fileName);
            fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

            if (waitMsgID) api.unsendMessage(waitMsgID);

            const msg = {
                body: `✅ Image générée pour : ${prompt}`,
                attachment: fs.createReadStream(filePath)
            };

            api.sendMessage(msg, threadID, () => fs.unlinkSync(filePath));

        } catch (error) {
            if (waitMsgID) api.unsendMessage(waitMsgID);
            
            let userMsg = "❌ Erreur lors de la génération.";
            
            // Gestion des erreurs courantes pour t'aider
            if (error.response?.status === 404) {
                userMsg = "⚠️ **Modèle non trouvé**\nLe modèle `imagen-3.0` n'est pas activé sur cette clé API. Google restreint parfois l'accès.";
            } else if (error.response?.status === 403) {
                userMsg = "⛔ **Accès Refusé**\nTa clé API n'a pas la permission (Billing requis ou restriction géographique).";
            }

            api.sendMessage(userMsg, threadID);
        }
    }
};
    
