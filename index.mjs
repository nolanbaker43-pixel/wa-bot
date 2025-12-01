import makeWASocket, { downloadMediaMessage } from '@whiskeysockets/baileys'
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
const OPENAI_KEY = 'sk-...'           
const BLACKBOX_API = 'https://blackbox.ai/api/chat' 

async function start() {
    // === CRITICAL TEMPORARY CHANGE: Memory-Based Session ===
    const state = {}; 
    const saveCreds = () => { console.log("Memory session active. State not saved to disk.") };
    
    // Create the socket using the in-memory state
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['GOD BOT v2', 'Chrome', '120']
    })

    sock.ev.on('connection.update', u => {
        if (u.qr) {
            qrcode.generate(u.qr, { small: true });
            console.warn("⚠️ SCAN QR CODE NOW. Session is NOT being saved to disk.");
        }
        if (u.connection === 'open') console.log('🤖 GOD BOT v2 FULLY LOADED 🔥')
        // Automatically restart if connection closes unexpectedly
        if (u.connection === 'close') {
            console.error('Connection closed. Attempting restart...');
            if (u.lastDisconnect?.error?.output?.statusCode !== 401) { 
                start(); 
            } else {
                console.warn("Session invalidated (401). Starting fresh auth process.");
                start();
            }
        }
    })
    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async ({ messages }) => {
        try { 
            const m = messages[0]
            if (!m.message) return
            
            const text = m.message.conversation || m.message.extendedTextMessage?.text || ''
            const from = m.key.remoteJid

            console.log(`← ${from.split('@')[0]}: ${text || '[media]'}`)

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

            // === MUSIC DOWNLOADER (REMOVED: Depends on unstable FFmpeg native library) ===
            if (cmd === 'play' || cmd === 'song' || cmd === 'music') {
                await sock.sendMessage(from, { text: '❌ Music download is temporarily disabled due to server instability. Please use a VPS for this feature.' })
            }
            
            // === MENU ===
            if (cmd === 'menu') {
                const menu = `
*🤖 GOD BOT v2 - CORE ARSENAL (Stable)*

!dice → roll dice
!rps rock/paper/scissors → rock paper scissors
!img cat wearing hat → AI image (DALL·E or free)
!sticker → reply image/video
!ai your question → ChatGPT
!button → test buttons
!everyone → tag all (group)

_Note: !play is disabled due to server limitations._
                `.trim()
                await sock.sendMessage(from, { text: menu })
            }
        
            // -----------------------------------------------------------------
            // === PASTE YOUR REMAINING 70+ COMMANDS ABOVE THIS LINE ===
            // -----------------------------------------------------------------
        } catch (globalError) {
            console.error("Global Message Upsert Error:", globalError);
        }
    })
}

start()
