const axios = require("axios");
const fs = require("fs");
const path = require("path");

// 🚨 NOUVELLES CONSTANTES API 🚨
const YOUTUBE_SEARCH_API = 'https://apis.davidcyriltech.my.id/youtube/search';
const YOUTUBE_MP4_API = 'https://apis.davidcyriltech.my.id/youtube/mp4';
const MP3_API_URL = 'http://65.109.80.126:20409/aryan/play';
const LYRICS_API_URL = 'https://lyricstx.vercel.app/youtube/lyrics';

// ⚠️ PLACEHOLDER POUR API KEY (À REMPLIR SI NÉCESSAIRE POUR L'API MP4)
const API_KEY = ''; 

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

// 1. Gère la recherche et le choix de l'utilisateur (MP3/MP4/Paroles) - Utilisant la nouvelle API de recherche
async function handleInitialSearch(api, event, query, cmd) {
    try {
        await api.sendMessage(`🔍 Recherche de "${query}" sur YouTube veillez patienter Svp...⏳`, event.threadID);
        
        // APPEL API DE RECHERCHE
        const searchUrl = `${YOUTUBE_SEARCH_API}?query=${encodeURIComponent(query)}`;
        const res = await axios.get(searchUrl);
        
        // Assumer que les résultats sont dans un tableau 'results' ou 'data'
        const rawResults = res.data.results || res.data;
        
        if (!rawResults || !Array.isArray(rawResults) || !rawResults.length) {
            return api.sendMessage("❌ Aucun résultat trouvé pour cette recherche. (API de Recherche)", event.threadID, event.messageID);
        }

        // Transformer les résultats pour correspondre à la structure attendue
        const results = rawResults.slice(0, 6).map(v => ({
            title: v.title || "Titre inconnu",
            url: v.url || v.videoUrl, // Utilise 'videoUrl' si 'url' n'est pas présent
            thumbnail: v.thumbnail || v.thumbnailUrl, // Utilise 'thumbnailUrl' si 'thumbnail' n'est pas présent
            timestamp: v.duration || '00:00', // Utilise 'duration' comme 'timestamp' pour l'affichage
            views: v.views || 'N/A'
        }));


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
        console.error("Erreur Recherche YouTube:", err.response?.data || err.message);
        api.sendMessage("❌ Échec de la recherche YouTube. Veuillez réessayer plus tard.", event.threadID, event.messageID);
    }
}

// 2. Gère le choix du format (MP3, MP4, Paroles)
async function handleFormatSelection(api, event, selected, cmd) {
    // ⭐️ CORRECTION APPLIQUÉE ICI : Utilisation des backticks (`) pour le saut de ligne ⭐️
    const formatMsg = `🎧 𝗩𝗼𝘂𝘀 𝗮𝘃𝗲𝘇 𝗰𝗵𝗼𝗶𝘀𝗶 𝗱'𝗲𝗰𝗼𝘂𝘁𝗲𝗿 : ${selected.title}\n\n⏭️𝙲𝚘𝚖𝚖𝚎𝚗𝚝 𝚟𝚘𝚞𝚕𝚎𝚣 - 𝚟𝚘𝚞𝚜 𝚜𝚞𝚒𝚟𝚛𝚎 𝚟𝚘𝚝𝚛𝚎 𝚖𝚞𝚜𝚒𝚚𝚞𝚎 🎵?\n\n♡   ∩_∩
 （„• ֊ •„)♡
╭─∪∪────────────⟡
│ 📁𝗙𝗢𝗥𝗠𝗔𝗧 𝗗𝗘 │𝗧𝗘𝗟𝗘𝗖𝗛𝗔𝗥𝗚𝗘𝗠𝗘𝗡𝗧
├───────────────⟡
│1) ᴘᴀʀᴏʟᴇꜱ (ʟʏʀɪᴄꜱ)📃
├───────────────⟡
│2) ꜰɪᴄʜɪᴇʀ ᴀᴜᴅɪᴏ 💿
├───────────────⟡
│3) ꜰɪᴄʜɪᴇʀ ᴠɪᴅᴇᴏ 📽️
├───────────────⟡
│🚧𝙍𝙚𝙥𝙤𝙣𝙙𝙚𝙯 𝙨𝙚𝙡𝙤𝙣 𝙡𝙚 │𝙣𝙪𝙢𝙚𝙧𝙤 𝙙𝙚 𝙫𝙤𝙩𝙧𝙚 𝙘𝙝𝙤𝙞𝙭 (𝟏, 𝟐 │𝙤𝙪 𝟑
╰───────────────⟡`;

    api.sendMessage(
        formatMsg,
        event.threadID,
        (err, info) => {
            if (err) return console.error(err);
            global.GoatBot.onReply.set(info.messageID, {
                type: 'format_selection',
                song: selected,
                messageID: info.messageID,
                author: event.senderID,
                commandName: cmd
            });
        },
        event.messageID
    );
}

// 3. Télécharge et envoie le MP3 (Fichier Audio)
async function downloadAndSendMp3(api, event, url, title) {
    try {
        await api.sendMessage(`⏳ Préparation du fichier audio (MP3) pour : ${title}...`, event.threadID);
        
        // Utilisation de l'ancienne API MP3
        const apiUrl = `${MP3_API_URL}?url=${encodeURIComponent(url)}`;
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
        console.error("Erreur MP3:", err.response?.data || err.message);
        api.sendMessage(`❌ Échec du téléchargement du MP3: ${err.message}`, event.threadID, event.messageID);
    }
}

// 4. Télécharge et envoie le MP4 (Fichier Vidéo) - Corrigé pour la structure de réponse
async function downloadAndSendMp4(api, event, url, title) {
    try {
        await api.sendMessage(`⏳ Préparation du fichier vidéo (MP4) pour : ${title}...`, event.threadID);
        
        // APPEL API MP4 AVEC CLÉ (si nécessaire)
        const apiUrl = `${YOUTUBE_MP4_API}?url=${encodeURIComponent(url)}&apikey=${API_KEY}`;
        const res = await axios.get(apiUrl);
        const data = res.data;

        // 🚨 CORRECTION ICI : Essayer 'result', 'url', ou 'downloadUrl' 🚨
        let videoUrl = data.result || data.url || data.downloadUrl; 

        // Si data.result est un objet, essayez de trouver l'URL à l'intérieur
        if (typeof data.result === 'object' && data.result !== null) {
            // C'est souvent le cas : { result: { url: "..." } }
            videoUrl = data.result.url || data.result.downloadUrl || videoUrl; 
        }

        // Si l'URL n'est toujours pas trouvée, affichage des données brutes en console.
        if (!videoUrl) {
            console.error("Nouvelle API MP4: La structure de réponse est inattendue. Données brutes de l'API:", data);
            return api.sendMessage("❌ Impossible d’obtenir un lien vidéo MP4 valide depuis l'API de téléchargement. Veuillez réessayer ou vérifier votre clé API (si nécessaire).", event.threadID, event.messageID);
        }
        
        const fileName = `${title.replace(/[\\/:"*?<>|]/g, "")}_video.mp4`;
        const filePath = await downloadFile(videoUrl, fileName);

        await api.sendMessage(
            { body: `✅ Voici la vidéo (MP4) : ${title}`, attachment: fs.createReadStream(filePath) },
            event.threadID,
            () => fs.unlinkSync(filePath), // Suppression après envoi
            event.messageID
        );

    } catch (err) {
        console.error("Erreur MP4:", err.response?.data || err.message);
        api.sendMessage("❌ Une erreur est survenue lors du téléchargement de la vidéo MP4.", event.threadID, event.messageID);
    }
}

// 5. Récupère et envoie les paroles (Lyrics)
async function getAndSendLyrics(api, event, query) {
    try {
        await api.sendMessage(`⏳ Récupération des paroles pour : ${query}...`, event.threadID);
        
        const { data } = await axios.get(
            `${LYRICS_API_URL}?title=${encodeURIComponent(query)}`
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
        console.error("Erreur Lyrics:", err.response?.data || err.message);
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
    version: "1.4", // Mise à jour de la version
    author: "Joel",
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
            case 3: // MP4 (Vidéo)
                await downloadAndSendMp4(api, event, song.url, song.title); // Utilise l'URL YouTube pour le téléchargement
                break;
            default:
                api.sendMessage("❌ Choix de format invalide. Veuillez répondre avec 1, 2 ou 3.", event.threadID, event.messageID);
                break;
        }
    }
  }
};
