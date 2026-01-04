require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, ActivityType } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

// --- CONFIGURAÇÕES ---
const URL_ALVO = 'https://flow.page/utfprbg?utm_source=ig&utm_medium=social&utm_content=link_in_bio';
const CANAL_ID = '1457456246121828464'; 
const CLIENT_ID = '1457440596376551426'; // Seu ID de Aplicação
const INTERVALO_MINUTOS = 30; 

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// --- COMANDOS ---
const commands = [
  {
    name: 'verificar',
    description: 'Força a Yuterin a acordar e olhar o site agora.',
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registrando comandos...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Comandos registrados!');
  } catch (error) {
    console.error(error);
  }
})();

// --- VARIÁVEIS GLOBAIS ---
let linksConhecidos = [];

if (fs.existsSync('memoria.json')) {
    linksConhecidos = JSON.parse(fs.readFileSync('memoria.json'));
}

// --- FUNÇÃO MÁGICA DE ESTILOS (AQUI ESTÃO SEUS 3 STATES) ---
function mudarRoupaYuterin(modo) {
    if (!client.user) return; // Segurança caso o bot não tenha logado ainda

    if (modo === 'vigiando') {
        // STATE A: VIGIANDO (Ocorre enquanto ela está processando o site)
        client.user.setPresence({
            activities: [{ 
                name: 'o Flowpage da UTFPR', 
                type: ActivityType.Watching, 
                details: 'Escaneando Links...',
                state: 'Analisando dados 🔍',
                assets: { largeImageKey: 'scanning_icon', largeImageText: 'Radar Ativo' } 
            }],
            status: 'dnd', // Vermelho (Ocupada)
        });

    } else if (modo === 'alerta') {
        // STATE B: ALERTA (Ocorre quando acha link novo)
        client.user.setPresence({
            activities: [{ 
                name: 'LINK NOVO!', 
                type: ActivityType.Playing, 
                details: '🚨 NOVIDADE DETECTADA',
                state: 'Verifique o canal agora!',
                assets: { largeImageKey: 'alert_icon', largeImageText: 'ATENÇÃO!' } 
            }],
            status: 'online', // Verde (Chamativo)
        });

    } else if (modo === 'dormindo') {
        // STATE C: DORMINDO (Ocorre quando não tem nada novo e ela espera o timer)
        client.user.setPresence({
            activities: [{ 
                name: 'um cochilo...', 
                type: ActivityType.Playing, // Ou "Listening to Lofi"
                details: 'Nada novo por enquanto',
                state: `Volto em ${INTERVALO_MINUTOS} min 💤`,
                assets: { largeImageKey: 'sleep_icon', largeImageText: 'Zzz...' } 
            }],
            status: 'idle', // Amarelo (Ausente/Dormindo)
        });
    }
}

// Tenta carregar a memória (nota: no Render Free, isso reseta a cada deploy)
if (fs.existsSync('memoria.json')) {
    try {
        linksConhecidos = JSON.parse(fs.readFileSync('memoria.json'));
    } catch (e) {
        linksConhecidos = [];
    }
}

async function checarSite(origem = 'auto') {
    try {
        console.log(`[${new Date().toLocaleTimeString()}] Verificando site...`);
        
        const { data } = await axios.get(URL_ALVO);
        const $ = cheerio.load(data);
        
        const linksAtuais = [];
        
        // --- LISTA NEGRA: O que o bot deve IGNORAR ---
        const termosProibidos = [
            'cdn-cgi',           // Cloudflare email protection
            'email-protection',  // Cloudflare
            'report phishing',   // Rodapé do site
            'contact flowpage',  // Rodapé do site
            'javascript:',       // Botões de script
            'mailto:'            // Links de enviar email
        ];

        $('a').each((i, elemento) => {
            const texto = $(elemento).text().trim();
            const url = $(elemento).attr('href');
            
            // Só processa se tiver texto, url e NÃO for proibido
            if (texto && url) {
                const ehLixo = termosProibidos.some(termo => 
                    url.toLowerCase().includes(termo) || 
                    texto.toLowerCase().includes(termo)
                );

                if (!ehLixo) {
                    const ehGoogleForm = url.includes('forms') || url.includes('docs.google');
                    linksAtuais.push({ texto, url, ehGoogleForm });
                }
            }
        });

        // 3. Compara com a memória
        const novosLinks = linksAtuais.filter(linkNovo => 
            !linksConhecidos.some(linkVelho => linkVelho.url === linkNovo.url)
        );

        // 4. LÓGICA FINAL
        if (novosLinks.length > 0) {
            console.log("Novidades Limpas:", novosLinks.length);
            
            // Se for primeira vez (Memória vazia), salva e fica quieto
            if (linksConhecidos.length === 0) {
                console.log("Primeira execução: Banco populado silenciosamente.");
                linksConhecidos = linksAtuais;
                fs.writeFileSync('memoria.json', JSON.stringify(linksConhecidos));
                return "Memória inicializada. Yuterin está de olho! 👀";
            }

            const canal = client.channels.cache.get(CANAL_ID);
            if (canal) {
                novosLinks.forEach(link => {
                    if (link.ehGoogleForm) {
                        // PRIORIDADE MÁXIMA: FORMS
                        client.user.setPresence({
                            activities: [{ name: 'UMA VIAGEM!', type: ActivityType.Playing }],
                            status: 'online',
                        });
                        canal.send({
                            content: `🚨 **ALERTA DE FORMULÁRIO!** 🚨\n<@&${process.env.CARGO_ID || ''}> A Yuterin encontrou um Forms!\n**${link.texto}**\n${link.url}`
                        });
                    } else {
                        // Link comum limpo (Instagram, PDF, Site normal)
                        canal.send(`ℹ️ Link novo detectado:\n**${link.texto}**\n${link.url}`);
                    }
                });
            }

            linksConhecidos = linksAtuais;
            fs.writeFileSync('memoria.json', JSON.stringify(linksConhecidos));
            return `Encontrei ${novosLinks.length} coisas novas (e limpas)!`;

        } else {
            return "Nada novo sob o sol.";
        }

    } catch (error) {
        console.error("Erro ao checar site:", error.message);
        return "Deu erro ao acessar o site.";
    }
}

// --- EVENTOS DO BOT ---

client.on('ready', () => {
  console.log(`Bot ${client.user.tag} está online!`);
  
  // Já começa trabalhando
  checarSite();
  
  // Loop infinito
  setInterval(() => checarSite(), INTERVALO_MINUTOS * 60 * 1000);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'verificar') {
    await interaction.deferReply();
    const resultado = await checarSite('comando');
    await interaction.editReply(resultado);
  }
});

client.login(process.env.DISCORD_TOKEN);

// --- MANTENDO O BOT VIVO NO RENDER ---
const http = require('http');
const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Yuterin esta operando! 🐱‍💻');
});

server.listen(port, () => {
    console.log(`Servidor web rodando na porta ${port} para manter o bot acordado.`);
});
