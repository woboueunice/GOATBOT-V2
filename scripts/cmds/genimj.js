const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

// ⚠️ TA CLÉ API GOOGLE (Celle que tu m'as fournie)
const API_KEY = "AIzaSyAbnxZuCt5Lv3VC4x3sU0PZGphN05alRNs"; 

// Modèle Google Imagen 3
const MODEL_NAME = 'imagen-3.0-generate-001';

// Dossier cache
const cacheDir = path.join(__dirname, 'cache_genimg');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

// --- FONCTIONS UTILES ---

/**
 * Fonction unique pour générer 1 image via Google
 */
async function generateSingleImageGoogle(prompt, seedModifier) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:predict?key=${API_KEY}`;
    
    // On modifie légèrement le prompt ou on relance pour avoir des variations
    const payload = {
        instances: [{ prompt: prompt + " " + seedModifier }], // seedModifier pour varier les résultats
        parameters: {
            sampleCount: 1,
            aspectRatio: "1:1"
        }
    };

    try {
        const response = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
        const base64 = response.data?.predictions?.[0]?.bytesBase64Encoded;
        
        if (!base64) throw new Error("No Data");
        
        // Sauvegarde temporaire du fichier
        const fileName = `temp_${Date.now()}_${Math.floor(Math.random()*1000)}.png`;
        const filePath = path.join(cacheDir, fileName);
        fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
        
        return filePath;
    } catch (e) {
        return null; // Si une génération échoue, on renverra null
    }
}

/**
 * Crée la grille 2x2 à partir des chemins de fichiers locaux
 */
async function createGridFromFiles(filePaths) {
    const images = [];

    // Lecture des images
    for (const filePath of filePaths) {
        if (filePath && fs.existsSync(filePath)) {
            images.push(await Jimp.read(filePath));
        }
    }

    if (images.length === 0) throw new Error("Aucune image générée.");

    // On redimensionne tout pour que ce soit uniforme
    const width = 512;
    const height = 512;
    images.forEach(img => img.resize(width, height));

    // Création du canevas noir
    // Si on a moins de 4 images (ex: erreur API), on fait quand même une grille
    const grid = new Jimp(width * 2, height * 2, 0x000000FF); 

    if (images[0]) grid.composite(images[0], 0, 0);
    if (images[1]) grid.composite(images[1], width, 0);
    if (images[2]) grid.composite(images[2], 0, height);
    if (images[3]) grid.composite(images[3], width, height);

    const gridPath = path.join(cacheDir, `grid_${Date.now()}.jpg`);
    await grid.writeAsync(gridPath);
    return gridPath;
}

module.exports = {
  config: {
    name: "genimg", // Nom de la commande
    aliases: ["img", "dessine", "googleimg"],
    version: "3.0 PRO",
    author: "Joel",
    countDown: 20, 
    role: 0,
    longDescription: "Génère 4 images avec Google Imagen 3 et permet d'en choisir une.",
    category: "image",
    guide: {
      en: "{pn} [description]"
    }
  },

  onStart: async function({ args, message, event, commandName }) {
    const prompt = args.join(" ");

    if (!prompt) {
      return message.reply("🎨 **Google Studio**\nDécris l'image à générer.\nEx: `.genimg un lion futuriste`");
    }

    message.reaction("🎨", event.messageID);

    try {
      // 1. Lancement de 4 générations parallèles (Pour la vitesse)
      // On ajoute des petits suffixes invisibles pour forcer Google à varier les images
      const promises = [
        generateSingleImageGoogle(prompt, "."),
        generateSingleImageGoogle(prompt, ".."),
        generateSingleImageGoogle(prompt, "..."),
        generateSingleImageGoogle(prompt, "....")
      ];

      const imagePaths = await Promise.all(promises);

      // Filtrage : on garde seulement celles qui ont réussi
      const validPaths = imagePaths.filter(p => p !== null);

      if (validPaths.length === 0) {
        throw new Error("Toutes les générations ont échoué (Censure ou Erreur Google).");
      }

      // 2. Création de la Grille
      const gridPath = await createGridFromFiles(validPaths);

      const replyBody = 
          `🎨 **Google Imagen 3**\n` +
          `Prompt: "${prompt}"\n` +
          `\nRéponds avec **1, 2, 3 ou 4** pour télécharger l'image en HD.`;

      // 3. Envoi de la grille et attente de la réponse
      message.reply({
        body: replyBody,
        attachment: fs.createReadStream(gridPath)
      }, (err, info) => {
        // Une fois envoyé, on supprime le fichier grille
        if (fs.existsSync(gridPath)) fs.unlinkSync(gridPath);
        
        if (!err) {
            // On sauvegarde les chemins des 4 images pour la réponse
            global.GoatBot.onReply.set(info.messageID, {
                commandName,
                messageID: info.messageID,
                author: event.senderID,
                imagePaths: validPaths // On passe les chemins des fichiers
            });
        }
      });
      
      message.reaction("✅", event.messageID);

    } catch (error) {
      message.reaction("❌", event.messageID);
      console.error("GenImg Error:", error);
      
      let msg = "Erreur technique.";
      if (error.response?.status === 403) msg = "⛔ Accès Google refusé (Région/Facturation).";
      if (error.response?.status === 404) msg = "⚠️ Modèle Imagen non trouvé sur cette clé.";
      if (error.message.includes("Censure")) msg = "⚠️ Prompt censuré par Google (Sécurité).";

      message.reply(`❌ Échec : ${msg}`);
    }
  },

  onReply: async function({ message, event, Reply, api }) { 
    const { imagePaths } = Reply;
    const userReply = event.body.trim();
    const selection = parseInt(userReply);
    
    // Vérification de la sélection
    if (isNaN(selection) || selection < 1 || selection > 4) {
        return message.reply("❌ Choisis un chiffre entre 1 et 4.");
    }

    // L'index du tableau commence à 0, donc on fait -1
    const selectedPath = imagePaths[selection - 1];

    if (!selectedPath || !fs.existsSync(selectedPath)) {
        return message.reply("❌ Cette image n'est pas disponible (erreur ou index vide).");
    }
    
    api.unsendMessage(Reply.messageID);
    message.reaction("📥", event.messageID);

    try {
      // Envoi de l'image sélectionnée
      await message.reply({
        body: `✅ **Image #${selection} téléchargée**`,
        attachment: fs.createReadStream(selectedPath)
      });

      message.reaction("✅", event.messageID);

    } catch (error) {
      console.error("Send Error:", error);
      message.reply("Erreur lors de l'envoi de l'image.");
    } finally {
        // NETTOYAGE : Une fois que l'utilisateur a choisi, on supprime TOUTES les images temporaires de cette session
        // Pour ne pas saturer le disque du bot
        imagePaths.forEach(p => {
            if (fs.existsSync(p)) fs.unlinkSync(p);
        });
    }
  }
};
