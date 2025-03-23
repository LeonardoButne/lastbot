const { Client, Location, Poll, List, Buttons, LocalAuth } = require('./index');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

const adminNumber = '+258853399617'; // Número do administrador do bot
const groupName = 'Apenas testando'; // Nome do grupo permitido para redirecionamento
let redirectionOn = false; // Controle do redirecionamento
const keywords = ['Procuro', 'precisar', 'Tens', 'Preciso', 'Algum', 'Alguma', 'Cliente', 'Programador', 'Informatico',
    'Alguém tem', 'Alguém vende', 'iphone'
]; // Lista de palavras-chave

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, // Rodar em modo invisível (importante para Render)
        args: ['--no-sandbox', '--disable-setuid-sandbox'], // Necessário para ambientes cloud como Render
    }
});

// Inicia o cliente WhatsApp
client.initialize();

// Servidor para manter o Render ativo
app.get('/', (req, res) => {
    res.send('WhatsApp Bot está rodando!');
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

client.on('loading_screen', (percent, message) => {
    console.log('LOADING SCREEN', percent, message);
});

// Pairing code only needs to be requested once
let pairingCodeRequested = false;
client.on('qr', async (qr) => {
    // NOTE: This event will not be fired if a session is specified.
    console.log('QR RECEIVED', qr);

    // paiuting code example
    const pairingCodeEnabled = false;
    if (pairingCodeEnabled && !pairingCodeRequested) {
        const pairingCode = await client.requestPairingCode('96170100100'); // enter the target phone number
        console.log('Pairing code enabled, code: ' + pairingCode);
        pairingCodeRequested = true;
    }
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

client.on('auth_failure', msg => {
    // Fired if session restore was unsuccessful
    console.error('AUTHENTICATION FAILURE', msg);
});

client.on('ready', async () => {
    console.log('READY');
    const debugWWebVersion = await client.getWWebVersion();
    console.log(`WWebVersion = ${debugWWebVersion}`);

    client.pupPage.on('pageerror', function (err) {
        console.log('Page error: ' + err.toString());
    });
    client.pupPage.on('error', function (err) {
        console.log('Page error: ' + err.toString());
    });

});

client.on('message', async msg => {
    const chat = await msg.getChat();
    console.log('MESSAGE RECEIVED', msg.body);

    // Verifica se o redirecionamento está ativado
    if (redirectionOn) {
        // Verifica se a mensagem contém alguma palavra-chave
        for (const keyword of keywords) {
            if (msg.body && msg.body.toLowerCase().includes(keyword.toLowerCase())) {
                // Obtém o número do autor da mensagem
                const senderNumber = msg.author ? msg.author.replace('@c.us', '') : 'Desconhecido';

                // Envia a mensagem para o grupo "Teste"
                const targetChat = await client.getChats().then(chats =>
                    chats.find(c => c.name === groupName)
                );

                if (targetChat) {
                    targetChat.sendMessage(`Mensagem redirecionada do grupo "${chat.name}" por ${senderNumber}:\n\n${msg.body}`);
                    console.log(`Mensagem redirecionada para o grupo "${groupName}"`);
                } else {
                    console.log('Grupo de destino não encontrado.');
                }
                break;
            }
        }
    }

    // Verifica se a mensagem é do administrador
    const isAdminMessage = msg.author === adminNumber.replace('+', '') + '@c.us';

    // Comandos do administrador
    if (isAdminMessage) {
        if (msg.body === '.redireOn') {
            redirectionOn = true;
            chat.sendMessage('Redirecionamento ativado!');
            return;
        }

        if (msg.body === '.redireOff') {
            redirectionOn = false;
            chat.sendMessage('Redirecionamento desativado!');
            return;
        }

        if (msg.body === '.keywords') {
            chat.sendMessage(`Palavras-chave atuais: ${keywords.join(', ')}`);
            return;
        }

        if (msg.body.startsWith('.addKeyword ')) {
            const keyword = msg.body.replace('.addKeyword ', '').trim();
            if (keyword && !keywords.includes(keyword)) {
                keywords.push(keyword);
                chat.sendMessage(`Palavra-chave "${keyword}" adicionada!`);
            } else {
                chat.sendMessage(`Palavra-chave inválida ou já existente.`);
            }
            return;
        }

        if (msg.body.startsWith('.removeKeyword ')) {
            const keyword = msg.body.replace('.removeKeyword ', '').trim();
            const index = keywords.indexOf(keyword);
            if (index > -1) {
                keywords.splice(index, 1);
                chat.sendMessage(`Palavra-chave "${keyword}" removida!`);
            } else {
                chat.sendMessage(`Palavra-chave não encontrada.`);
            }
            return;
        }
    }

    if (msg.body === '!ping') {
        // Send a new message to the same chat
        client.sendMessage(msg.from, 'pong');

    } else if (msg.body === '!resendmedia' && msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        if (quotedMsg.hasMedia) {
            const attachmentData = await quotedMsg.downloadMedia();
            client.sendMessage(msg.from, attachmentData, { caption: 'Here\'s your requested media.' });
        }
        if (quotedMsg.hasMedia && quotedMsg.type === 'audio') {
            const audio = await quotedMsg.downloadMedia();
            await client.sendMessage(msg.from, audio, { sendAudioAsVoice: true });
        }
    } else if (msg.body === '!isviewonce' && msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        if (quotedMsg.hasMedia) {
            const media = await quotedMsg.downloadMedia();
            await client.sendMessage(msg.from, media, { isViewOnce: true });
        }
    } else if (msg.body === '.listAll' && msg.hasQuotedMsg) {
        try {
            // Obter o chat atual
            const chat = await msg.getChat();

            // Garantir que o comando seja usado em um grupo
            if (!chat.isGroup) {
                await msg.reply('Este comando só pode ser usado em grupos.');
                return;
            }

            // Obter a mensagem mencionada
            const quotedMsg = await msg.getQuotedMessage();

            // Coletar os IDs de todos os participantes do grupo
            const mentions = chat.participants.map(participant => participant.id._serialized);

            // Verificar se a mensagem citada contém mídia (foto, áudio, etc.)
            if (quotedMsg.hasMedia) {
                const media = await quotedMsg.downloadMedia();
                await client.sendMessage(chat.id._serialized, media, {
                    caption: quotedMsg.body || ' ',
                    mentions: mentions
                });
            } else {
                // Caso não seja uma mensagem com mídia, apenas reenvia o texto
                await client.sendMessage(chat.id._serialized, quotedMsg.body, { mentions: mentions });
            }

        } catch (error) {
            console.error('Erro ao processar o comando .listAll:', error);
            await msg.reply('Ocorreu um erro ao processar o comando.');
        }
    } else if (msg.body === '!sendToGroup' && msg.hasQuotedMsg) {
        try {
            // Obter a mensagem marcada
            const quotedMsg = await msg.getQuotedMessage();

            // Encontrar o grupo "Shop Now"
            const targetGroup = await client.getChats().then(chats =>
                chats.find(chat => chat.name === 'Shop Now📱🎮📺💻🖥️🖨️' && chat.isGroup)
            );

            if (!targetGroup) {
                console.log('Grupo "Shop Now" não encontrado.');
                await msg.reply('O grupo "Shop Now" não foi encontrado.');
                return;
            }

            // Obter os IDs de todos os participantes do grupo "Shop Now"
            const mentions = targetGroup.participants.map(participant => participant.id._serialized);

            // Verificar se a mensagem marcada contém mídia
            if (quotedMsg.hasMedia) {
                const media = await quotedMsg.downloadMedia();
                await client.sendMessage(targetGroup.id._serialized, media, {
                    caption: quotedMsg.body || ' ', // Inclui o texto da mensagem marcada (se houver)
                    mentions: mentions // Menciona todos os participantes
                });
            } else {
                // Reenviar apenas o texto da mensagem marcada
                await client.sendMessage(targetGroup.id._serialized, quotedMsg.body, { mentions: mentions });
            }

            console.log(`Mensagem enviada para o grupo "Shop Now" com sucesso.`);
            await msg.reply('Mensagem enviada para o grupo "Shop Now" com sucesso.');
        } catch (error) {
            console.error('Erro ao processar o comando !sendToGroup:', error);
            await msg.reply('Ocorreu um erro ao enviar a mensagem para o grupo.');
        }
    }
    else if (msg.body === '!sendToGroups' && msg.hasQuotedMsg) {
        const groupList = ['Vendas ,desapegos/boladas e anónimos ❤️', 'VENDAS SÉRIAS ONLINE',
            '#Bolada All Business💰💵🛍️', '🍏APPLE_TECH🍏 SERVICE🧳', 'Associação de Nhonguistas🇲🇿( Maputo)'
        ]; // Lista de grupos

        try {
            // Obter a mensagem marcada
            const quotedMsg = await msg.getQuotedMessage();

            // Iterar pela lista de grupos
            for (const groupName of groupList) {
                const targetChat = await client.getChats().then(chats =>
                    chats.find(chat => chat.name === groupName)
                );

                if (targetChat) {
                    // Obter os participantes do grupo
                    const mentions = targetChat.participants.map(participant => participant.id._serialized);

                    // Verificar se é uma mensagem com mídia
                    if (quotedMsg.hasMedia) {
                        const media = await quotedMsg.downloadMedia();
                        await targetChat.sendMessage(media, {
                            caption: quotedMsg.body || '',
                            mentions: mentions,
                        });
                    } else {
                        await targetChat.sendMessage(quotedMsg.body, { mentions: mentions });
                    }
                } else {
                    console.log(`Grupo "${groupName}" não encontrado.`);
                }
            }

            // Confirmar o envio
            await msg.reply('Mensagem enviada para todos os grupos da lista.');
        } catch (error) {
            console.error('Erro ao processar o comando:', error);
            await msg.reply('Ocorreu um erro ao enviar para os grupos.');
        }
    } else if (msg.body === '!sendToGroupsN' && msg.hasQuotedMsg) {
        const groupList = ['Vendas ,desapegos/boladas e anónimos ❤️', 'VENDAS SÉRIAS ONLINE',
            '#Bolada All Business💰💵🛍️', '🍏APPLE_TECH🍏 SERVICE🧳', 'Associação de Nhonguistas🇲🇿( Maputo)'
        ]; // Lista de grupos

        try {
            // Obter a mensagem marcada
            const quotedMsg = await msg.getQuotedMessage();

            // Iterar pela lista de grupos
            for (const groupName of groupList) {
                const targetChat = await client.getChats().then(chats =>
                    chats.find(chat => chat.name === groupName)
                );

                if (targetChat) {
                    // Obter os participantes do grupo
                    // const mentions = targetChat.participants.map(participant => participant.id._serialized);

                    // Verificar se é uma mensagem com mídia
                    if (quotedMsg.hasMedia) {
                        const media = await quotedMsg.downloadMedia();
                        await targetChat.sendMessage(media, {
                            caption: quotedMsg.body

                        });
                    } else {
                        await targetChat.sendMessage(quotedMsg.body);
                    }
                } else {
                    console.log(`Grupo "${groupName}" não encontrado.`);
                }
            }

            // Confirmar o envio
            await msg.reply('Mensagem enviada para todos os grupos da lista.');
        } catch (error) {
            console.error('Erro ao processar o comando:', error);
            await msg.reply('Ocorreu um erro ao enviar para os grupos.');
        }
    } else if (msg.body.startsWith('!sendToGroupX') && msg.hasQuotedMsg) {
        try {
            // Obter a mensagem citada
            const quotedMsg = await msg.getQuotedMessage();

            // Extrair a lista de grupos do comando
            const groupNames = msg.body.replace('!sendToGroupX', '').split(',').map(name => name.trim());

            // Obter todos os chats disponíveis
            const allChats = await client.getChats();

            // Função para dividir a lista de participantes em lotes menores
            const chunkArray = (array, size) => {
                const result = [];
                for (let i = 0; i < array.length; i += size) {
                    result.push(array.slice(i, i + size));
                }
                return result;
            };

            // Iterar sobre os nomes fornecidos
            for (const groupName of groupNames) {
                const targetChat = allChats.find(chat => chat.name === groupName);

                if (targetChat) {
                    // Obter os participantes do grupo
                    const groupParticipants = targetChat.participants.map(participant => participant.id._serialized);

                    // Dividir os participantes em partes de 500
                    const participantChunks = chunkArray(groupParticipants, 500);

                    // Enviar a mensagem em lotes e esperar 10 minutos entre cada lote
                    for (const [index, chunk] of participantChunks.entries()) {
                        if (quotedMsg.hasMedia) {
                            // Se a mensagem citada contém mídia, baixá-la
                            const media = await quotedMsg.downloadMedia();
                            await targetChat.sendMessage(media, {
                                caption: quotedMsg.body || ' ',
                                mentions: chunk,
                            });
                        } else {
                            // Caso contrário, apenas reenvie o texto com marcações
                            await targetChat.sendMessage(quotedMsg.body, {
                                mentions: chunk,
                            });
                        }

                        console.log(`Mensagem enviada para o grupo: ${groupName} - Lote ${index + 1} de ${chunk.length} participantes`);

                        // Esperar 10 minutos antes de enviar o próximo lote
                        if (index < participantChunks.length - 1) {
                            console.log(`Esperando 10 minutos antes de enviar o próximo lote para o grupo: ${groupName}`);
                            await new Promise(resolve => setTimeout(resolve, 10 * 60 * 1000)); // 10 minutos
                        }
                    }

                    console.log(`Todas as mensagens enviadas para o grupo: ${groupName}`);
                } else {
                    console.log(`Grupo não encontrado: ${groupName}`);
                    await msg.reply(`O grupo "${groupName}" não foi encontrado.`);
                }
            }
        } catch (error) {
            console.error('Erro ao processar o comando !sendToGroupX:', error);
            await msg.reply('Ocorreu um erro ao processar o comando.');
        }
    } else if (msg.body.startsWith('.envToMembers') && msg.hasQuotedMsg) {
        // Obter a mensagem citada
        const quotedMsg = await msg.getQuotedMessage();

        // Nome do grupo de destino
        const groupName = msg.body.replace('.envToMembers', '').trim();

        // Obter todos os chats disponíveis
        const allChats = await client.getChats();
        const targetChat = allChats.find(chat => chat.isGroup && chat.name === groupName);

        if (!targetChat) {
            console.log(`Grupo não encontrado: ${groupName}`);
            await msg.reply(`O grupo "${groupName}" não foi encontrado.`);
            return;
        }

        // Obter os participantes do grupo de destino (excluindo o próprio bot)
        const groupParticipants = targetChat.participants
            .filter(participant => !participant.isAdmin) // Filtra apenas não administradores
            .map(participant => participant.id._serialized);

        // Intervalo entre mensagens (2 segundos)
        const delayBetweenMessages = 10000;

        for (const [index, participant] of groupParticipants.entries()) {
            setTimeout(async () => {
                try {
                    if (quotedMsg.hasMedia) {
                        // Se a mensagem citada contém mídia, baixá-la
                        const media = await quotedMsg.downloadMedia();
                        await client.sendMessage(participant, media, {
                            caption: quotedMsg.body || ' ',
                        });
                    } else {
                        // Caso contrário, apenas reenvie o texto
                        await client.sendMessage(participant, quotedMsg.body);
                    }
                    console.log(`Mensagem enviada para: ${participant}`);
                } catch (error) {
                    console.error(`Erro ao enviar mensagem para ${participant}:`, error);
                }
            }, index * delayBetweenMessages);
        }

        await msg.reply(`✅ Mensagem enviada individualmente para os membros do grupo "${groupName}".`);
    }
});