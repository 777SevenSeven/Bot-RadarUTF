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

// --- LÓGICA DO VIGIA ---
async function checarSite(origem = 'auto') {
    try {
        console.log(`[${new Date().toLocaleTimeString()}] Verificando site...`);
        
        // 1. Muda para roupa de TRABALHO (Vigiando)
        mudarRoupaYuterin('vigiando');

        // 2. Baixa e processa
        const { data } = await axios.get(URL_ALVO);
        const $ = cheerio.load(data);
        
        const linksAtuais = [];
        $('a').each((i, elemento) => {
            const texto = $(elemento).text().trim();
            const url = $(elemento).attr('href');
            if (texto && url) linksAtuais.push({ texto, url });
        });

        const novosLinks = linksAtuais.filter(linkNovo => 
            !linksConhecidos.some(linkVelho => linkVelho.url === linkNovo.url)
        );

        // 3. DECIDE QUAL ROUPA VESTIR DEPOIS DO TRABALHO
        if (novosLinks.length > 0) {
            console.log("Novos links encontrados:", novosLinks);
            
            if (linksConhecidos.length > 0) {
                const canal = client.channels.cache.get(CANAL_ID);
                if (canal) {
                    novosLinks.forEach(link => {
                        const destaque = link.texto.toLowerCase().includes('ludico') || link.texto.toLowerCase().includes('viagem') 
                            ? "🚨 **ATENÇÃO: PODE SER VIAGEM!** 🚨\n" 
                            : "🆕 Novo Link detectado:\n";
                        canal.send(`${destaque}**${link.texto}**\n${link.url}`);
                    });
                }
                // SE ACHOU NOVIDADE: Fica em modo ALERTA até a próxima verificação
                mudarRoupaYuterin('alerta');
            } else {
                console.log("Primeira execução: Banco populado.");
                // Se for a primeira vez, não assusta, só vai dormir
                mudarRoupaYuterin('dormindo');
            }

            linksConhecidos = linksAtuais;
            fs.writeFileSync('memoria.json', JSON.stringify(linksConhecidos));
            return `Encontrei ${novosLinks.length} novidades!`;

        } else {
            // SE NÃO ACHOU NADA: Vai dormir (Fica fofo com o sleep_icon)
            // A gente usa um setTimeout pequeno só pra garantir que dê tempo 
            // de ver o status "Vigiando" se alguém estiver olhando na hora exata
            setTimeout(() => {
                mudarRoupaYuterin('dormindo');
            }, 5000); 
            
            return "Nada novo sob o sol.";
        }

    } catch (error) {
        console.error("Erro ao checar site:", error.message);
        mudarRoupaYuterin('dnd'); // Se der erro, mantém ocupada
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