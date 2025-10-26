const axios = require("axios");
const fs = require("fs");
const path = require("path");
const yts = require("yt-search"); // Renommé 'd' en 'yts' pour plus de clarté

// Fonction utilitaire pour récupérer un flux HTTP
async function getStream(url) {
  const res = await axios({ url, responseType: "stream" });
  return res.data;
}

// Fonction utilitaire pour télécharger un fichier et l'enregistrer temporairement
async function downloadFile(url, fileName) {
  const filePath = path.join(__dirname, fileName);
  const writer = fs.createWriteStream(filePath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });
  
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(filePath));
    writer.on('error', reject);
  });
}

// --- Fonctions de Traitement Spécifiques ---

// 1. Gère la recherche et le choix de l'utilisateur (MP3/MP4/Paroles)
async function handleInitialSearch(api, event, query, cmd) {
    try {
        await api.sendMessage(`🔍 Recherche de "${query}" sur YouTube...`, event.threadID);
        
        const res = await yts(query);
        const results = res.videos.slice(0, 6);
        if (!results.length) {
            return api.sendMessage("❌ Aucun résultat trouvé pour cette recherche.", event.threadID, event.messageID);
        }

        let msg = "🎶 Veuillez choisir le contenu que vous souhaitez pour :\n\n";
        results.forEach((v, i) => {
            msg += `${i + 1}. ${v.title}\n⏱ ${v.timestamp} | 👀 ${v.views}\n\n`;
        });

        // Télécharge les miniatures en flux pour l'envoi
        const thumbs = await Promise.all(results.map(v => getStream(v.thumbnail)));

        api.sendMessage(
            { 
                body: msg + "⚠️ Répondez avec un numéro (1-6) pour sélectionner la chanson, puis vous pourrez choisir le format.", 
                attachment: thumbs 
            },
            event.threadID,
            (err, info) => {
                if (err) return console.error(err);
                // Sauvegarde les résultats pour l'étape de réponse
                global.GoatBot.onReply.set(info.messageID, {
                    results,
                    messageID: info.messageID,
                    author: event.senderID,
                    commandName: cmd
                });
            },
            event.messageID
        );
    } catch (err) {
        console.error(err);
        api.sendMessage("❌ Échec de la recherche YouTube. Veuillez réessayer plus tard.", event.threadID, event.messageID);
    }
}

// 2. Gère le choix du format (MP3, MP4, Paroles)
// **CORRECTION ICI : Passage du commandName (cmd)**
async function handleFormatSelection(api, event, selected, cmd) {
    const formatMsg = `Vous avez choisi : ${selected.title}\n\nQuel contenu souhaitez-vous obtenir ?\n\n` +
                      "1. 🎤 **Paroles (Lyrics)**\n" +
                      "2. 🎧 **Fichier Audio (MP3)**\n" +
                      "3. 🎬 **Fichier Vidéo (MP4)**\n\n" +
                      "⚠️ Répondez avec le numéro correspondant (1, 2 ou 3).";

    api.sendMessage(
        formatMsg,
        event.threadID,
        (err, info) => {
            if (err) return console.error(err);
            // CORRECTION: Ajout de commandName pour la prochaine étape onReply
            global.GoatBot.onReply.set(info.messageID, {
                type: 'format_selection',
                song: selected,
                messageID: info.messageID,
                author: event.senderID,
                commandName: cmd // <-- CORRECTION DE L'ERREUR
            });
        },
        event.messageID
    );
}

// 3. Télécharge et envoie le MP3 (Fichier Audio)
async function downloadAndSendMp3(api, event, url, title) {
    try {
        await api.sendMessage(`⏳ Préparation du fichier audio (MP3) pour : ${title}...`, event.threadID);
        
        // Utilisation d'une API de conversion/téléchargement YouTube en MP3
        const apiUrl = `http://65.109.80.126:20409/aryan/play?url=${encodeURIComponent(url)}`;
        const res = await axios.get(apiUrl);
        const data = res.data;

        if (!data.status || !data.downloadUrl) throw new Error("API n'a pas retourné le lien de téléchargement MP3.");

        const songTitle = title.replace(/[\\/:"*?<>|]/g, "");
        const fileName = `${songTitle}.mp3`;
        
        const songData = await axios.get(data.downloadUrl, { responseType: "arraybuffer" });
        const filePath = path.join(__dirname, fileName);
        fs.writeFileSync(filePath, songData.data);

        await api.sendMessage(
            { body: `✅ Voici le fichier MP3 : ${songTitle}`, attachment: fs.createReadStream(filePath) },
            event.threadID,
            () => fs.unlinkSync(filePath), // Suppression après envoi
            event.messageID
        );
    } catch (err) {
        console.error(err);
        api.sendMessage(`❌ Échec du téléchargement du MP3: ${err.message}`, event.threadID, event.messageID);
    }
}

// 4. Télécharge et envoie le MP4 (Fichier Vidéo) - Utilise l'URL YouTube de base
async function downloadAndSendMp4(api, event, url, title) {
    try {
        await api.sendMessage(`⏳ Préparation du fichier vidéo (MP4) pour : ${title}...`, event.threadID);
        
        // Utilisation d'une API de téléchargement général (qui doit gérer l'URL YouTube)
        const apiUrl = `https://arychauhann.onrender.com/api/aiodl?url=${encodeURIComponent(url)}`;
        const res = await axios.get(apiUrl);
        const data = res.data;

        if (!data.status || !data.result) 
            return api.sendMessage(" | Impossible d’obtenir la vidéo MP4 depuis cette source (Lien YouTube).", event.threadID, event.messageID);

        const video = data.result;
        // On suppose que l'API renvoie le meilleur lien vidéo disponible
        const videoUrl = video.best?.url; 
        if (!videoUrl) return api.sendMessage(" | Aucun lien vidéo MP4 valide trouvé par l'API.", event.threadID, event.messageID);
        
        const fileName = `${title.replace(/[\\/:"*?<>|]/g, "")}_video.mp4`;
        const filePath = await downloadFile(videoUrl, fileName);

        await api.sendMessage(
            { body: `✅ Voici la vidéo (MP4) : ${title}`, attachment: fs.createReadStream(filePath) },
            event.threadID,
            () => fs.unlinkSync(filePath), // Suppression après envoi
            event.messageID
        );

    } catch (err) {
        console.error(err);
        api.sendMessage("❌ Une erreur est survenue lors du téléchargement de la vidéo MP4.", event.threadID, event.messageID);
    }
}

// 5. Récupère et envoie les paroles (Lyrics)
async function getAndSendLyrics(api, event, query) {
    try {
        await api.sendMessage(`⏳ Récupération des paroles pour : ${query}...`, event.threadID);
        
        const { data } = await axios.get(
            `https://lyricstx.vercel.app/youtube/lyrics?title=${encodeURIComponent(query)}`
        );

        if (!data?.lyrics) {
            return api.sendMessage("❌ Paroles non trouvées pour cette chanson.", event.threadID, event.messageID);
        }

        const { artist_name, track_name, artwork_url, lyrics } = data;

        // Télécharge la pochette et l'envoie en pièce jointe
        const filePath = await downloadFile(artwork_url, "lyrics_art.jpg");

        api.sendMessage(
            {
                body: `🎼 **${track_name}**\n👤 Artiste : ${artist_name}\n\n${lyrics}`,
                attachment: fs.createReadStream(filePath)
            },
            event.threadID,
            () => fs.unlinkSync(filePath),
            event.messageID
        );

    } catch (err) {
        console.error(err);
        api.sendMessage("❌ Erreur : Impossible de récupérer les paroles ou la pochette. Veuillez réessayer plus tard.", event.threadID, event.messageID);
    }
}

// -------------------------------------------------------------------
// --- EXPORTATION ET LOGIQUE PRINCIPALE DU BOT ---
// -------------------------------------------------------------------

module.exports = {
  config: {
    name: "play",
    aliases: ["music", "video", "lyrics"], 
    version: "1.1", // Mise à jour de la version
    author: "Joel", // Auteur mis à jour
    countDown: 5,
    role: 0,
    shortDescription: "Recherche et propose musique, vidéo ou paroles.",
    longDescription: "Recherche une chanson et permet de choisir entre télécharger le MP3, le MP4, ou obtenir les paroles.",
    category: "multimedia",
    guide: {
      en: "{pn} <nom de la chanson ou artiste>\nExemple: {pn} Ed Sheeran Azizam"
    }
  },

  // Logique principale (Commande /play <chanson>)
  onStart: async function ({ api, event, args, commandName }) {
    const query = args.join(" ");
    if (!query) {
      return api.sendMessage(
        "❌ Veuillez fournir le nom d'une chanson, d'un artiste ou un lien YouTube/Vidéo !",
        event.threadID,
        event.messageID
      );
    }

    // Si l'utilisateur donne un lien, on passe directement à la sélection du format
    if (query.startsWith("http")) {
        if (/(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|twitter\.com|x\.com)/i.test(query)) {
            // Passe le nom de la commande (commandName) à la sélection du format
            return handleFormatSelection(api, event, { title: "Lien Direct", url: query }, commandName); 
        } else {
            return api.sendMessage("❌ Ce lien ne semble pas être supporté pour le téléchargement direct.", event.threadID, event.messageID);
        }
    }
    
    // Si c'est un nom de chanson, on lance la recherche YouTube
    await handleInitialSearch(api, event, query, commandName);
  },

  // Logique de réponse (après le choix de la chanson ou du format)
  onReply: async function ({ api, event, Reply }) {
    const { author, results, song, type, commandName } = Reply;

    // S'assurer que seul l'utilisateur initial peut répondre
    if (event.senderID !== author) {
      return api.sendMessage("⚠️ Seul l'utilisateur qui a initié la commande peut faire une sélection.", event.threadID, event.messageID);
    }
    
    // --- Étape 1 : Sélection de la chanson (après l'affichage des 6 résultats) ---
    if (results && !type) {
        const choice = parseInt(event.body);

        if (isNaN(choice) || choice < 1 || choice > results.length) {
            return api.sendMessage("❌ Sélection de chanson invalide. Veuillez répondre avec un numéro entre 1 et 6.", event.threadID, event.messageID);
        }

        const selected = results[choice - 1];
        // Retirer le message de sélection de la chanson
        await api.unsendMessage(Reply.messageID); 
        
        // Passer à l'étape 2 : choix du format. On transmet le commandName.
        await handleFormatSelection(api, event, selected, commandName); 
    }
    
    // --- Étape 2 : Sélection du format (après le choix 1, 2 ou 3) ---
    else if (type === 'format_selection') {
        const choice = parseInt(event.body);
        
        // Retirer le message de sélection du format
        await api.unsendMessage(Reply.messageID); 
        
        // Le titre de la chanson peut être très long, donc on utilise un titre raccourci pour la recherche de paroles
        const shortQuery = song.title.substring(0, 50) + " " + (song.author || "");
        
        switch (choice) {
            case 1: // Paroles
                await getAndSendLyrics(api, event, shortQuery);
                break;
            case 2: // MP3
                await downloadAndSendMp3(api, event, song.url, song.title);
                break;
            case 3: // MP4
                await downloadAndSendMp4(api, event, song.url, song.title); // Utilise l'URL YouTube pour le téléchargement
                break;
            default:
                api.sendMessage("❌ Choix de format invalide. Veuillez répondre avec 1, 2 ou 3.", event.threadID, event.messageID);
                break;
        }
    }
  }
};
