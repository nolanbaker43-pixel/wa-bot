import makeWASocket, { useMultiFileAuthState, downloadMediaMessage } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import fetch from 'node-fetch'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// CONFIG — put your keys here
const OPENAI_KEY = 'sk-...'           // ← ChatGPT + DALL·E
const BLACKBOX_API = 'https://blackbox.ai/api/chat'  // free unlimited AI (no key needed)

async function start() {
    // This creates and uses the 'auth_baileys' folder to store session data
    const { state, saveCreds } = await useMultiFileAuthState('auth_baileys')
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['GOD BOT v2', 'Chrome', '120']
    })

    sock.ev.on('connection.update', u => {
        if (u.qr) qrcode.generate(u.qr, { small: true })
        if (u.connection === 'open') console.log('🤖 GOD BOT v2 FULLY LOADED 🔥')
        // Automatically restart if connection closes unexpectedly
        if (u.connection === 'close') start() 
    })
    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0]
        if (!m.message) return
        
        // Extract message text from various message types
        const text = m.message.conversation || m.message.extendedTextMessage?.text || ''
        const from = m.key.remoteJid

        console.log(`← ${from.split('@')[0]}: ${text || '[media]'}`)

        // Only process commands starting with '!'
        if (!text.startsWith('!')) return

        const args = text.slice(1).trim().split(/ +/)
        const cmd = args.shift().toLowerCase()

        // -----------------------------------------------------------------
        // === YOUR 80+ COMMAND LOGIC GOES HERE ===
        // -----------------------------------------------------------------

        // === GAMES ===
        if (cmd === 'dice') {
            const roll = Math.floor(Math.random() * 6) + 1
            await sock.sendMessage(from, { text: `🎲 You rolled: *${roll}*!` })
        }

        if (cmd === 'rps') {
            const choices = ['rock', 'paper', 'scissors']
            const bot = choices[Math.floor(Math.random() * 3)]
            const user = args[0]?.toLowerCase()
            if (!user) return sock.sendMessage(from, { text: 'Usage: !rps rock/paper/scissors' })
            let result = `You: ${user} | Bot: ${bot}\n`
            if (user === bot) result += '🤝 Tie!'
            else if ((user === 'rock' && bot === 'scissors') || (user === 'paper' && bot === 'rock') || (user === 'scissors' && bot === 'paper'))
                result += '🎉 You win!'
            else result += '😭 I win!'
            // NOTE: The original code used { text }, which sends the raw command. Corrected to send the result:
            await sock.sendMessage(from, { text: result }) 
        }

        // === IMAGE GENERATOR (DALL·E 3 or free alternative) ===
        if (cmd === 'img' || cmd === 'aiart') {
            const prompt = args.join(' ')
            if (!prompt) return sock.sendMessage(from, { text: 'Usage: !img cyberpunk cat' })
            await sock.sendMessage(from, { text: 'Generating image...' })

            try {
                // Option 1: OpenAI DALL·E (paid)
                if (OPENAI_KEY !== 'sk-...') {
                    const res = await fetch('https://api.openai.com/v1/images/generations', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024' })
                    })
                    const json = await res.json()
                    const url = json.data[0].url
                    const img = await (await fetch(url)).buffer()
                    await sock.sendMessage(from, { image: img, caption: prompt })
                } else {
                    // Option 2: FREE Blackbox AI image gen (using the specified endpoint)
                    const res = await axios.post(BLACKBOX_API, {
                        messages: [{ role: 'user', content: `Generate image: ${prompt}` }],
                        model: 'blackbox'
                    })
                    const url = res.data.match(/\((https?:\/\/[^\)]+\.png|jpg)\)/)?.[1]
                    if (url) {
                        const img = await (await fetch(url)).buffer()
                        await sock.sendMessage(from, { image: img, caption: prompt })
                    } else {
                        await sock.sendMessage(from, { text: 'Free image generator could not parse a URL from the response.' })
                    }
                }
            } catch (e) { 
                console.error("Image generation error:", e);
                await sock.sendMessage(from, { text: 'Image failed :(' }) 
            }
        }

        // === MUSIC DOWNLOADER (100% working 2025) ===
        if (cmd === 'play' || cmd === 'song' || cmd === 'music') {
            const query = args.join(' ')
            if (!query) return sock.sendMessage(from, { text: 'Usage: !play perfect ed sheeran' })

            await sock.sendMessage(from, { text: '🔍 Searching...' })

            try {
                // Dynamic imports are necessary for ES modules inside this Baileys context
                const ytSearch = (await import('yt-search')).default
                const searchResults = await ytSearch(query)
                const video = searchResults.videos[0]
                if (!video) return sock.sendMessage(from, { text: 'No results found 😭' })

                await sock.sendMessage(from, { text: `⬇️ Downloading...\n🎵 ${video.title}\n⏱ ${video.timestamp}` })

                const ytdl = (await import('ytdl-core')).default
                const stream = ytdl(video.videoId, { filter: 'audioonly', quality: 'highestaudio' })
                const filePath = path.join(__dirname, `${video.videoId}.mp3`)

                // Download with ffmpeg (converts properly for WhatsApp)
                const ffmpeg = (await import('fluent-ffmpeg')).default
                const ffmpegPath = (await import('@ffmpeg-installer/ffmpeg')).path
                ffmpeg.setFfmpegPath(ffmpegPath)

                await new Promise((resolve, reject) => {
                    ffmpeg(stream)
                        .audioBitrate(128)
                        .save(filePath)
                        .on('end', resolve)
                        .on('error', reject)
                })

                await sock.sendMessage(from, {
                    audio: { url: filePath },
                    mimetype: 'audio/mpeg',
                    fileName: `${video.title}.mp3`
                })

                // Clean up
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath)
                }
            } catch (e) {
                console.log(e)
                await sock.sendMessage(from, { text: 'Download failed 😭 Try checking the song name and trying again!' })
            }
        }
        
        // === MENU ===
        if (cmd === 'menu') {
            const menu = `
*🤖 GOD BOT v2 - FULL ARSENAL (Baileys)*

!dice → roll dice
!rps rock/paper/scissors → rock paper scissors
!img cat wearing hat → AI image (DALL·E or free)
!play perfect → download song from YouTube
!sticker → reply image/video
!ai your question → ChatGPT
!button → test buttons
!everyone → tag all (group)
            `.trim()
            await sock.sendMessage(from, { text: menu })
        }
        
        // -----------------------------------------------------------------
        // === PASTE YOUR REMAINING 70+ COMMANDS ABOVE THIS LINE ===
        // -----------------------------------------------------------------
    })
}

start()
