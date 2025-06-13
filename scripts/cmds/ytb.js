const yts = require("yt-search");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "youtube",
    aliases: ["ytb"],
    version: "0.0.2",
    author: "ArYAN",
    countDown: 5,
    role: 0,
    description: {
      en: "Search and download YouTube videos or audio (under 10 minutes)"
    },
    category: "media",
    guide: {
      en:
        "{pn} [video|-v] <name>: Search and download video\n" +
        "{pn} [audio|-a] <name>: Search and download audio\n" +
        "{pn} -u <video-url> [-v|-a]: Download video/audio from URL"
    }
  },

  onStart: async function ({ args, message, event, commandName, api }) {
    let type = args[0];
    if (!type) return message.SyntaxError();

    if (type === "-u") {
      const url = args[1];
      const mode = args[2] || "-v";
      if (!url) return message.reply("❌ Please provide a YouTube video URL.");
      const loading = await message.reply("⏳ Fetching video info...");

      const videoId = extractVideoId(url);
      if (!videoId) return message.reply("❌ Invalid YouTube URL.");
      const search = await yts({ videoId });
      const video = search.video;
      if (!video) return message.reply("❌ Could not retrieve video info.");

      const infoText = `✅ Title: ${video.title}\n🕒 Duration: ${video.timestamp}\n👀 Views: ${video.views}\n\n📺 Channel: ${video.author.name}\n\n🔗 URL: ${url}`;

      if (mode === "-a") {
        await downloadYouTubeAudio(videoId, message, infoText);
      } else {
        await downloadVideo(url, message, infoText);
      }

      return api.unsendMessage(loading.messageID);
    }

    if (["-v", "video", "-a", "audio"].includes(type)) {
      const query = args.slice(1).join(" ");
      if (!query) return message.SyntaxError();

      const searchResults = await searchYouTube(query);
      if (searchResults.length === 0) return message.reply("❌ No results found.");

      const limited = searchResults.slice(0, 5);
      const body = limited.map((v, i) => `${i + 1}. ${v.title}`).join("\n\n");

      const msg = await message.reply({
        body: `🎬 Please choose a track:\n\n${body}`,
        attachment: await Promise.all(limited.map(v => getStreamFromURL(v.thumbnail)))
      });

      global.GoatBot.onReply.set(msg.messageID, {
        commandName,
        messageID: msg.messageID,
        author: event.senderID,
        searchResults: limited,
        type
      });

    } else {
      return message.reply("❌ Invalid command. Use -v for video or -a for audio.");
    }
  },

  onReply: async ({ event, api, Reply, message }) => {
    const { searchResults, type } = Reply;
    const choice = parseInt(event.body);

    if (!isNaN(choice) && choice >= 1 && choice <= searchResults.length) {
      const selected = searchResults[choice - 1];
      await api.unsendMessage(Reply.messageID);
      const loading = await message.reply("⬇️ Downloading...");

      try {
        const infoText = `✅ Title: ${selected.title}\n🕒 Duration: ${selected.duration}\n👀 Views: ${selected.views}\n\n📺 Channel: ${selected.channel}\n\n🔗 URL: ${selected.url}`;
        if (type === "-v" || type === "video") {
          await downloadVideo(selected.url, message, infoText);
        } else {
          const videoId = extractVideoId(selected.url);
          await downloadYouTubeAudio(videoId, message, infoText);
        }
        await api.unsendMessage(loading.messageID);
      } catch (err) {
        await api.unsendMessage(loading.messageID);
        message.reply(`❌ Download failed: ${err.message}`);
      }
    } else {
      message.reply("❌ Invalid selection. Please reply with a number between 1 and 5.");
    }
  }
};

async function searchYouTube(query) {
  const res = await yts(query);
  return res.videos
    .filter(v => v.duration.seconds <= 600)
    .map(v => ({
      id: v.videoId,
      title: v.title,
      duration: v.timestamp,
      views: v.views,
      channel: v.author.name,
      thumbnail: v.thumbnail,
      url: `https://www.youtube.com/watch?v=${v.videoId}`
    }));
}

async function downloadVideo(url, message, infoText = "") {
  const { data } = await axios.get(`https://aryan-ai-seven.vercel.app/ytmp3?query=${encodeURIComponent(url)}&format=mp4`);
  const videoUrl = data.data || data.url;
  const tempPath = path.join(__dirname, "yt_video.mp4");

  const writer = fs.createWriteStream(tempPath);
  const res = await axios({ url: videoUrl, responseType: "stream" });
  res.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  await message.reply({
    body: `${infoText}\n\n🎥 Here's your video:`,
    attachment: fs.createReadStream(tempPath)
  });

  fs.unlink(tempPath, () => {});
}

async function downloadYouTubeAudio(videoId, message, infoText = "") {
  const { data } = await axios.get(`https://aryan-ai-seven.vercel.app/ytmp3?query=https://www.youtube.com/watch?v=${videoId}&format=mp3`);
  const audioUrl = data.data || data.url;
  const tempPath = path.join(__dirname, "yt_audio.mp3");

  const writer = fs.createWriteStream(tempPath);
  const res = await axios({ url: audioUrl, responseType: "stream" });
  res.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  await message.reply({
    body: `${infoText}\n\n🎧 Here's your audio:`,
    attachment: fs.createReadStream(tempPath)
  });

  fs.unlink(tempPath, () => {});
}

async function getStreamFromURL(url) {
  const res = await axios({ url, responseType: "stream" });
  return res.data;
}

function extractVideoId(url) {
  const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
  return match ? match[1] : null;
}
