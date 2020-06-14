require('dotenv').config();
const { Client } = require('discord.js');
const discord = require('discord.js');
const client = new Client({ partials: ['MESSAGE', 'REACTION']});
const db = require('./database');
const Ticket = require('./models/Ticket');
const TicketConfig = require('./models/TicketConfig');

client.once('ready', () => {
    console.log('Bot ist live');
    client.user.setActivity('§intbot & §help', { type: 'WATCHING' });
    db.authenticate()
        .then(() => {
            console.log('DB Verbunden');
            Ticket.init(db);
            TicketConfig.init(db);
            Ticket.sync();
            TicketConfig.sync();
        }).catch((errr) => console.log(errr));
});

client.on('message', async (message) => {

    if (message.author.bot || message.channel.type === 'dm') return;

    if (message.content.toLowerCase() === '§intbot' && message.guild.ownerID === message.author.id) {
        try {
            const filter = (m) => m.author.id === message.author.id;
            message.channel.send('Please enter the message ID for this ticket.\n setup in Reaction Channel');
            const msgId = (await message.channel.awaitMessages(filter, { max: 1 })).first().content;
            const fetchMsg = await message.channel.messages.fetch(msgId);
            message.channel.send('Please enter the Category ID for this Bot.');
            const categoryId = (await message.channel.awaitMessages(filter, { max: 1 })).first().content;
            const CategoryChannel = client.channels.cache.get(categoryId);
            message.channel.send('Enter the Adminroles that should see the tickets');
            const roles = (await message.channel.awaitMessages(filter, { max: 1 })).first().content.split(/,\s*/);
            if (fetchMsg && CategoryChannel) {
                for (const roleId of roles) {
                    if (!message.guild.roles.cache.get(roleId)) throw new Error('Role not found');
                }
                const ticketConfig = await TicketConfig.create({
                    messageId: msgId,
                    guildId: message.guild.id,
                    roles: JSON.stringify(roles),
                    parentId: CategoryChannel.id
                });
                message.channel.send('Config saved in Database');
                await fetchMsg.react('🎫');
            } else throw new Error('Invalid fields');

        } catch (err) {
            console.log(err);
            message.channel.send('UPS something weent wrong!')
        }
    }
});

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.emoji.name === '🎫') {
        const ticketConfig = await TicketConfig.findOne({ where: { messageId: reaction.message.id }});
        if (ticketConfig) {
            const findTicket = await Ticket.findOne({ where: { authorId: user.id, resolved: false }});
            if (findTicket) user.send('You have already a Ticket open');
            else {
                console.log('Creating new Ticket');
                try{
                    const roleIdsString = ticketConfig.getDataValue('roles');
                    console.log(roleIdsString);
                    const roleIds = JSON.parse(roleIdsString);
                    const permissions = roleIds.map((id) => ({ allow: 'VIEW_CHANNEL', id }));
                    const channel = await reaction.message.guild.channels.create('ticket', {
                        parent: ticketConfig.getDataValue('parentId'),
                        permissionOverwrites: [
                            { deny: 'VIEW_CHANNEL', id: reaction.message.guild.id },
                            { allow: 'VIEW_CHANNEL', id: user.id},
                            ...permissions
                        ]
                    });

                    const msg = await channel.send('React to this message to close this ticket');
                    await msg.react('🔒');

                    const ticket = await Ticket.create({
                        authorId: user.id,
                        channelId: channel.id,
                        guildId: reaction.message.guild.id,
                        resolved: false,
                        closedMessageId: msg.id
                    });

                    const ticketId = String(ticket.getDataValue('ticketId')).padStart(4, 0);
                    await channel.edit({ name: `ticket-${ticketId}`});


                } catch (err) {
                    console.log(err);
                }
            }
        } else {
            console.log('No ticket config found!');
        }
    } else if (reaction.emoji.name === '🔒') {
        const ticket = await Ticket.findOne({ where: { channelId: reaction.message.channel.id }});
        if (ticket) {
            const closedMessageId = ticket.getDataValue('closedMessageId');
            if (reaction.message.id === closedMessageId) {
                console.log('reacted');
                await reaction.message.channel.updateOverwrite(ticket.getDataValue('authorId'), {
                    VIEW_CHANNEL: false
                }).catch((err) => console.log(err));
                ticket.resolved = true;
                await ticket.save();
                console.log('update ticket');
            }
        }
    }
});



client.login(process.env.BOT_TOKEN);
