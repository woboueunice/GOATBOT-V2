const fs = require('fs');
const path = require('path');
const axios = require('axios');

module.exports = {
  config: {
    name: "pastebin",
    version: "1.1",
    author: "Tk",
    countDown: 5,
    role: 2,
    shortDescription: "Convert code to link",
    longDescription: "Upload a bot file to paste.rs and return the link",
    category: "owner",
    guide: "{pn} filename"
  },

  onStart: async function ({ message, args, api, event }) {
    // 1. Vérification des permissions
    const permission = ["100079402482429", "61550002466586"];
    if (!permission.includes(event.senderID)) {
      return api.sendMessage("- Bitch, Only my Boss Mr ʚɸɞ TK.JOEL ʚɸɞ can use this👿🖕🏽", event.threadID, event.messageID);
    }
    
    // 2. Vérification de l'argument (nom du fichier)
    const fileName = args[0];
    if (!fileName) {
      return api.sendMessage("❌ Indique le nom du fichier (ex: .pastebin help)", event.threadID, event.messageID);
    }

    // 3. Construction du chemin du fichier
    // On cherche dans le dossier actuel (__dirname)
    const filePath = path.join(__dirname, `${fileName}.js`);
    
    if (!fs.existsSync(filePath)) {
      return api.sendMessage(`❌ Le fichier "${fileName}.js" est introuvable dans ce dossier.`, event.threadID, event.messageID);
    }

    // 4. Lecture et Envoi
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      api.sendMessage(`🔄 Envoi de "${fileName}.js" vers le serveur...`, event.threadID, (err, info) => {
         if(err) console.log(err);
      });

      // Utilisation de paste.rs qui accepte le texte brut (RAW) -> Plus fiable, pas d'erreur de header
      const response = await axios.post('https://paste.rs', fileContent);
      
      // paste.rs renvoie directement le lien
      const link = response.data.trim();

      return api.sendMessage(`✅ **Fichier :** ${fileName}.js\n🔗 **Lien :** ${link}`, event.threadID, event.messageID);

    } catch (e) {
      console.error(e);
      return api.sendMessage(`❌ Erreur lors de l'upload : ${e.message}`, event.threadID, event.messageID);
    }
  }
};
