const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports.config = {
    name: "generate",
    version: "7.0.0", // Version "Unlock"
    hasPermssion: 0,
    credits: "Joel",
    description: "Génère des images HD (Sans restriction Google)",
    commandCategory: "image",
    usages: "[description]",
    cooldowns: 5,
    aliases: ["gen", "img", "nano", "draw"]
};

// Dossier temporaire
const tmpFolder = path.resolve(__dirname, 'tmp_gen_images');
if (!fs.existsSync(tmpFolder)) {
    fs.mkdirSync(tmpFolder, { recursive: true });
}

module.exports.onStart = async function({ api, event, args }) {
    const { threadID, messageID, senderID } = event;
    const prompt = args.join(" ");

    // 1. Vérification
    if (!prompt) {
        return api.sendMessage("🎨 **Studio Joel**\n\nDécris ton image.\nEx: `.gen un lion futuriste en armure dorée`", threadID, messageID);
    }

    // 2. Feedback immédiat
    api.setMessageReaction("🎨", messageID, () => {}, true);
    
    // On envoie un message qu'on supprimera après
    let waitMsgID = null;
    api.sendMessage(`🎨 **Génération en cours...**\n\n📄 "${prompt}"\n🚀 Moteur : Flux Realism`, threadID, (err, info) => {
        if (!err) waitMsgID = info.messageID;
    });

    try {
        // 3. Génération SANS Clé API Google
        // On utilise une API publique haute qualité pour contourner tes restrictions
        // seed aléatoire pour avoir une image unique à chaque fois
        const seed = Math.floor(Math.random() * 99999999);
        
        // On nettoie le prompt pour l'URL
        const cleanPrompt = encodeURIComponent(prompt + ", 8k, highly detailed, realistic, masterpiece");
        
        // URL Magique (Flux Model)
        const url = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&model=flux&seed=${seed}&nologo=true`;

        // 4. Téléchargement du flux
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream'
        });

        // 5. Sauvegarde locale
        const fileName = `art_${senderID}_${Date.now()}.jpg`;
        const filePath = path.join(tmpFolder, fileName);
        const writer = fs.createWriteStream(filePath);

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // 6. Envoi du résultat
        if (waitMsgID) api.unsendMessage(waitMsgID); // On supprime le msg d'attente

        const msg = {
            body: `✅ **Image Terminée**\n━━━━━━━━━━━━━━━━\n🖌️ **Prompt :** ${prompt}\n👤 **Client :** Joel`,
            attachment: fs.createReadStream(filePath)
        };

        api.sendMessage(msg, threadID, () => {
            // 7. Nettoyage final
            fs.unlinkSync(filePath);
            api.setMessageReaction("✅", messageID, () => {}, true);
        });

    } catch (error) {
        console.error("[IMAGE ERROR]", error);
        if (waitMsgID) api.unsendMessage(waitMsgID);
        api.setMessageReaction("❌", messageID, () => {}, true);
        api.sendMessage("❌ Le serveur d'image est occupé. Réessaie dans 1 minute.", threadID, messageID);
    }
};
                        
