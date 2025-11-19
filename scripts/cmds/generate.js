const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports.config = {
    name: "generate",
    version: "3.5.0",
    hasPermssion: 0,
    credits: "Joel",
    description: "Génère une image via Google Imagen 3 (API Officielle)",
    commandCategory: "image",
    usages: "[description]",
    cooldowns: 10, // Google impose des limites, on met 10s
    aliases: ["gen", "img", "dessine"]
};

// Dossier temporaire
const tmpFolder = path.resolve(__dirname, 'tmp_gen_images');
if (!fs.existsSync(tmpFolder)) {
    fs.mkdirSync(tmpFolder, { recursive: true });
}

// ⚠️ METS TA CLÉ ICI (Garde-la secrète)
const API_KEY = "TA_CLE_API_ICI"; 

module.exports.onStart = async function({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const prompt = args.join(" ");

    // 1. Vérification : L'utilisateur a-t-il mis un texte ?
    if (!prompt) {
        return api.sendMessage("🎨 **Studio Imagen**\n\nVeuillez décrire l'image.\nExemple : `.gen un lion rouge futuriste`", threadID, messageID);
    }

    // 2. Message d'attente
    let waitMsgID = null;
    api.setMessageReaction("🎨", messageID, () => {}, true);
    api.sendMessage(`🎨 **Génération via Imagen 3...**\n"${prompt}"`, threadID, (err, info) => {
        if (!err) waitMsgID = info.messageID;
    });

    try {
        // 3. Configuration selon la documentation officielle Google
        // URL pour Imagen 3
        const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${API_KEY}`;
        
        // Corps de la requête (Payload) spécifique à Imagen
        const payload = {
            instances: [
                { prompt: prompt }
            ],
            parameters: {
                sampleCount: 1,
                aspectRatio: "1:1", // Format carré
                // safetySettings: on peut ajouter des filtres ici si besoin
            }
        };

        // 4. Appel API
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        // 5. Analyse de la réponse (Parsing)
        // La doc dit que l'image est dans response.predictions[0].bytesBase64Encoded
        const predictions = response.data?.predictions;
        
        if (!predictions || !predictions[0] || !predictions[0].bytesBase64Encoded) {
            throw new Error("NO_IMAGE_DATA");
        }

        const base64Data = predictions[0].bytesBase64Encoded;

        // 6. Sauvegarde de l'image
        const fileName = `img_${senderID}_${Date.now()}.png`;
        const filePath = path.join(tmpFolder, fileName);
        
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

        // 7. Envoi
        if (waitMsgID) api.unsendMessage(waitMsgID); // On retire le msg d'attente

        const msg = {
            body: `✅ **Image Générée !**\n\n🧠 **Modèle :** Google Imagen 3\n📝 **Prompt :** ${prompt}`,
            attachment: fs.createReadStream(filePath)
        };

        api.sendMessage(msg, threadID, () => {
            // Nettoyage
            fs.unlinkSync(filePath);
            api.setMessageReaction("✅", messageID, () => {}, true);
        });

    } catch (error) {
        console.error("Erreur Imagen :", error.response ? error.response.data : error.message);
        
        if (waitMsgID) api.unsendMessage(waitMsgID);
        api.setMessageReaction("❌", messageID, () => {}, true);

        let errorMsg = "❌ Une erreur technique est survenue.";

        // Gestion précise des erreurs pour t'aider à comprendre
        if (error.response) {
            if (error.response.status === 404) {
                errorMsg = "⚠️ **Erreur 404 : Modèle non trouvé**\nGoogle refuse l'accès à `imagen-3.0` sur ta clé API.\n\n👉 **Solution :** Ton compte est trop récent ou gratuit. Utilise la version 'Pollinations' que je t'ai donnée avant.";
            } else if (error.response.status === 403) {
                errorMsg = "⛔ **Erreur 403 : Permission Refusée**\nTa clé API n'a pas le droit de générer des images (restriction géographique ou facturation).";
            } else if (error.response.status === 400) {
                errorMsg = "⚠️ **Refus de sécurité**\nGoogle a bloqué ce prompt (contenu jugé inapproprié).";
            }
        }

        api.sendMessage(errorMsg, threadID, messageID);
    }
};
