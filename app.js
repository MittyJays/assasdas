const { VK, Keyboard } = require("vk-io");
const { APIError, apiErrors } = require('vk-io');
const mongo = require("mongoose");
const fs = require('fs');
const readline = require('readline');
const Levenshtein = require('natural').LevenshteinDistance;
const request = require('request-promise');
const parseString = require('xml2js').parseString;
const rq = require("prequest");
const weather = require('./weather')

//Вспомогательные функции
const utils = require("./utils");

//Настройка
const tokens = require("./config/tokens.json");
const tokensuser = require("./config/tokensuser.json");
const mongoURL = require('./config/mongoURL.json');
const admins = require('./config/admins.json');
const vips = require('./config/vips.json');
const bans = require('./config/bans.json');
let adminchat = 12;

//Базы
const houses = require('./base/houses.json');
const computers = require('./base/computers.json');
const phones = require('./base/phones.json');
const apartments = require('./base/apartments.json');
const works = require('./base/works.json');
const CARS = require('./base/cars.json');

//Смена временной зоны
process.env.TZ = "Europe/Moscow";

//Подключение к ВК
const vk = new VK(tokens);
const vkuser = new VK(tokensuser);
const BotGroupId = vk.options.pollingGroupId

const { updates } = vk;
const keyboard = Keyboard;

let likes = [];

//Префикс
const prefix = /^([ЁЕёе][Жж][ЕИЫеиы][Кк]|\[club147985694\|(.*|.)\])([.,\s]+|$)/;
//Регулярное выражение для режима без обращения
const mentionRegexp = new RegExp(`\\[club${vk.options.pollingGroupId}\\|(.*)\\]`);

//Подключение базы данных
mongo.connect(mongoURL, {useNewUrlParser: true}, (err, client) => {
	if (err) throw err;
	if (!client) {
		console.log('Ошибка! Соединение с базой данных не выполнено!')
	} else {
		console.log('Соединение с базой данных успешно выполнено!')
	}
});

//Схема базы пользователей
const userchema = new mongo.Schema({
	uid: Number,
	id: Number,
	balance: Number,
	bank: Number,
	rating: Number,
	diamonds: Number,
	work: Number,
	business: Number,
	tag: String,
	mention: Boolean,
	mentiontop: Boolean,
	seifvalue: Number,
	bigseifvalue: Number,
	lvl: Number,
	exp: Number,
	regDate: Number,
	tbonus: Number,
	twork: Number,
	tcrack: Number,
	ttransfer: Number,
	treport: Number,
	xmas: Boolean,
	ref: Number,
	bantop: Boolean,
	banreport: Boolean,
	banpay: Boolean,
	buttons: Array,
	energy: Number,
	car: Number,
	toplivo: Number,
	ttaxi: Number,
	admingive: Number,
	house: Number,
	apartment: Number,
	phone: Number,
	computer: Number,
	bangive: Boolean
});

//Схема базы бесед
const chatSchema = new mongo.Schema({
	cid: Number,
	id: Number,
	gamemode: Boolean,
	buttons: Array
});

//Схема базы для рассылок
const mallingSchema = new mongo.Schema({
	id: Number,
	mute: Boolean
});

//Промокоды
const promoSchema = new mongo.Schema({
	title: String,
	count: Number,
	users: Array,
	sum: Number
});

//Логи передач
const logtransferSchema = new mongo.Schema({
	from: Number,
	to: Number,
	date: Number,
	amount: Number
});

//Таймеры
const timerSchema = new mongo.Schema({
	course: Number,
	tcourse: Number,
	tcourseupdated: Number,
	coursetoplivo: Number,
	tcoursetoplivo: Number,
	tcoursetoplivoupdated: Number,
	globaltoplivo: Number,
	tglobaltoplivo: Number,
	tglobaltoplivoupdated: Number
});

//Схема базы бесед
const lobbiesSchema = new mongo.Schema({
	cid: Number,
	id: Number,
	players: Array,
	bank1: Number,
	bank2: Number
});

const User = mongo.model("User", userchema);
const Chat = mongo.model("Chat", chatSchema);
const Malling = mongo.model("Malling", mallingSchema);
const Promo = mongo.model("Promo", promoSchema);
const Log = mongo.model("Log", logtransferSchema);
const Timer = mongo.model("Timer", timerSchema);
const Lobbi = mongo.model("Lobbi", lobbiesSchema);

setImmediate(async () => {
	alltimers = await allTimers();
});

//Статистика
let stats = {
	messages: {
		inbox: 0,
		outbox: 0
	},
	new_users: 0,
	new_chats: 0,
	bot_start: Date.now()
}

//Обработка событий
updates.use(async (message, next) => {
    if (message.type === 'message' && message.isOutbox || message.senderId < 0) {
        return;
    }

    try {
        await next();
    } catch (error) {
		if (error instanceof APIError) {
			if (error.code === apiErrors.WRONG_PARAMETER) {
				return console.error(`Wrong parameter:`, error.params);
			}
	
			return console.error(`APIError №${error.code} ${error.message}`);
		}
        console.error('Error:', error);
	}
});

//Обработка сообщений
updates.on("message", async (message, next) => {
	if(bans.indexOf(message.senderId) !== -1) return;

	let _user = await User.findOne({ id: message.senderId });
	let _chat = await Chat.findOne({ id: message.chatId });
	let _malling = await Malling.findOne({ id: message.peerId });

	//Добавление диалога для рассылки
	if(!_malling) {
		let $malling = new Malling({
			id: message.peerId,
			mute: false
		});

		await $malling.save();
		console.log(`[${unixStamp(getUnix())}] ${message.isChat ? "chat"+message.chatId+", @id"+message.senderId : "@id"+message.senderId}: New malling - @id${message.peerId}`);
	}

	//Создание пользователя
	if(!_user) {
		let [user_info] = await vk.api.call("users.get", { user_id: message.senderId });

		let count = await User.countDocuments();

		let $user = new User({
			uid: count + 1,
			id: message.senderId,
			balance: 500,
			bank: 0,
			rating: 0,
			diamonds: 0,
			work: 0,
			business: 0,
			tag: user_info.first_name,
			mention: false,
			mentiontop: true,
			seifvalue: 0,
			bigseifvalue: 0,
			lvl: 1,
			regDate: getUnix(),
			tbonus: 0,
			twork: 0,
			tcrack: 0,
			ttransfer: 0,
			treport: 0,
			xmas: false,
			ref: 0,
			bantop: false,
			banreport: false,
			banpay: false,
			buttons: ["Помощь", "Игра", "Контент", "Кнопки выкл"],
			energy: 0,
			car: 0,
			toplivo: 0,
			ttaxi: 0
		});

		await $user.save();
		console.log(`[${unixStamp(getUnix())}] ${message.isChat ? "chat"+message.chatId+", @id"+message.senderId : "@id"+message.senderId}: New user - @id${message.senderId} #${count}`);

		//Приветствие нового пользователя в лс сообщества
		if(!message.isChat) {
			await message.send(`${user_info.first_name}, привет! Рад познакомиться.\nУзнать команды бота - <<Помощь>>\nСкрыть кнопки - <<Кнопки выкл>>\nВступай в игровую беседу с активными игроками - https://vk.me/join/AJQ1d583Sg4wztBxO5LRj8ZU`, {
				keyboard: generateKeyboard(["Помощь", "Игра", "Контент", "Кнопки выкл"])
			});
		}

		stats.new_users += 1;
	}

	//Добавление беседы в базу бесед
	if(message.isChat) {
		if(!_chat) {
			let count = await Chat.countDocuments();
	
			let $chat = new Chat({
				cid: count + 1,
				id: message.chatId,
				gamemode: false,
				buttons: ["Помощь", "Игра", "Контент", "Игровой режим вкл", "Кнопки выкл"]
			});
	
			await $chat.save();
			console.log(`[${unixStamp(getUnix())}] ${message.isChat ? "chat"+message.chatId+", @id"+message.senderId : "@id"+message.senderId}: New chat - @id${message.senderId} #${count}`);

			//Приветствие новой беседы
			await message.send(`Здравствуйте! Я игровой бот Ёжик.\nСписок основных команд - <<Помощь>>.\nЧтобы использовать игровые команды без обращения к боту в данной беседе, необходимо дать сообществу доступ ко всей переписке в беседе, затем включить игровой режим, написав команду - <<Ёжик гм вкл>>.\nТакже, вы можете вступить в игровую беседу с активными игроками - https://vk.me/join/AJQ1d583Sg4wztBxO5LRj8ZU`);
	
			stats.new_chats += 1;
		}
	}

	//Объявления пользователя и бесед
	message.user = await User.findOne({ id: message.senderId });
	message.chat = await Chat.findOne({ id: message.chatId });
	message.malling = await Malling.findOne({ id: message.peerId });

	//Обработка сообщений в зависимости от параметра "Игровой режим"
	if(message.isChat) {
		//Ответ пользователю в беседе
		message.reply = (text, params) => message.send(`${message.user.mention ? `@id${message.user.id} (${message.user.tag})` : `${message.user.tag}`}, ${text}`, params);

		if (message.hasText && message.text && message.text.toLowerCase().match(/лол/)) {
			let lol =  ['лол', 'кек', 'кек, чебурек']
			return message.reply(utils.pick(lol))
		}

		if (message.chat.gamemode) {
			if (mentionRegexp.test(message.text)) message.text = message.text.replace(mentionRegexp, "").trim();

			stats.messages.inbox += 1;

			let start = Date.now();
			await next();
	
			let end = Date.now();
			console.log(`[${unixStamp(getUnix())}] ${message.isChat ? "chat"+message.chatId+", @id"+message.senderId : "@id"+message.senderId}: ${message.text.slice(0, 64)} handled in ${end-start} ms`);
		} else {
			if (message.hasText && message.text.toLowerCase().match(prefix)) {
				message.text = message.text.replace(prefix, '').trim();

				stats.messages.inbox += 1;

				let start = Date.now();
				await next();
			
				let end = Date.now();
				console.log(`[${unixStamp(getUnix())}] ${message.isChat ? "chat"+message.chatId+", @id"+message.senderId : "@id"+message.senderId}: ${message.text.slice(0, 64)} handled in ${end-start} ms`);
			} else if (message.hasForwards && message.hasText) {
				for (let i = 0; i < message.forwards.length; i++) {
					if (message.forwards[i].senderId === -BotGroupId) {
						message.text = message.text.replace(mentionRegexp, "").trim();
	
						stats.messages.inbox += 1;
		
						let start = Date.now();
						await next();
					
						let end = Date.now();
						console.log(`[${unixStamp(getUnix())}] ${message.isChat ? "chat"+message.chatId+", @id"+message.senderId : "@id"+message.senderId}: ${message.text.slice(0, 64)} handled in ${end-start} ms`);
						break;
					}
				}
			} else if (message.hasReplyMessage && message.hasText && message.replyMessage.senderId === -BotGroupId) {
				message.text = message.text.replace(mentionRegexp, "").trim();

				stats.messages.inbox += 1;

				let start = Date.now();
				await next();
			
				let end = Date.now();
				console.log(`[${unixStamp(getUnix())}] ${message.isChat ? "chat"+message.chatId+", @id"+message.senderId : "@id"+message.senderId}: ${message.text.slice(0, 64)} handled in ${end-start} ms`);
			} else return;
		}
	} else {
		//Ответ пользователю в лс сообщества
		message.reply = (text, params) => message.send(`${text.capitalize()}`, params);

		stats.messages.inbox += 1;

		let start = Date.now();
		await next();
	
		let end = Date.now();
		console.log(`[${unixStamp(getUnix())}] ${message.isChat ? "chat"+message.chatId+", @id"+message.senderId : "@id"+message.senderId}: ${message.text.slice(0, 64)} handled in ${end-start} ms`);
	}
});

updates.hear(/^(?:помощь|команды|начать|start|help)$/i, message => message.reply(`
❓ Команды бота:
 • Ку - проверить работу бота
 • Игра - список основных игровых команд
 • Контент - список команд различного контента
 • Время - текущее время
 • Инфа [что-то] - вероятность в % чего-то
 • Шанс [что-то] - предсказание о чём-то
 • Выбери [что-то] или [что-то] - выбрать что-то из двух
 • Когда [что-то] - когда произойдет что-то
 • Кто тут [определение] - кто есть кто в беседе
 • Обзови - обозвать человека (если переслать чьё-либо сообщение, обзывает его отправителя)
 • Онлайн - список участников беседы, которые сейчас онлайн (созвать)

 • Ник [ник/вкл/выкл] - задать ник, вкл/выкл упоминание в беседах ботом
 • Ник топ [вкл/выкл] - вкл/выкл гиперссылки на вашу страницу в топе
 • Гм [вкл/выкл] - вкл/выкл игровой режим в беседе (режим быстрых команд) 
 • Кнопки [вкл/выкл] - вкл/выкл кнопки
 • Кнопка [текст/удалить] - бинды для кнопок
 • Уведомления [вкл/выкл] - вкл/выкл получение рассылок

 • Репорт [фраза] - ошибки или пожелания
${vips.indexOf(message.senderId) !== -1 ? ` • Админка - зайти в админку` : ``}`));

updates.hear(/^(?:игра|игровые команды)$/i, message => message.reply(`
♨ Игровые команды:
 • Профиль - общая информация о вас
 • Баланс - посмотреть баланс игрока
 • Банк [сумма/снять сумма] - операции с банковским счетом
 • Передать [сумма] + пересланное сообщение игрока - передать деньги игроку
 • Курс - курс алмазов (меняется каждые 10 минут)
 • Алмаз [купить кол-во/продать кол-во] - покупка/продажа алмазов
 • Магазин - покупка имущества
 • Бонус - ежедневный бонус
 • Рейтинг - ваш рейтинг (купить рейтинг - Рейтинг [кол-во])
 • Топ - категории топа лучших игроков
 🎲 Игры:
⠀ • Казино [сумма]
⠀ • Стаканчик [1-3] [сумма]
⠀ • Сейф [10-99]
⠀ • Бигсейф [100-999]
 👔 Работа - список работ
⠀ • Работать
⠀ • Уволиться
 🧩 Другое:
 ⠀ 🖥 Взломать - хакерство
 ⠀ 🚖 Таксовать - таксовать на машине
 ⠀ 🚘 Гонка [ставка] - начать гонку на машине
 ⠀ 🚘 Лобби - информация о гоночной лобби в беседе
 ⠀ 🚘 Машина - информация о вашей машине
⠀ • Машина продать - продать машину (90% от суммы)
⠀ • Машины - список доступных для покупки машин
⠀ • Заправка - кол-во топлива на заправке
⠀ • Курс топлива - цены на бензин
⠀ • Топливо [купить кол-во/продать кол-во] - покупка/продажа топлива`));

updates.hear(/^(?:контент)$/i, message => message.reply(`команды различного контента:

 • Вики [запрос] - википедия по запросу
 • Новости - последние новости
 • Новости [тема] - последние новости по темам (доступные темы новостей: армия, авто, мир, главное, игры, интернет, кино, музыка, политика, наука, экономика, спорт, происшествия, космос (пример использования: Новости игры))
 • Анекдот
 • Перформанс
 • Мемы
 • Сохра
 • Музло
 • Видео [запрос] - поиск видео
 • Гифки [запрос] - поиск гифок`));

updates.hear(/^(?:ping|ку)$/i, async (message) => {
	message.send(`Бот работает.`)
});

// ИГРОВЫЕ КОМАНДЫ*************************************************************************

updates.hear(/^(?:профиль|📒\sпрофиль)$/i, async (message) => {
	let text = ``;
	message.append = (_text) => text += _text+"\n";

	message.append("твой профиль:");
	message.append("🔎 ID: " + message.user.uid);
	message.append("💰 Денег: " + utils.spaces(message.user.balance) + "$");
	if(message.user.diamonds) message.append("💎 Алмазов: " + utils.spaces(message.user.diamonds));
	if(message.user.bank) message.append("💳 В банке: " + utils.spaces(message.user.bank) + "$");
	message.append("👑 Рейтинг: " + message.user.rating);
	message.append("📈 Уровень: " + message.user.lvl);
	if(message.user.work) message.append("👔 Работа: " + works.find((x) => x.id === message.user.work).name);
	if(message.user.house || message.user.apartment || message.user.phone || message.user.computer || message.user.car || message.user.toplivo) message.append("\n🔑 Имущество:");

	if(message.user.car) message.append(`&#4448;🚘 Машина: ${CARS.find((x) => x.id === message.user.car).name}`);
	if(message.user.toplivo) message.append("&#4448;📈 Топлива: " + utils.fspaces(message.user.toplivo) + " л");
	if(message.user.house) message.append(`&#4448;🏠 Дом: ${houses.find((x) => x.uid === message.user.house).name}`);
	if(message.user.apartment) message.append(`&#4448;🌇 Квартира: ${apartments.find((x) => x.uid === message.user.apartment).name}`);
	if(message.user.phone) message.append(`&#4448;📱 Телефон: ${phones.find((x) => x.uid === message.user.phone).name}`);
	if(message.user.computer) message.append(`&#4448;🖥 Компьютер: ${computers.find((x) => x.uid === message.user.computer).name}`);

	message.append("\n📗 Дата регистрации: " + unixStamp(message.user.regDate));
	return message.reply(text);
});

updates.hear(/^(?:баланс)$/i, async (message) => {
	return message.reply(`на руках: ${utils.spaces(message.user.balance)}$${message.user.diamonds ? `\n💎 Алмазов: ${utils.spaces(message.user.diamonds)}` : ``}${message.user.bank ? `\n💳 В банке: ${utils.spaces(message.user.bank)}$` : ``}`);
});

updates.hear(/^(?:банк\sснять)\s?(.*)?$/i, async (message) => {
	if(!message.$match[1]) return message.reply(`укажите сумму, которую вы хотите снять с вашего банковский счета! Пример: "Банк снять 100"`);
	message.$match[1] = utils.parseBet(message.$match[1], message.user.bank);
	if(!message.$match[1]) return;

	if(message.$match[1] > message.user.bank) return message.reply(`недостаточно денег. ${utils.getSadEmoji()}`);
	else if(message.$match[1] <= message.user.bank) {
		await message.user.inc("balance", message.$match[1]);
		await message.user.dec("bank", message.$match[1]);

		return message.reply(`вы сняли ${utils.spaces(message.$match[1])}$
		💳 Остаток на счёте: ${utils.spaces(message.user.bank)}$
		💰 Ваш баланс: ${utils.spaces(message.user.balance)}$
		Сумма в банке увеличивается каждый час на определенное кол-во процентов, зависимое от вашего уровня (больше сумма и уровень - больше прибыль).
		Учтите, что в игре есть налог на богатство, и если вы имеете на банковском счету больше 1,000,000,000$, то с него каждый час списываются кол-во процентов, зависимое от вашего уровня(больше уровень - меньше налог).`);
	}
});

updates.hear(/^(?:банк)\s?(.*)?$/i, async (message) => {
	if(!message.$match[1]) return message.reply(`укажите сумму, которую вы хотите внести на ваш банковский счет! Пример: "Банк 100"`);
	message.$match[1] = utils.parseBet(message.$match[1], message.user.balance);
	if(!message.$match[1]) return;

	if(message.$match[1] > message.user.balance) return message.reply(`недостаточно денег. ${utils.getSadEmoji()}`);
	else if(message.$match[1] <= message.user.balance) {
		await message.user.inc("bank", message.$match[1]);
		await message.user.dec("balance", message.$match[1]);

		return message.reply(`вы положили на свой банковский счёт ${utils.spaces(message.$match[1])}$
		💳 Остаток на счёте: ${utils.spaces(message.user.bank)}$
		💰 Ваш баланс: ${utils.spaces(message.user.balance)}$
		Сумма в банке увеличивается каждый час на определенное кол-во процентов, зависимое от вашего уровня (больше сумма и уровень - больше прибыль).
		Учтите, что в игре есть налог на богатство, и если вы имеете на банковском счету больше 1,000,000,000$, то с него каждый час списываются кол-во процентов, зависимое от вашего уровня(больше уровень - меньше налог).`);
	}
});

updates.hear(/^(?:рейтинг)\s?(.*)?$/i, async (message) => {
	if(!message.$match[1]) return message.reply(`ваш рейтинг: ${utils.spaces(message.user.rating)}👑`);
	if(message.$match[1].startsWith("продать")) {
		message.$match[1] = utils.parseBet(message.$match[1].replace(/(продать)/ig, "").trim(), message.user.rating);
		if(!message.$match[1]) return;

		if(message.$match[1] <= 0) return;
		if(message.$match[1] > message.user.rating) return message.reply(`недостаточно рейтинга. ${utils.getSadEmoji()}`);
		else if(message.$match[1] <= message.user.rating) {
			await message.user.dec("rating", message.$match[1]);
			await message.user.inc("balance", message.$match[1] * 150000000);

			return message.reply(`вы продали ${utils.spaces(message.$match[1])}👑 за ${utils.spaces(message.$match[1] * 150000000)}$`);
		}

		return;
	}

	message.$match[1] = Math.floor(Number(message.$match[1].replace(/(к|k)/ig, "000").replace(/(м|m)/ig, "000000")));

	if(message.$match[1] <= 0) return;

	if(( message.$match[1] * 250000000 ) > message.user.balance) return message.reply(`недостаточно денег. Стоимость рейтинга - 250,000,000$ ${utils.getSadEmoji()}`);
	else if(( message.$match[1] * 250000000) <= message.user.balance) {
		await message.user.dec("balance", ( message.$match[1] * 250000000 ));
		await message.user.inc("rating", message.$match[1]);

		return message.reply(`вы повысили свой рейтинг на ${utils.spaces(message.$match[1])}👑 за ${utils.spaces(message.$match[1] * 250000000)}$
		💰 На руках: ${utils.spaces(message.user.balance)}$`);
	}
});

updates.hear(/^(?:передать)\s?(.*)?$/i, async (message) => {
	if(!message.$match[1]) return message.reply(`укажите сумму для передачи! Пример: "Передать 100"`);
	if(message.user.banpay) return message.reply(`вы не можете передавать деньги!`);

	if (!message.forwards[0]) {
		return message.reply(`перешлите сообщение игрока, которому вы хотите передать деньги.`);
	} else {
		if(message.forwards[0]) {
			let $user = await User.findOne({ id: message.forwards[0].senderId });

			if(!$user) return message.reply(`игрок не найден. Перешлите сообщение существующего игрока.`);
			if($user.id === message.user.id) return message.reply(`вы не можете передавать деньги самому себе.`);
		
			if($user.banpay) return message.reply(`вы не можете передавать деньги этому игроку.`);
		
			message.$match[1] = utils.parseBet(message.$match[1], message.user.balance);
		
			if(!message.$match[1]) return;
			if(message.$match[1] <= 0) return message.reply(`сумма для передачи не может быть меньше или равной 0.`);
	
		
			if(message.user.ttransfer > getUnix()) return message.reply(`вы сможете передавать деньги через ${unixStampLeft(message.user.ttransfer - Date.now())}`);

			if($user.lvl < 100 && message.$match[1] > 10000) return message.reply(`вы не можете передавать больше 10,000$ игроку, уровень которого меньше 100. Передайте меньше.`);
		
			if(message.$match[1] > message.user.balance) return message.reply(`недостаточно денег. ${utils.getSadEmoji()}`);
			else if(message.$match[1] > 100000) return message.reply(`лимит передач составляет 100,000$. ${utils.getSadEmoji()}`);
			else if(message.$match[1] <= message.user.balance) {
		
				await message.user.set("ttransfer", getUnix() + 1800000);
				await message.user.dec("balance", message.$match[1]);
				await $user.inc("balance", message.$match[1]);
		
				let log = new Log({
					from: message.senderId,
					to: $user.id,
					date: getUnix(),
					amount: message.$match[1]
				});
		
				await log.save();
				return message.reply(`вы передали игроку "${$user.tag}" ${utils.spaces(message.$match[1])}$`);
			}
		} else if (message.replyMessage[0]) {
			let $user = await User.findOne({ id: message.replyMessage[0].senderId });
	
			if(!$user) return message.reply(`игрок не найден. перешлите сообщение существующего игрока.`);
			if($user.id === message.user.id) return message.reply(`вы не можете передавать деньги самому себе.`);
		
			if($user.banpay) return message.reply(`вы не можете передавать деньги этому игроку.`);
		
			message.$match[1] = utils.parseBet(message.$match[1], message.user.balance);
		
			if(!message.$match[1]) return;
			if(message.$match[1] <= 0) return message.reply(`сумма для передачи не может быть меньше или равной 0.`);
		
			if(message.$match[1] > 100000) return message.reply(`лимит передач составляет 100,000$. ${utils.getSadEmoji()}`);
		
			if(message.user.ttransfer > getUnix()) return message.reply(`вы сможете передавать деньги через ${unixStampLeft(message.user.ttransfer - Date.now())}`);
		
			if(message.$match[1] > message.user.balance) return message.reply(`недостаточно денег. ${utils.getSadEmoji()}`);
			else if(message.$match[1] <= message.user.balance) {
		
				await message.user.set("ttransfer", getUnix() + 1800000);
				await message.user.dec("balance", message.$match[1]);
				await $user.inc("balance", message.$match[1]);
		
				let log = new Log({
					from: message.senderId,
					to: $user.id,
					date: getUnix(),
					amount: message.$match[1]
				});
		
				await log.save();
				return message.reply(`вы передали игроку "${$user.tag}" ${utils.spaces(message.$match[1])}$`);
			}
		} else {
			return message.reply(`ошибка.`);
		}
	}
});

updates.hear(/^(?:топ)$/i, message => message.reply(`топ по категориям:
 - Топ рейтинг - топ 10 лучших игроков по рейтингу
 - Топ уровень - топ 10 лучших игроков по уровню
 - Топ банк - топ 10 лучших игроков по денежным средствам`));

updates.hear(/^(?:топ рейтинг)$/i, async (message) => {
	await message.reply("самые лучшие игроки по рейтингу:\n\n" + top, {disable_mentions: 1});
});

updates.hear(/^(?:топ уровень)$/i, async (message) => {
	await message.reply("самые опытные игроки:\n\n" + toplvl, {disable_mentions: 1});
});

updates.hear(/^(?:топ банк)$/i, async (message) => {
	await message.reply("самые богатые игроки:\n\n" + topbank, {disable_mentions: 1});
});

updates.hear(/^(?:бонус|💎\sбонус)$/i, async (message) => {
	if(message.user.tbonus > getUnix()) return message.reply(`вы сможете получить бонус через ${unixStampLeft(message.user.tbonus - Date.now())}`);
	let prize = utils.pick([10000, 10000, 10000, 50000, 10000, 10000, 50000, 100000, 10000, 10000, 50000, 10000, 50000]);

	await message.user.inc("balance", prize);
	await message.user.set("tbonus", getUnix() + 86400000);

	await message.reply(`вы выиграли ${utils.spaces(prize)}$
	💰 На руках: ${utils.spaces(message.user.balance)}$`);
});

updates.hear(/^(?:работа|работы)\s?([0-9]+)?$/i, async (message) => {
	if(!message.$match[1]) {
		return message.reply(`вы можете устроиться на одну из профессий (повышайте уровень, работая, чтобы получить доступ к новым работам. Повысить уровень также можно таксуя или участвуя и побеждая в гонках на своей машине.):
		
		${
			works
			.filter((x) => x.lvl <= message.user.lvl)
			.map((x, i) => `🔹 ${i + 1}. ${x.name} — ~${utils.spaces(x.min)}$`)
			.join("\n")
		}
		
		Устроиться: работа [номер работы]`);
	}

	const work = works.find((x) => x.id == message.$match[1]);
	if(!work) return console.log(work);

	if(message.user.work) return message.reply(`у вас уже есть работа! Чтобы уволиться, используйте команду "Уволиться".`);

	if(work.lvl > message.user.lvl) return message.reply(`пока-что вы не можете устроиться на эту работу!`);
	else if(work.lvl <= message.user.lvl) {
		message.user.set("work", work.id);
		return message.reply(`вы устроились работать <<${work.name}>>`);
	}
});

updates.hear(/^(?:работать|🔨\sработать)$/i, async (message) => {
	if(!message.user.work) return message.reply(`у вас нет работы. Чтобы посмотреть список доступных работ, используйте команду "Работы".`);
	if(message.user.twork > getUnix()) return message.reply(`вы сможете работать через ${unixStampLeft(message.user.twork - Date.now())}`);

	await message.user.set("twork", getUnix() + 600000);
	let work = works.find((x) => x.id === message.user.work);

	let earn = utils.random(work.min, work.max) + message.user.lvl;

	await message.user.inc("balance", earn);
	await message.user.inc("lvl", 5);

	return message.reply(`вы заработали ${utils.spaces(earn)}$ (баланс: ${utils.spaces(message.user.balance)}$). Получено +5 Lvl (текущий уровень: ${utils.spaces(message.user.lvl)}).`);
});

updates.hear(/^(?:уволиться)$/i, async (message) => {
	await message.user.set("work", 0);
	return message.reply(`вы уволились.`);
});

updates.hear(/^(?:казино)\s?(.*)?$/i, async (message) => {
	if(!message.$match[1]) return message.reply(`укажите вашу ставку. Пример: "Казино 100"`);
	message.$match[1] = utils.parseBet(message.$match[1], message.user.balance);
	if(message.$match[1] <= 0) return message.reply(`ставка не может быть меньше или равной 0`);

	if(message.$match[1] > message.user.balance) return message.reply(`недостаточно денег. ${utils.getSadEmoji()}`);
	else if(message.$match[1] <= message.user.balance) {
		await message.user.dec("balance", message.$match[1]);
		let cof = utils.pick([0.75, 0.50, 2, 4, 0.50, 0.75, 10, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.25, 0.25]);

		await message.user.inc("balance", message.$match[1] * cof);
		return message.reply(`${cof < 1 ? `вы проиграли ${utils.spaces(message.$match[1] - (message.$match[1] * cof))}$` : `вы выиграли ${utils.spaces(message.$match[1] * cof)}$`} (x${cof}) ${cof <= 0 ? utils.getSadEmoji() : ``}
		💰 Ваш баланс: ${utils.spaces(message.user.balance)}$`);
	}
});

updates.hear(/^(?:стаканчик)\s([1-3])\s(.*)$/i, async (message) => {
	message.$match[2] = utils.parseBet(message.$match[2], message.user.balance);
	if(message.$match[2] <= 0) return message.reply(`ставка не может быть меньше или равной 0`);

	if(message.$match[2] > message.user.balance) return message.reply(`недостаточно денег. ${utils.getSadEmoji()}`);
	else if(message.$match[2] <= message.user.balance) {
		await message.user.dec("balance", message.$match[2]);
		let rand = utils.random(1, 3);

		if(rand == message.$match[1]) {
			await message.user.inc("balance", message.$match[2] * 2);
			return message.reply(`вы выиграли ${utils.spaces(message.$match[2] * 1.5)}$
			💰 Ваш баланс: ${utils.spaces(message.user.balance)}$`);
		} else {
			return message.reply(`вы проиграли ${utils.spaces(message.$match[2])}$
			💰 Ваш баланс: ${utils.spaces(message.user.balance)}$`);
		}
	}
});

updates.hear(/^(?:сейф)\s?([0-9]+)?$/i, async (message) => {
	if(!message.$match[1]) return message.reply(`укажите число от 10 до 99!`);
	if(message.$match[1] < 10 || message.$match[1] > 99) {
		return message.reply(`введите число от 10 до 99!`);
	}
	let rand = utils.random(10, 99);
	
	seifchislo = Number(message.$match[1]);

	if(seifchislo == message.user.seifvalue) {
		return message.reply('нельзя вводить одно и тоже число дважды!')
	}

	await message.user.set("seifvalue", seifchislo);

	if(rand == seifchislo) {
		await message.user.inc("balance", 1000000);
		return message.reply(`вы успешно открыли сейф! ✅
		💰 Вам начислено 1,000,000$`);
	} else return message.reply(`вы не отгадали код! Код был <<${rand}>>.
	🔥 Не отчаивайтесь, попытки неограничены!
	💰 Если отгадаете код, то вы получите 1,000,000$`);
});

updates.hear(/^(?:бигсейф)\s?([0-9]+)?$/i, async (message) => {
	if(!message.$match[1]) return message.reply(`укажите число от 100 до 999!`);
	if(message.$match[1] < 100 || message.$match[1] > 999) {
		return message.reply(`введите число от 100 до 999!`);
	}
	let rand = utils.random(100, 999);

	bigseifchislo = Number(message.$match[1]);

	if(bigseifchislo == message.user.bigseifvalue) {
		return message.reply('нельзя вводить одно и тоже число дважды!')
	}

	await message.user.set("bigseifvalue", bigseifchislo);

	if(rand == bigseifchislo) {
		await message.user.inc("balance", 1000000000);
		return message.reply(`вы успешно открыли сейф! ✅
		💰 Вам начислено 1,000,000,000$`);
	} else return message.reply(`вы не отгадали код! Код был <<${rand}>>.
	🔥 Не отчаивайтесь, попытки неограничены!
	💰 Если отгадаете код, то вы получите 1,000,000,000$`);
});

updates.hear(/^(?:алмаз\sпродать)\s?(.*)?$/i, async (message) => {
	if(!message.$match[1]) return message.reply(`укажите кол-во алмазов для продажи! Пример: "Алмаз продать 10"`);
	message.$match[1] = utils.parseBet(message.$match[1], message.user.diamonds);
	if(!message.$match[1]) return;

	if(Math.floor(message.$match[1]) <= 0) return;

	timers = await Timer.findOne()
	let course = timers.course
	
	if(message.user.diamonds < message.$match[1]) return message.reply(`недостаточно алмазов. ${utils.getSadEmoji()}`);
	else if(message.user.diamonds >= message.$match[1]) {
		await message.user.dec("diamonds", message.$match[1]);
		await message.user.inc("balance", message.$match[1] * course);

		await message.reply(`вы продали ${utils.spaces(message.$match[1])}💎 за ${utils.spaces(message.$match[1] * course)}$`);
	}
});

updates.hear(/^(?:алмаз\sкупить)\s?(.*)?$/i, async (message) => {
	if(!message.$match[1]) return message.reply(`укажите кол-во алмазов для покупки! Пример: "Алмаз купить 10"`);
	message.$match[1] = utils.parseBet(message.$match[1], 0);
	if(!message.$match[1]) return;

	if(Math.floor(message.$match[1]) <= 0) return;

	timers = await Timer.findOne()
	let course = timers.course

	if(message.user.balance < message.$match[1] * course) return message.reply(`недостаточно денег. ${utils.getSadEmoji()}`);
	else if(message.user.balance >= message.$match[1] * course) {
		await message.user.dec("balance", message.$match[1] * course);
		await message.user.inc("diamonds", message.$match[1]);

		await message.reply(`вы купили ${utils.spaces(message.$match[1])}💎 за ${utils.spaces(message.$match[1] * course)}$`);
	}
});

updates.hear(/^(?:курс)$/i, async (message) => {
	timers = await Timer.findOne()
	let course = timers.course
	let updated = timers.tcourseupdated
	await message.reply(`курс алмазов: 1💎 = ${course}$
	До обновления курса: ${unixStampLeft(600000 - ( Date.now() - updated ))}`);
});

updates.hear(/^(?:курс топлива)$/i, async (message) => {
	timers = await Timer.findOne()
	let coursetoplivo = timers.coursetoplivo
	let updated = timers.tcoursetoplivoupdated
	await message.reply(`курс топлива: 1 л = ${coursetoplivo}$
	До обновления курса: ${unixStampLeft(600000 - ( Date.now() - updated ))}`);
});

updates.hear(/^(?:заправка)$/i, async (message) => {
	timers = await Timer.findOne()
	let globaltoplivo = timers.globaltoplivo
	let updated = timers.tglobaltoplivoupdated
	await message.reply(`запас топлива на заправке: ${globaltoplivo} л
	До обновления запаса топлива: ${unixStampLeft(600000 - ( Date.now() - updated ))}`);
});

updates.hear(/^(?:машины)\s?([0-9]+)?$/i, async (message) => {
	if(!message.$match[1]) {
		return message.reply(`список машин:
		
		${CARS.map((x) => `${x.id}. ${x.name} (${utils.spaces(x.speed)} км/ч) - ${utils.spaces(x.cost)}$`).join("\n")}
		
		Купить машину: машины [номер машины]`);
	}

	if(message.user.car) return message.reply(`у вас уже есть машина! Продать машину — <<Машина продать>>.`);
	let car = CARS.find((x) => x.id == message.$match[1]);

	if(!car) return;

	if(car.cost > message.user.balance) return message.reply(`недостаточно денег. ${utils.getSadEmoji()}`);
	else if(car.cost <= message.user.balance) {
		await message.user.dec("balance", car.cost);
		await message.user.set("car", car.id);

		return message.reply(`вы успешно купили ${car.name} за ${utils.spaces(car.cost)}$ 😇`, {
			attachment: car.att
		});
	}
});

updates.hear(/^(?:машина)$/i, async (message) => {
	let car = CARS.find((x) => x.id == message.user.car);
	if(!car) return message.reply(`у вас нет машины. Чтобы посмотреть список доступных машин для покупки, используйте команду "Машины".`);

	return message.reply(`информация о вашей машине:
	
	📋 Название: ${car.name}
	📈 Потенциальная скорость (рандомный диапазон): ${utils.spaces(car.minspeed)} - ${utils.spaces(car.speed)} км/ч
	💰 Стоимость: ${utils.spaces(car.cost)}$`, {
		attachment: car.att
	});
});

updates.hear(/^(?:машина)\s(?:продать)$/i, async (message) => {
	if(!message.user.car) return message.reply(`у вас нет машины. ${utils.getSadEmoji()}`);
	let car = CARS.find((x) => x.id == message.user.car);

	await message.user.set("car", 0);
	await message.user.inc("balance", car.cost * 0.90);

	return message.reply(`вы продали машину за ${utils.spaces(car.cost * 0.90)}$`);
});

updates.hear(/^(?:топливо\sпродать)\s?(.*)?$/i, async (message) => {
	if(!message.$match[1]) return message.reply(`укажите кол-во топлива для продажи! Пример: "Топливо продать 10"`);
	message.$match[1] = utils.parseBet(message.$match[1], message.user.toplivo);
	if(!message.$match[1]) return;

	if(Math.floor(message.$match[1]) <= 0) return;

	timers = await Timer.findOne()
	let coursetoplivo = timers.coursetoplivo

	if(message.user.toplivo < message.$match[1]) return message.reply(`недостаточно топлива. ${utils.getSadEmoji()}`);
	else if(message.user.toplivo >= message.$match[1]) {
		
		await timers.inc("globaltoplivo", message.$match[1]);
		await message.user.dec("toplivo", message.$match[1]);
		await message.user.inc("balance", message.$match[1] * coursetoplivo);

		await message.reply(`вы продали ${utils.spaces(message.$match[1])} л за ${utils.spaces(message.$match[1] * coursetoplivo)}$`);
	}
});

updates.hear(/^(?:топливо\sкупить)\s?(.*)?$/i, async (message) => {
	if(!message.$match[1]) return message.reply(`укажите кол-во топлива для покупки! Пример: "Топливо купить 10"`);
	message.$match[1] = utils.parseBet(message.$match[1], 0);
	if(!message.$match[1]) return;

	if(Math.floor(message.$match[1]) <= 0) return;

	timers = await Timer.findOne()
	let globaltoplivo = timers.globaltoplivo
	let coursetoplivo = timers.coursetoplivo
	let updated = timers.tcoursetoplivoupdated
	
	if(message.$match[1] > globaltoplivo) return message.reply(`на заправке нет столько топлива!\nЗапас топлива на заправке: ${globaltoplivo} л. Ждите ${unixStampLeft(600000 - ( Date.now() - updated ))} до обновления запаса топлива.`);

	if(message.user.toplivo >= 1000) return message.reply(`вы не можете позволить себе топлива в количестве более чем 1000 л.`);
	
	if(message.user.balance < message.$match[1] * coursetoplivo) return message.reply(`недостаточно денег. ${utils.getSadEmoji()}`);
	else if(message.user.balance >= message.$match[1] * coursetoplivo) {
		
		await timers.dec("globaltoplivo", message.$match[1]);
		await message.user.dec("balance", message.$match[1] * coursetoplivo);
		await message.user.inc("toplivo", message.$match[1]);

		await message.reply(`вы купили ${utils.spaces(message.$match[1])} л за ${utils.spaces(message.$match[1] * coursetoplivo)}$`);
	}
});

updates.hear(/^(?:таксовать)$/i, async (message) => {
	if(message.user.ttaxi > getUnix()) return message.reply(`вы сможете таксовать через ${unixStampLeft(message.user.ttaxi - getUnix())}`);

	if(!message.user.car) return message.reply(`у вас нет машины. Чтобы посмотреть список доступных машин для покупки, используйте команду "Машины".`);
	if(message.user.lvl < 1) return message.reply(`у вас нулевой уровень. Поработайте, чтобы повысить его.`);
	if(message.user.toplivo == 0) return message.reply(`в вашей машине нет бензина. Купите топливо прежде чем таксовать. Чтобы купить топливо, используйте команду "Топливо купить [кол-во]".`);

	if (message.user.car <= 2) {
		if(message.user.balance < 5000) return message.reply(`вы должны иметь на балансе как минимум 5 000$ из-за возможности штрафа.`);
		if(message.user.toplivo < 5) return message.reply(`в вашей машине недостаточно топлива для поездок. Необходимо как минимум 5 л бензина, прежде чем таксовать. Чтобы купить топливо, используйте команду "Топливо купить [кол-во]".`);
	} else if (message.user.car == 3 || message.user.car == 4) {
		if(message.user.balance < 10000) return message.reply(`вы должны иметь на балансе как минимум 10 000$ из-за возможности штрафа.`);
		if(message.user.toplivo < 10) return message.reply(`в вашей машине недостаточно топлива для поездок. Необходимо как минимум 10 л бензина, прежде чем таксовать. Чтобы купить топливо, используйте команду "Топливо купить [кол-во]".`);
	} else if (message.user.car == 5) {
		if(message.user.balance < 30000) return message.reply(`вы должны иметь на балансе как минимум 30 000$ из-за возможности штрафа. Более дорогие машины увеличивают сумму возможного штрафа.`);
		if(message.user.toplivo < 15) return message.reply(`в вашей машине недостаточно топлива для поездок. Необходимо как минимум 15 л бензина, прежде чем таксовать. Чтобы купить топливо, используйте команду "Топливо купить [кол-во]".`);
	} else if (message.user.car == 6) {
		if(message.user.balance < 50000) return message.reply(`вы должны иметь на балансе как минимум 50 000$ из-за возможности штрафа. Дорогие машины, как ваша, намного увеличивают сумму возможного штрафа.`);
		if(message.user.toplivo < 30) return message.reply(`в вашей машине недостаточно топлива для поездок. Необходимо как минимум 30 л бензина, прежде чем таксовать. Чтобы купить топливо, используйте команду "Топливо купить [кол-во]".`);
	} else {
		if(message.user.balance < 80000) return message.reply(`вы должны иметь на балансе как минимум 80 000$ из-за возможности штрафа. Такие дорогие и крутые машины, как ваша, требует больших денежных средств на её содержание и оплату самых больших штрафов.`);
		if(message.user.toplivo < 50) return message.reply(`в вашей машине недостаточно топлива для поездок. Необходимо как минимум 50 л бензина, прежде чем таксовать. Чтобы купить топливо, используйте команду "Топливо купить [кол-во]".`);
	}

	if (message.user.car <= 2) {
		caught = utils.pick([ false, false, false, false, false, false, false, false, true, false, false, true, false, false, false, false ]);
	} else if (message.user.car == 3 || message.user.car == 4) {
		caught = utils.pick([ false, false, false, false, false, false, false, true, false, false, true, false, false, false, false, true ]);
	} else if (message.user.car == 5) {
		caught = utils.pick([ false, false, false, false, false, false, true, true, false, true, false, true, false, false, false, false ]);
	} else if (message.user.car == 6) {
		caught = utils.pick([ false, false, false, false, false, false, true, true, false, false, true, false, false, true, false, false ]);
	} else {
		caught = utils.pick([ false, false, false, false, false, false, true, true, true, false, false, true, false, true, false, false ]);
	}

	if(caught) {
		if (message.user.car <= 2) {
			shtraftoplivo = utils.random(1, 5);
			shtraf = utils.random(1000, 5000);
		} else if (message.user.car == 3 || message.user.car == 4) {
			shtraftoplivo = utils.random(1, 10);
			shtraf = utils.random(5000, 10000);
		} else if (message.user.car == 5) {
			shtraftoplivo = utils.random(1, 15);
			shtraf = utils.random(10000, 30000);
		} else if (message.user.car == 6) {
			shtraftoplivo = utils.random(1, 30);
			shtraf = utils.random(15000, 50000);
		} else {
			shtraftoplivo = utils.random(1, 50);
			shtraf = utils.random(20000, 80000);
		}

		await message.user.dec("toplivo", shtraftoplivo)
		await message.user.dec("balance", shtraf);
		await message.user.dec("lvl", 1);
		await message.user.set("ttaxi", getUnix() + 600000);

		return message.reply(`вы были пойманы на нарушении правил ПДД.\n🚔 Штраф: ${utils.spaces(shtraf)}$ ${utils.getSadEmoji()}\n📈 Потеря уровня -1 Lvl\n📈 Расход топлива - ${utils.spaces(shtraftoplivo)} л`);
    }
    
    if (message.user.car <= 2) {
        km = utils.random(5, 50);
    } else if (message.user.car == 3 || message.user.car == 4) {
        km = utils.random(8, 100);
    } else if (message.user.car == 5) {
        km = utils.random(30, 150);
    } else if (message.user.car == 6) {
        km = utils.random(100, 300);
    } else {
        km = utils.random(100, 500);
	}
	
	let proezd = (km * 40) + message.user.lvl;
	let proezdtoplivo = km * 0.1

	await message.user.dec("toplivo", proezdtoplivo)
	await message.user.inc("balance", proezd)
	await message.user.inc("lvl", 1);

	return message.reply(`вы успешно довезли пассажира. ✅
	
	🔝 Расстояние: ${km} км.
	💰 Вы получили ${utils.spaces(proezd)}$ (Баланс: ${utils.spaces(message.user.balance)}$)
	📈 +1 Lvl (Текущий уровень: ${utils.spaces(message.user.lvl)})
	📈 Расход топлива: -${utils.spaces(proezdtoplivo)} л (Остаток: ${utils.spaces(message.user.toplivo)} л)
	
	Более дорогие машины дадут вам возможность таксовать на большие расстояния и получать больше дохода с поездок.
	Но за них вас будут штрафовать на более большие суммы и с большей вероятностью.`);
});

updates.hear(/^(?:магазин)$/i, async (message) => {
	return message.reply(`магазин:
	🏘 Недвижимость:
	⠀⠀🏠 Дома
	⠀⠀🌇 Квартиры
	
	📌 Остальное:
	⠀⠀📱 Телефоны
	⠀⠀🖥 Компьютеры
	⠀⠀👑 Рейтинг [кол-во] - $250 млн
	
	🔎 Для покупки используйте "[категория] [номер]".
	⠀ ⠀ Например: "${utils.pick(["Дом", "Квартира", "Телефон", "Компьютер", "Рейтинг"])} 1"`);
});

updates.hear(/^(?:дома|дом)\s?([0-9]+)?$/i, async (message) => {
	if(!message.$match[1]) {
		let text = ``;
		houses.map((x) => {
			text += `🏠 ${x.uid}. ${x.name} (${utils.spaces(x.price)}$)\n`;
		});

		return message.reply("дома:\n" + text + "\n🚩Для покупки введите \"Дом [номер]\"");
	}

	let toBuy = houses.find((x) => x.uid == message.$match[1]);
	if(!toBuy) return;

	if(message.user.house) return message.reply(`у вас уже есть дом! (${houses.find((x) => x.uid == message.user.house).name})`);

	if(message.user.balance <= toBuy.price) return message.reply(`недостаточно денег. ${utils.getSadEmoji()}`);
	else if(message.user.balance >= toBuy.price) {
		await message.user.dec("balance", toBuy.price);
		await message.user.set("house", toBuy.uid);

		return message.reply(`вы успешно купили ${toBuy.name}.`);
	}
});

updates.hear(/^(?:квартиры|квартира)\s?([0-9]+)?$/i, async (message) => {
	if(!message.$match[1]) {
		let text = ``;
		apartments.map((x) => {
			text += `🌇 ${x.uid}. ${x.name} (${utils.spaces(x.price)}$)\n`;
		});

		return message.reply("квартиры:\n" + text + "\n🚩Для покупки введите \"Квартира [номер]\"");
	}

	let toBuy = apartments.find((x) => x.uid == message.$match[1]);
	if(!toBuy) return;

	if(message.user.apartment) return message.reply(`у вас уже есть квартира! (${apartments.find((x) => x.uid == message.user.apartment).name})`);

	if(message.user.balance <= toBuy.price) return message.reply(`недостаточно денег. ${utils.getSadEmoji()}`);
	else if(message.user.balance >= toBuy.price) {
		await message.user.dec("balance", toBuy.price);
		await message.user.set("apartment", toBuy.uid);

		return message.reply(`вы успешно купили ${toBuy.name}.`);
	}
});

updates.hear(/^(?:компьютеры|компьютер)\s?([0-9]+)?$/i, async (message) => {
	if(!message.$match[1]) {
		let text = ``;
		computers.map((x) => {
			text += `🖥 ${x.uid}. ${x.name} (${utils.spaces(x.price)}$)\n`;
		});

		return message.reply("компьютеры:\n" + text + "\n🚩Для покупки введите \"Компьютер [номер]\"");
	}

	let toBuy = computers.find((x) => x.uid == message.$match[1]);
	if(!toBuy) return;

	if(message.user.computers) return message.reply(`у вас уже есть компьютер! (${computers.find((x) => x.uid == message.user.computer).name})`);

	if(message.user.balance <= toBuy.price) return message.reply(`недостаточно денег. ${utils.getSadEmoji()}`);
	else if(message.user.balance >= toBuy.price) {
		await message.user.dec("balance", toBuy.price);
		await message.user.set("computer", toBuy.uid);

		return message.reply(`вы успешно купили ${toBuy.name}.`);
	}
});

updates.hear(/^(?:телефоны|телефон)\s?([0-9]+)?$/i, async (message) => {
	if(!message.$match[1]) {
		let text = ``;
		phones.map((x) => {
			text += `📱 ${x.uid}. ${x.name} (${utils.spaces(x.price)}$)\n`;
		});

		return message.reply("телефоны:\n" + text + "\n🚩Для покупки введите \"Телефон [номер]\"");
	}

	let toBuy = phones.find((x) => x.uid == message.$match[1]);
	if(!toBuy) return;

	if(message.user.phone) return message.reply(`у вас уже есть телефон! (${phones.find((x) => x.uid == message.user.phone).name})`);

	if(message.user.balance <= toBuy.price) return message.reply(`недостаточно денег. ${utils.getSadEmoji()}`);
	else if(message.user.balance >= toBuy.price) {
		await message.user.dec("balance", toBuy.price);
		await message.user.set("phone", toBuy.uid);

		return message.reply(`вы успешно купили ${toBuy.name}.`);
	}
});

updates.hear(/^(?:продать)\s?(.*)?$/i, async (message) => {
	if(!message.$match[1]) return message.reply(`укажите, что продать.`);
	message.$match[1] = message.$match[1].toLowerCase();
	if(message.$match[1] === "рейтинг") return message.reply(`используйте: "Рейтинг продать [кол-во]".`);

	let matches = [
		{ type: "houses",     link: houses,     oneType: "house"     },
		{ type: "apartments", link: apartments, oneType: "apartment" },
		{ type: "phones",     link: phones,     oneType: "phone"     },
		{ type: "computers",  link: computers,  oneType: "computer"  }
	];
	let toSell = {};

	if(/(дом)/.test(message.$match[1])) {
		toSell = matches[0];
	}

	if(/(квартир)/.test(message.$match[1])) {
		toSell = matches[1];
	}

	if(/(телефон)/.test(message.$match[1])) {
		toSell = matches[2];
	}

	if(/(комп)/.test(message.$match[1])) {
		toSell = matches[3];
	}

	if(!toSell.link) return;
	toSell.link = toSell.link.find((x) => x.uid == message.user[toSell.oneType]);

	if(!message.user[toSell.oneType]) return message.reply(`у вас нет этой вещи.`);

	await message.user.inc("balance", toSell.link.price * 0.90);
	await message.user.set(toSell.oneType, 0);

	return message.reply(`вы успешно продали ${toSell.link.name}.`);
});

updates.hear(/^(?:лобби отмена)$/i, async (message) => {
	let lobbie = await Lobbi.findOne({ id: message.chatId });

	if (!lobbie) return message.reply(`в этой беседе лобби, созданное кем-либо из игроков, не обнаружено.\nНачните новое командой "Гонка [ставка]"`)

	let player1id = lobbie.players[0]
	let player1 = await User.findOne({ id: player1id });

	if(lobbie.players.indexOf(message.senderId) !== -1) {
		await message.user.inc("balance", lobbie.bank1);
		await lobbie.remove();
		return message.reply(`лобби, созданное вами в данной беседе, отменено. Ваша ставка возвращена на ваш баланс.`)
	} else {
		return message.reply(`вы не можете отменить лобби, созданное игроком @id${player1.id} (${player1.tag}), вы можете принять его вызов командой "Гонка ${utils.spaces(lobbie.bank1)}" со ставкой ${utils.spaces(lobbie.bank1)}$ или поставить свою, не превышающую ${utils.spaces(lobbie.bank1 * 2)}$.`, {disable_mentions: 1})
	}
});

updates.hear(/^(?:гонка)\s?(.*)?$/i, async (message) => {
    if (!message.isChat) return message.reply("гонки можно устраивать только в беседах!");
	if(!message.$match[1]) return message.reply(`укажите вашу ставку! Пример: "Гонка 100"`);
	if(message.user.lvl < 1) return message.reply(`у вас нулевой уровень. Поработайте, чтобы повысить его.`);
	if (!message.user.car) return message.reply(`у вас нет машины для гонок. Чтобы посмотреть доступные для покупки машины, используйте команду "Машины".`)
	if(message.user.toplivo == 0) return message.reply(`в вашей машине нет бензина. Купите топливо, прежде чем начать гонку. Чтобы купить топливо, используйте команду "Топливо купить [кол-во]".`);
	if(message.user.toplivo < 5) return message.reply(`в вашей машине недостаточно топлива. Необходимо как минимум 5 л бензина, прежде чем начать гонку. Чтобы купить топливо, используйте команду "Топливо купить [кол-во]".`);
    // Кидаем нашу ставку в переменную, для удобства.
	let amount = utils.parseBet(message.$match[1], message.user.balance);
	if (amount < 100) return message.reply(`минимальная ставка 100$.`)
    // Если ставка превышает баланс - игнор.
	if (amount > message.user.balance) return message.reply(`у вас нет столько денег.`)
	// Если лобби до этого не было создано, создаем.
	let lobbie = await Lobbi.findOne({ id: message.chatId });

	if (!lobbie) {
		await message.user.dec("balance", amount);

		let count = await Lobbi.countDocuments();
		
		let $lobbie = new Lobbi({
			cid: count + 1,
			id: message.chatId,
			players: [message.senderId],
			bank1: amount,
			bank2: 0
		});

		await $lobbie.save();
		console.log(`[${unixStamp(getUnix())}] chat${message.chatId} @id${message.senderId} New Lobbi - @id${message.chatId} #${count}`);

		return message.reply(`лобби со ставкой ${utils.spaces(amount)}$ успешно создано! Ждите оппонента...🚘\nДля отмены гонки, воспользуйтесь командой "лобби отмена". Ваша ставка вернется на ваш баланс.`)
	};

	// Проверка на наличие юзера в players
	if(lobbie.players.indexOf(message.senderId) === -1) {
		let amount1 = lobbie.bank1
		let player1id = lobbie.players[0]
		let player1 = await User.findOne({ id: player1id });
		if (amount < amount1) {
			return message.reply(`вы должны поставить ставку не меньше, чем поставил игрок @id${player1.id} (${player1.tag}). Его ставка составляет ${utils.spaces(lobbie.bank1)}$`, {disable_mentions: 1})
		}
		if (amount > (amount1 * 2)) {
			return message.reply(`ваша ставка превышает ставку игрока @id${player1.id} (${player1.tag}) более чем в 2 раза, поставьте ставку не превышающую ${utils.spaces(lobbie.bank1 * 2)}$ командой "Гонка [ставка]". Его ставка составляет ${utils.spaces(lobbie.bank1)}$\nПринять вызов игрока с его ставкой: "Гонка ${utils.spaces(lobbie.bank1)}"`, {disable_mentions: 1})
		}
        // Отнимаем баланс
		await message.user.dec("balance", amount);
        // Добавляем юзера в players для последующего рандома
		lobbie.players.push(message.senderId);
		await lobbie.set("bank2", amount);
        // Переменная для вывода в сообщении
        let bank = lobbie.bank1 + lobbie.bank2;
		// Получаем победителя
		let racer1id = lobbie.players[0]
		let racer2id = lobbie.players[1]
		let racer1 = await User.findOne({ id: racer1id });
		let racer2 = await User.findOne({ id: racer2id });

		let racer1s = ((racer1.car + racer1.lvl)/100);
		let racer2s = ((racer2.car + racer2.lvl)/100);

		let $1rndspeedcar1 = utils.random(40, 120)
		let $1rndspeedcar2 = utils.random(60, 230)
		let $1rndspeedcar3 = utils.random(80, 250)
		let $1rndspeedcar4 = utils.random(100, 320)
		let $1rndspeedcar5 = utils.random(140, 380)
		let $1rndspeedcar6 = utils.random(240, 450)
		let $1rndspeedcar7 = utils.random(300, 500)

		let $2rndspeedcar1 = utils.random(40, 120)
		let $2rndspeedcar2 = utils.random(60, 230)
		let $2rndspeedcar3 = utils.random(80, 250)
		let $2rndspeedcar4 = utils.random(100, 320)
		let $2rndspeedcar5 = utils.random(140, 380)
		let $2rndspeedcar6 = utils.random(240, 450)
		let $2rndspeedcar7 = utils.random(300, 500)

		let $rnduspeedcar1 = $1rndspeedcar1 + racer1s;
		let $rnduspeedcar2 = $1rndspeedcar2 + racer1s;
		let $rnduspeedcar3 = $1rndspeedcar3 + racer1s;
		let $rnduspeedcar4 = $1rndspeedcar4 + racer1s;
		let $rnduspeedcar5 = $1rndspeedcar5 + racer1s;
		let $rnduspeedcar6 = $1rndspeedcar6 + racer1s;
		let $rnduspeedcar7 = $1rndspeedcar7 + racer1s;

		let $rndpspeedcar1 = $2rndspeedcar1 + racer2s;
		let $rndpspeedcar2 = $2rndspeedcar2 + racer2s;
		let $rndpspeedcar3 = $2rndspeedcar3 + racer2s;
		let $rndpspeedcar4 = $2rndspeedcar4 + racer2s;
		let $rndpspeedcar5 = $2rndspeedcar5 + racer2s;
		let $rndpspeedcar6 = $2rndspeedcar6 + racer2s;
		let $rndpspeedcar7 = $2rndspeedcar7 + racer2s;

		if (racer1.car == 1) {
			rndspeed1 = $rnduspeedcar1
		} else if (racer1.car == 2) {
			rndspeed1 = $rnduspeedcar2
		} else if (racer1.car == 3) {
			rndspeed1 = $rnduspeedcar3
		} else if (racer1.car == 4) {
			rndspeed1 = $rnduspeedcar4
		} else if (racer1.car == 5) {
			rndspeed1 = $rnduspeedcar5
		} else if (racer1.car == 6) {
			rndspeed1 = $rnduspeedcar6
		} else {
			rndspeed1 = $rnduspeedcar7
		}

		if (racer2.car == 1) {
			rndspeed2 = $rndpspeedcar1
		} else if (racer2.car == 2) {
			rndspeed2 = $rndpspeedcar2
		} else if (racer2.car == 3) {
			rndspeed2 = $rndpspeedcar3
		} else if (racer2.car == 4) {
			rndspeed2 = $rndpspeedcar4
		} else if (racer2.car == 5) {
			rndspeed2 = $rndpspeedcar5
		} else if (racer2.car == 6) {
			rndspeed2 = $rndpspeedcar6
		} else {
			rndspeed2 = $rndpspeedcar7
		}

		let rndracing1 = utils.random(1, 10)
		let rndracing2 = utils.random(1, 10)

		if (rndracing1 > rndracing2) {
			txtrandom = `Ближе к финишу @id${racer1.id} (${racer1.tag}) везло больше (прибавка к скорости + ${rndracing1} км/ч), и его средняя скорость, которую он мог развивать на своей машине ${CARS.find((x) => x.id == racer1.car).name}, составила ${rndspeed1} км/ч. Средняя скорость @id${racer2.id} (${racer2.tag}) (прибавка к скорости + ${rndracing2}  км/ч), управляющего машиной ${CARS.find((x) => x.id == racer2.car).name}, составила ${rndspeed2} км/ч.\nСредняя скорость игроков рассчитывается по формуле: потенциальная скорость машины игрока + ((номер машины игрока + уровень игрока)/100)`
		} else if (rndracing1 < rndracing2) {
			txtrandom = `Ближе к финишу @id${racer2.id} (${racer2.tag}) везло больше (прибавка к скорости + ${rndracing2} км/ч), и его средняя скорость, которую он мог развивать на своей машине ${CARS.find((x) => x.id == racer2.car).name}, составила ${rndspeed2} км/ч. Средняя скорость @id${racer1.id} (${racer1.tag}) (прибавка к скорости + ${rndracing1}  км/ч), управляющего машиной ${CARS.find((x) => x.id == racer1.car).name}, составила ${rndspeed1} км/ч.\nСредняя скорость игроков рассчитывается по формуле: потенциальная скорость машины игрока + ((номер машины игрока + уровень игрока)/100)`
		} else {
			txtrandom = `Ближе к финишу у обоих гонщиков были равные шансы на победу (прибавка к скорости обоим + ${rndracing1} км/ч). Средняя скорость @id${racer1.id} (${racer1.tag}), управляющего машиной ${CARS.find((x) => x.id == racer1.car).name}, составила ${rndspeed1} км/ч. Средняя скорость @id${racer2.id} (${racer2.tag}), управляющего машиной ${CARS.find((x) => x.id == racer2.car).name}, составила ${rndspeed2} км/ч.\nСредняя скорость игроков рассчитывается по формуле: потенциальная скорость машины игрока + ((номер машины игрока + уровень игрока)/100)`
		}

		let speed1 = rndspeed1 + rndracing1;
		let speed2 = rndspeed2 + rndracing2;

		let racertoplivo = utils.random(1, 5);

		if (speed1 > speed2) {
			let winner = racer1id
			let userswinner = await User.findOne({ id: winner });
			// Добавляем к балансу победителя баланс + его ставку
			await userswinner.inc("balance", bank);
			await userswinner.inc("lvl", 1);
			await racer1.dec("toplivo", racertoplivo)
			await racer2.dec("toplivo", racertoplivo)
			// Удаляем лобби
			await lobbie.remove();
			// Отправляем результат
			return message.send(`  🚥 Гонка!\n${txtrandom}\n 🏁 Скорости на финише:\n 🚘 Скорость @id${racer1.id} (${racer1.tag}): ${utils.spaces(speed1)} км/ч\n 🚘 Скорость @id${racer2.id} (${racer2.tag}): ${utils.spaces(speed2)} км/ч\n 🏁 Победитель: @id${userswinner.id} (${userswinner.tag}) 🥇 \n 💰 Выигрыш составил: ${utils.spaces(bank)}$ (+1 Lvl) 📈\n 🚥 Расход топлива для обоих гонщиков: ${utils.spaces(racertoplivo)} л`);
		} else if (speed1 < speed2) {
			let winner = racer2id
			let userswinner = await User.findOne({ id: winner });
			// Добавляем к балансу победителя баланс + его ставку
			await userswinner.inc("balance", bank);
			await userswinner.inc("lvl", 1);
			await racer1.dec("toplivo", racertoplivo)
			await racer2.dec("toplivo", racertoplivo)
			// Удаляем лобби
			await lobbie.remove();
			// Отправляем результат
			return message.send(`  🚥 Гонка!\n${txtrandom}\n 🏁 Скорости на финише:\n 🚘 Скорость @id${racer1.id} (${racer1.tag}): ${utils.spaces(speed1)} км/ч\n 🚘 Скорость @id${racer2.id} (${racer2.tag}): ${utils.spaces(speed2)} км/ч\n 🏁 Победитель: @id${userswinner.id} (${userswinner.tag}) 🥇 \n 💰 Выигрыш составил: ${utils.spaces(bank)}$ (+1 Lvl) 📈\n 🚥 Расход топлива для обоих гонщиков: ${utils.spaces(racertoplivo)} л`);
		} else {
			let winner1 = racer1id
			let winner2 = racer2id
			let userswinner1 = await User.findOne({ id: winner1 });
			let userswinner2 = await User.findOne({ id: winner2 });
			// Ничья
			await userswinner1.inc("balance", lobbie.bank1);
			await userswinner1.inc("lvl", 1);
			await userswinner2.inc("balance", lobbie.bank2);
			await userswinner2.inc("lvl", 1);
			await racer1.dec("toplivo", racertoplivo)
			await racer2.dec("toplivo", racertoplivo)
			// Удаляем лобби
			await lobbie.remove();
			// Отправляем результат
			return message.send(`  🚥 Ничья!\n${txtrandom}\n 🏁 Скорости на финише:\n 🚘 Скорость @id${racer1.id} (${racer1.tag}): ${utils.spaces(speed1)} км/ч\n 🚘 Скорость @id${racer2.id} (${racer2.tag}): ${utils.spaces(speed2)} км/ч\n 🏁 Оба игрока повысили свой уровень на +1 Lvl 📈\n 🚥 Расход топлива для обоих гонщиков: ${utils.spaces(racertoplivo)} л`);
		}
	} else {
		return message.reply(`вы уже создали лобби. Ждите оппонента.\nДля отмены гонки, воспользуйтесь командой "лобби отмена". Ваша ставка вернется на ваш баланс.`)
	}
});

updates.hear(/^(?:лобби очистить)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return;

	let Alllobbie = [];
	let lobbies = await Lobbi.find();

	for (let i = 0; i < lobbies.length; i += 1) {
		Alllobbie.push({ id: lobbies[i].id });
	}

	if (Alllobbie.length > 0) {
		for (let i = 0; i < Alllobbie.length; i += 1) {
			lobbieid = Alllobbie[i].id

			let lobbie = await Lobbi.findOne({ id: lobbieid })

			racer1id = lobbie.players[0]
		
			let racer1 = await User.findOne({ id: racer1id });

			await racer1.inc("balance", lobbie.bank1);
			await lobbie.remove();
		}
		return message.reply(`лобби очищены. Ставки возвращены игрокам.`);
	} else {
		return message.reply(`лобби не обнаружены.`);
	}
});

updates.hear(/^(?:лобби)$/i, async (message) => {
	let lobbie = await Lobbi.findOne({ id: message.chatId });

	if (!lobbie) return message.reply(`в этой беседе лобби, созданное кем-либо из игроков, не обнаружено.`)

	racer1id = lobbie.players[0]
	racer2id = lobbie.players[1]

	let racer1 = await User.findOne({ id: racer1id });
	let racer2 = await User.findOne({ id: racer2id });

	if (racer2 == undefined) {
		racer2pl = ``
	} else {
		racer2pl = `@id${racer2.id} (${racer2.tag})`
	}

	return message.reply(`информация о лобби в беседе:\n 🔎 Участник: @id${racer1.id} (${racer1.tag}) (Lvl: ${racer1.lvl})\n 🚘 Машина: ${CARS.find((x) => x.id === racer1.car).name}\n 💰 Ставка гонки: ${lobbie.bank1}$\n 🚥 Чтобы принять лобби, используйте команду "Гонка ${lobbie.bank1}"`, {disable_mentions: 1})
});

updates.hear(/^(?:взломать)$/i, async (message) => {
	if(message.user.work !== 9) return message.reply(`у вас нет доступа к банковским данным корпораций! Достигнете 500-ого уровня, чтобы получить доступ к работе программиста в компании по кибербезопасности и устройтесь туда. С этими возможностями вы сможете взламывать случайные банковские счета игроков.`);

	if(!message.user.computer) return message.reply(`у вас нет компьютера для взлома в домашних условиях! На работе это делать очень рискованно!\nЧтобы посмотреть список доступных компьютеров для покупки, используйте команду "Компьютеры".`);

	if(message.user.tcrack > getUnix()) return message.reply(`вы можете взламывать только раз в 10 минут во избежание подозрений, ждите ${unixStampLeft(message.user.tcrack - Date.now())}`);

	let Allusers = [];
	let users = await User.find();

	for (let i = 0; i < users.length; i += 1) {
		Allusers.push({ id: users[i].id, bank: users[i].bank });
	}

	let trueusers = [];
	
	for (let i = 0; i < Allusers.length; i += 1) {
		if (Allusers[i].bank > 999 && Allusers[i].id !== message.senderId) {
			trueusers.push({ id: Allusers[i].id });
		}
	}

	if (trueusers.length > 0) {
		truevslomuser = utils.pick(trueusers)
		let $trueuser = await User.findOne({ id: truevslomuser.id });

		vslombalance = utils.random(1000, Math.floor(($trueuser.bank * 10)/100))

		await message.user.set("tcrack", getUnix() + 600000);
		await $trueuser.dec("bank", vslombalance);
		await message.user.inc("balance", vslombalance);

		try {
			await message.send({
				peer_id: $trueuser.id,
				message: `игрок @id${message.user.id} (${message.user.tag}) взломал ваш банковский счёт и выкрал у вас сумму в ${utils.spaces(vslombalance)}$.`
			});
		} catch (error) {
			console.log(error)
		}

		return message.reply(`вы успешно взломали банковский счёт игрока @id${$trueuser.id} (${$trueuser.tag}) и выкрали у него сумму в ${utils.spaces(vslombalance)}$.`, {disable_mentions: 1});
	} else {
		return message.reply(`нет подходящих игроков для взлома.`);
	}
});

updates.hear(/^(?:chatid|chat id|чат айди|номер чата|айди беседы|номер беседы)$/i, async (message) => {
	return message.reply(`ID данной беседы: ${message.isChat ? message.chatId : "Беседа с сообществом"}`);
});

// ИГРОВЫЕ КОМАНДЫ (НАСТРОЙКА)*******************************************************************

updates.hear(/^(?:ник)\s(вкл|выкл)$/i, async (message) => {
	if(message.$match[1].toLowerCase() === 'вкл')
	{
		message.user.set("mention", true);

		return message.reply(`гиперссылка включена!`);
	}

	if(message.$match[1].toLowerCase() === 'выкл')
	{
		message.user.set("mention", false);

		return message.reply(`гиперссылка выключена!`);
	}
});

updates.hear(/^(?:ник топ)\s(вкл|выкл)$/i, async (message) => {
	if(message.$match[1].toLowerCase() === 'вкл')
	{
		message.user.set("mentiontop", true);

		return message.reply(`гиперссылка в топе включена!`);
	}

	if(message.$match[1].toLowerCase() === 'выкл')
	{
		message.user.set("mentiontop", false);

		return message.reply(`гиперссылка в топе выключена!`);
	}
});

updates.hear(/^(?:ник)\s?(.*)?$/i, async (message) => {
	if(!message.$match[1]) return message.reply(`укажите желаемый ник! Пример: "Ник Qwerty"`);
	if(message.$match[1].length > 16) return message.reply(`максимальная длина ника 16 символов`);
	if(/(админ)/i.test(message.$match[1])) message.$match[1] = "Жопаа";

	message.user.set("tag", message.$match[1]);
	return message.reply(`вы теперь "${message.$match[1]}"`);
});

updates.hear(/^(?:кнопки)\s(вкл|выкл)$/i, async (message) => {
	if(!message.isChat) {
        if(message.$match[1].toLowerCase() === 'вкл')
        {
			await message.reply(`вы включили кнопки!
			Чтобы скрыть их, используйте: Кнопки выкл`, {
				keyboard: generateKeyboard(message.user.buttons)
			});
        }
    
        if(message.$match[1].toLowerCase() === 'выкл')
        {
			return message.reply(`вы скрыли кнопки!
			Чтобы показать их вновь, используйте: Кнопки вкл`, {
				keyboard: Keyboard.keyboard([])
			});
        }
	} else {
        if(message.$match[1].toLowerCase() === 'вкл')
        {
			await message.reply(`вы включили кнопки в данной беседе!
			Чтобы скрыть их, используйте: Кнопки выкл`, {
				keyboard: generateKeyboard(message.chat.buttons)
			});
        }
    
        if(message.$match[1].toLowerCase() === 'выкл')
        {
			return message.reply(`вы скрыли кнопки в данной беседе!
			Чтобы показать их вновь, используйте: Кнопки вкл`, {
				keyboard: Keyboard.keyboard([])
			});
        }
	}
});

updates.hear(/^(?:кнопка)\s?(.*)?$/i, async (message) => {
	if(!message.$match[1]) return message.reply(`укажите текст, используйте: Кнопка [Текст]`);

	if(message.chatId === 12 && message.senderId !== 170139743) return message.reply(`в этой беседе изменять кнопки может только администратор.`);
	if(message.chatId === 9 && message.senderId !== 170139743) return message.reply(`в этой беседе изменять кнопки может только администратор.`);

	if(!message.isChat) {
		if(message.$match[1].toLowerCase() === "удалить") {
			message.user.set("buttons", []);
			return message.reply(`вы очистили все кнопки!
			Для добавления новых используйте: Кнопка [Текст]`, {
				keyboard: Keyboard.keyboard([])
			});
		} else {
			if(message.user.buttons.length >= 40) return message.reply(`ваше поле заполнено! (40/40)
			Для очистки поля используйте: Кнопка удалить`);
	
			if(utils.filter(message.$match[1])) return;
	
			message.user.buttons.push(message.$match[1]);
			await message.user.save();

			await message.reply(`кнопка успешно добавлена!`, {
				keyboard: generateKeyboard(message.user.buttons)
			});
		}
	} else {
		if(message.$match[1].toLowerCase() === "удалить") {
			message.chat.set("buttons", []);
			await message.chat.save();
			return message.reply(`вы очистили все кнопки для данной беседы!
			Для добавления новых используйте: Кнопка [Текст]`, {
				keyboard: Keyboard.keyboard([])
			});
		} else {
			if(message.senderId !== 170139743) return message.reply(`в беседе добавлять кнопки может только администратор бота.`);
			
			if(message.chat.buttons.length >= 40) return message.reply(`поля кнопок для данной беседы заполнены! (40/40)
			Для очистки поля используйте: Кнопка удалить`);
	
			if(utils.filter(message.$match[1])) return;
	
			message.chat.buttons.push(message.$match[1]);
			await message.chat.save();

			await message.reply(`кнопка для данной беседы успешно добавлена!`, {
				keyboard: generateKeyboard(message.chat.buttons)
			});
		}
	}
});
updates.hear(/^(?:gamemode|game mode|gm|гм|игровой режим|префикс|обращение)\s(вкл|выкл)$/i, async (message) => {
	if(!message.isChat) {
		await message.reply("данную команду можно использовать только в беседе. В личных сообщениях с ботом игровой режим всегда включен по умолчанию.");
		return;
	}

	if(message.chatId === 12 && message.senderId !== 170139743) return message.reply(`в этой беседе изменять режим работы бота может только администратор.`);
	if(message.chatId === 9 && message.senderId !== 170139743) return message.reply(`в этой беседе изменять режим работы бота может только администратор.`);

	if(message.$match[1].toLowerCase() === 'вкл')
	{
		message.chat.set("gamemode", true);
		await message.chat.save();

		return message.reply(`игровой режим (использование игровых команд без обращения к боту) в данной беседе включен! Обратите внимание, что возможность общения с ботом недоступна в беседах, в которых включен игровой режим.`);
	}

	if(message.$match[1].toLowerCase() === 'выкл')
	{
		message.chat.set("gamemode", false);
		await message.chat.save();

		return message.reply(`игровой режим (использование игровых команд без обращения к боту) в данной беседе выключен! Общение с ботом снова доступно по обращении к боту.`);
	}
});

updates.hear(/^(?:уведомления)\s(вкл|выкл)$/i, async (message) => {
	if(!message.isChat) {
		if(message.$match[1].toLowerCase() === 'выкл')
		{
			message.malling.set("mute", true);
			await message.malling.save();
	
			return message.reply(`получение уведомлений выключено. Если вы захотите вновь получать уведомления, используйте команду "уведомления вкл".`);
		}
	
		if(message.$match[1].toLowerCase() === 'вкл')
		{
			message.malling.set("mute", false);
			await message.malling.save();
	
			return message.reply(`получение уведомлений включено.`);
		}
	}

	if(message.$match[1].toLowerCase() === 'выкл')
	{
		message.malling.set("mute", true);
		await message.malling.save();

		return message.reply(`получение уведомлений для данной беседы выключено. Если вы захотите вновь получать уведомления в данную беседу, используйте команду "уведомления вкл".`);
	}

	if(message.$match[1].toLowerCase() === 'вкл')
	{
		message.malling.set("mute", false);
		await message.malling.save();

		return message.reply(`получение уведомлений для данной беседы включено.`);
	}
});

// ИГРОВЫЕ КОМАНДЫ (АДМИНСКИЕ И ПРОЧИЕ)*******************************************************************

updates.hear(/^(?:промосоздать)\s([0-9]+)\s([0-9]+)\s(.*)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return;
	let $promo = await Promo.findOne({ title: message.$match[3].toLowerCase() });

	if($promo) return message.reply(`уже есть такой промокод.`);
	let newPromo = new Promo({
		title: message.$match[3].toLowerCase(),
		count: Number(message.$match[1]),
		users: [],
		sum: Number(message.$match[2])
	});

	await newPromo.save();
	return message.reply(`промокод создан.`);
});

updates.hear(/^(?:промостатус)\s(.*)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return;
	let $promo = await Promo.findOne({ title: message.$match[1].toLowerCase() });
	if(!$promo) return message.reply(`промокод не найден!`);

	return message.reply(`информация:
	
	🆕 Осталось активаций: ${$promo.count - $promo.users.length}\n💰 Сумма: ${utils.spaces($promo.sum)}$`);
});

updates.hear(/^(?:промо)\s(.*)$/i, async (message) => {
	let $promo = await Promo.findOne({ title: message.$match[1].toLowerCase() });

	if(!$promo) return message.reply(`промокод не найден!`);
	if($promo.users.indexOf(message.senderId) !== -1) return message.reply(`вы уже активировали этот промокод.`);

	if($promo.users.length >= $promo.count) {
		await $promo.remove();
		return message.reply(`промокод закончился...`);
	}

	$promo.users.push(message.senderId);
	await $promo.save();

	await message.user.inc("balance", $promo.sum);
	return message.reply(`вы успешно активировали промокод!\n\n🆕 Осталось активаций: ${$promo.count - $promo.users.length}\n💰 Вы получили ${utils.spaces($promo.sum)}$`);
});

updates.hear(/^(?:донат|👑 донат)$/i, async (message) => {
	return message.reply(`⚠ Донат пока недоступен. По интересующимся вопросам и предложениям свяжитесь с: vk.com/jaysmitty`);
});

updates.hear(/^(?:репорт)\s([^]+)$/i, async (message) => {
	if(message.user.banreport) return message.reply(`вы не можете писать в репорт. ${utils.getSadEmoji()}`);
	if(message.user.treport > getUnix()) return message.reply(`вы сможете отправить новое сообщение через ${unixStampLeft(message.user.treport - Date.now())}`);

	await vk.api.call("messages.send", { chat_id: adminchat, message: `${admins.map((x, i) => `@id${x} (Админ №${i+1})`).join(" ")}, новый репорт!
	🗣 Отправил: ${message.senderId}
	🔎 Игровой ID: ${message.user.uid}
	➡ @id${message.senderId} (${message.user.tag})${message.isChat ? " в беседе №"+message.chatId : ""}: ${message.$match[1]}`, random_id: Math.random(), attachment: message.attachments, forward_messages: message.id });

	if(message.attachments.find((x) => typeof(x) !== "string")) {
		let att = message.attachments.filter((x) => typeof(x) !== "string");
		att.map(async (x) => {
			const { largePhoto } = x;

			const attachment = await vk.upload.messagePhoto({
				peer_id: 350151000,
				source: largePhoto
			});

			await vk.api.call("messages.send", {
				chat_id: adminchat,
				message: "[Фотография из репорта] от @id" + message.senderId,
				attachment: attachment,
				random_id: Math.random()
			});
		});
	}

	await message.user.set("treport", getUnix() + 60000);

	await message.reply(`ваше сообщение отправлено.`);
});

updates.hear(/^(?:ответ)\s([0-9]+)\s([^]+)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.send(`недостаточно прав.`);
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	await vk.api.call("messages.send", { user_id: user.id, message: `✉ | Ответ от модератора <<${message.user.tag}>>:\n\n${message.$match[2]}`, random_id: Math.random() });
	return message.reply(`ответ отправлен.`);
});

updates.hear(/^(?:чатответ)\s([0-9]+)\s([^]+)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.send(`недостаточно прав.`);

	await vk.api.call("messages.send", { chat_id: Number(message.$match[1]), message: `✉ | Ответ от модератора <<${message.user.tag}>>:\n\n${message.$match[2]}`, random_id: Math.random() });
	return message.reply(`ответ отправлен.`);
});

updates.hear(/^(?:getid)$/i, async (message) => {
	if(vips.indexOf(message.senderId) === -1) return;

	if (!message.forwards[0]) {
		return message.reply(`перешлите сообщение игрока.`);
	} else {
		if(message.forwards[0]) {
			let user = await User.findOne({ id: message.forwards[0].senderId });
	
			if(!user) return message.reply(`пользователь не найден.`);
			return message.reply(`айди игрока: ${user.uid}`);
		} else if (message.replyMessage[0]) {
			let user = await User.findOne({ id: message.replyMessage[0].senderId });
	
			if(!user) return message.reply(`пользователь не найден.`);
			return message.reply(`айди игрока: ${user.uid}`);
		} else {
			return message.reply(`ошибка.`);
		}
	}
});

updates.hear(/^(?:get)\s([0-9]+)/i, async (message) => {
	if(vips.indexOf(message.senderId) === -1) return;
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) user = await User.findOne({ id: Number(message.$match[1]) });
	if(!user) return message.reply(`неверный игровой ID/VK ID`);

	await message.reply(`информация:

🔎 ID: ${user.uid}
🆔 VK ID: @id${user.id}
✒ Ник: ${user.tag}
💎 Бонус: ${user.tbonus > Date.now() ? "✅ Получен" : "❌ Не получен"}
💰 Баланс: ${utils.spaces(user.balance)}$ (Банк: ${utils.spaces(user.bank)}$)
👔 Алмазов: ${utils.spaces(user.diamonds)}$
👑 Рейтинг: ${utils.spaces(user.rating)}
📈 Уровень: ${utils.spaces(user.lvl)}
👔 Работа: ${user.work ? works.find((x) => x.id === user.work).name : "❌"}
🚘 Машина: ${user.car ? CARS.find((x) => x.id == user.car).name : `❌`}
👔 Топлива: ${utils.spaces(user.toplivo)} л
🎁 Получил подарок: ${user.xmas ? "✅" : "❌"}

🏆 Бан топа: ${user.bantop ? "✅": "❌"}
🆘 Бан репорта: ${user.banreport ? "✅" : "❌"}
🤝 Бан передач: ${user.banpay ? "✅" : "❌"}

⌨ Клавиатура: ${user.buttons[0] ? `\n${user.buttons.join(", ")}` : `❌`}`);
});

updates.hear(/^(?:logfrom)\s([0-9]+)\s([0-9]+)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return;

	let user = await User.findOne({ uid: Number(message.$match[1]) });
	if(!user) return message.reply(`неверный ID`);

	message.reply(`идёт поиск операций связанных с @id${user.id} (${user.tag})...`);

	let logs = await Log.find({ from: user.id });
		logs = logs.filter((x) => ( x.date + ( Number(message.$match[2]) * 60000 ) ) > getUnix());

	if(!logs) return message.reply(`логи связанные с ${user.tag} не найдены!`);
	return message.reply(`${
		logs.map((x) => `[${unixStamp(x.date)}] @id${user.id} (${user.tag}) перевёл игроку @id${x.to} ${utils.spaces(x.amount)}$`)
		.join("\n")
	}`);
});

updates.hear(/^(?:logto)\s([0-9]+)\s([0-9]+)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return;

	let user = await User.findOne({ uid: Number(message.$match[1]) });
	if(!user) return message.reply(`неверный ID`);

	message.reply(`идёт поиск операций связанных с @id${user.id} (${user.tag})...`);

	let logs = await Log.find({ to: user.id });
		logs = logs.filter((x) => ( x.date + ( Number(message.$match[2]) * 60000 ) ) > getUnix());

	if(!logs) return message.reply(`логи связанные с ${user.tag} не найдены!`);
	return message.reply(`${
		logs.map((x) => `[${unixStamp(x.date)}] @id${x.from} перевёл игроку @id${user.id} (${user.tag}) ${utils.spaces(x.amount)}$`)
		.join("\n")
	}`);
});

updates.hear(/^(?:бантоп)\s([0-9]+)$/i, async (message) => {
	if(vips.indexOf(message.senderId) === -1) return;
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);

	if(user.bantop) {
		await user.set("bantop", false);
		await message.reply(`вы сняли бан топа.`);

		await vk.api.call("messages.send", { user_id: user.id, message: `🔔 Вас вернули в топ.`, random_id: Math.random() });
		vk.api.call("messages.send", {
			chat_id: adminchat,
			message: `🔔 Уведомление:
			
			Администратор @id${message.senderId} (ID: ${message.user.uid}) снял бан топа игроку @id${user.id} (ID: ${message.$match[1]})`,
			random_id: Math.random()
		});
	} else {
		await user.set("bantop", true);
		await message.reply(`вы выдали бан топа.`);

		await vk.api.call("messages.send", { user_id: user.id, message: `🔔 Вас убрали из топа.`, random_id: Math.random() });
		vk.api.call("messages.send", {
			chat_id: adminchat,
			message: `🔔 Уведомление:
			
			Администратор @id${message.senderId} (ID: ${message.user.uid}) выдал бан топа игроку @id${user.id} (ID: ${message.$match[1]})`,
			random_id: Math.random()
		});
	}
});

updates.hear(/^(?:банреп)\s([0-9]+)$/i, async (message) => {
	if(vips.indexOf(message.senderId) === -1) return;
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);

	if(user.banreport) {
		await user.set("banreport", false);
		await message.reply(`вы сняли бан репорта.`);

		await vk.api.call("messages.send", { user_id: user.id, message: `🔔 Вы снова можете писать в репорт.`, random_id: Math.random() });
		vk.api.call("messages.send", {
			chat_id: adminchat,
			message: `🔔 Уведомление:
			
			Администратор @id${message.senderId} (ID: ${message.user.uid}) снял бан репорта игроку @id${user.id} (ID: ${message.$match[1]})`,
			random_id: Math.random()
		});
	} else {
		await user.set("banreport", true);
		await message.reply(`вы выдали бан репорта.`);

		await vk.api.call("messages.send", { user_id: user.id, message: `🔔 Вы получили блокировку репорта!`, random_id: Math.random() });
		vk.api.call("messages.send", {
			chat_id: adminchat,
			message: `🔔 Уведомление:
			
			Администратор @id${message.senderId} (ID: ${message.user.uid}) выдал бан репорта игроку @id${user.id} (ID: ${message.$match[1]})`,
			random_id: Math.random()
		});
	}
});

updates.hear(/^(?:пбан)\s([0-9]+)$/i, async (message) => {
	if(vips.indexOf(message.senderId) === -1) return;
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);

	if(user.banpay) {
		if(user.id === message.senderId && admins.indexOf(message.senderId) === -1) return message.send(`Ебланус??????`);

		await user.set("banpay", false);
		await message.reply(`вы сняли бан передач.`);

		await vk.api.call("messages.send", { user_id: user.id, message: `🔔 Вы снова можете получать и делать передачи.`, random_id: Math.random() });
		vk.api.call("messages.send", {
			chat_id: adminchat,
			message: `🔔 Уведомление:
			
			Администратор @id${message.senderId} (ID: ${message.user.uid}) снял бан передач игроку @id${user.id} (ID: ${message.$match[1]})`,
			random_id: Math.random()
		});
	} else {
		await user.set("banpay", true);
		await message.reply(`вы выдали бан передач.`);

		await vk.api.call("messages.send", { user_id: user.id, message: `🔔 Вы получили блокировку передач!`, random_id: Math.random() });
		vk.api.call("messages.send", {
			chat_id: adminchat,
			message: `🔔 Уведомление:
			
			Администратор @id${message.senderId} (ID: ${message.user.uid}) выдал бан передач игроку @id${user.id} (ID: ${message.$match[1]})`,
			random_id: Math.random()
		});
	}
});

updates.hear(/^(?:giverating)\s([0-9]+)\s(.*)$/i, async (message) => {
	if(message.user.bangive) return message.reply(`вам недоступны команды для взаимодействия с балансом.`);

	if(vips.indexOf(message.senderId) === -1) return;
	if(admins.indexOf(message.senderId) === -1 && message.user.admingive > getUnix()) return message.reply(`вы сможете выдавать через ${unixStampLeft(message.user.admingive - getUnix())}`);

	let user = await User.findOne({ uid: Number(message.$match[1]) });
	if(!user) return message.reply(`неверный ID.`);

	message.$match[2] = utils.parseBet(message.$match[2], message.user.rating);
	if(!message.$match[2]) return;
	
	if(user.id !== message.senderId && message.$match[2] > 10000) return message.reply(`лимит: 10 тысяч`);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) выдал рейтинг (${utils.spaces(message.$match[2])}) игроку @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	await user.inc("rating", message.$match[2]);
	await message.user.set("admingive", getUnix() + 120000);

	return message.reply(`вы выдали игроку <<@id${user.id} (${user.tag})>> ${utils.spaces(message.$match[2])}👑`);
});

updates.hear(/^(?:givebank)\s([0-9]+)\s(.*)$/i, async (message) => {
	if(message.user.bangive) return message.reply(`вам недоступны команды для взаимодействия с балансом.`);

	if(vips.indexOf(message.senderId) === -1) return;
	if(admins.indexOf(message.senderId) === -1 && message.user.admingive > getUnix()) return message.reply(`вы сможете выдавать через ${unixStampLeft(message.user.admingive - getUnix())}`);

	let user = await User.findOne({ uid: Number(message.$match[1]) });
	if(!user) return message.reply(`неверный ID.`);

	message.$match[2] = utils.parseBet(message.$match[2], message.user.bank);
	if(!message.$match[2]) return;
	
	if(user.id !== message.senderId && message.$match[2] > 1000000000000) return message.reply(`лимит: 1 триллион`);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) выдал в банк денег (${utils.spaces(message.$match[2])}) игроку @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	await user.inc("bank", message.$match[2]);
	await message.user.set("admingive", getUnix() + 120000);

	return message.reply(`вы выдали игроку <<@id${user.id} (${user.tag})>> ${utils.spaces(message.$match[2])}$`);
});

updates.hear(/^(?:givediamonds)\s([0-9]+)\s(.*)$/i, async (message) => {
	if(message.user.bangive) return message.reply(`вам недоступны команды для взаимодействия с балансом.`);

	if(vips.indexOf(message.senderId) === -1) return;
	if(admins.indexOf(message.senderId) === -1 && message.user.admingive > getUnix()) return message.reply(`вы сможете выдавать через ${unixStampLeft(message.user.admingive - getUnix())}`);

	let user = await User.findOne({ uid: Number(message.$match[1]) });
	if(!user) return message.reply(`неверный ID.`);

	message.$match[2] = utils.parseBet(message.$match[2], message.user.diamonds);
	if(!message.$match[2]) return;
	
	if(user.id !== message.senderId && message.$match[2] > 1000000000000) return message.reply(`лимит: 1 триллион`);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) выдал алмазы (${utils.spaces(message.$match[2])}) игроку @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	await user.inc("diamonds", message.$match[2]);
	await message.user.set("admingive", getUnix() + 120000);

	return message.reply(`вы выдали игроку <<@id${user.id} (${user.tag})>> ${utils.spaces(message.$match[2])}💎`);
});

updates.hear(/^(?:givetoplivo)\s([0-9]+)\s(.*)$/i, async (message) => {
	if(message.user.bangive) return message.reply(`вам недоступны команды для взаимодействия с балансом.`);

	if(vips.indexOf(message.senderId) === -1) return;
	if(admins.indexOf(message.senderId) === -1 && message.user.admingive > getUnix()) return message.reply(`вы сможете выдавать через ${unixStampLeft(message.user.admingive - getUnix())}`);

	let user = await User.findOne({ uid: Number(message.$match[1]) });
	if(!user) return message.reply(`неверный ID.`);

	message.$match[2] = utils.parseBet(message.$match[2], message.user.toplivo);
	if(!message.$match[2]) return;
	
	if(user.id !== message.senderId && message.$match[2] > 1000000000000) return message.reply(`лимит: 1 триллион`);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) выдал топливо в кол-ве ${utils.spaces(message.$match[2])} л игроку @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	await user.inc("toplivo", message.$match[2]);
	await message.user.set("admingive", getUnix() + 120000);

	return message.reply(`вы выдали игроку <<@id${user.id} (${user.tag})>> топливо в кол-ве ${utils.spaces(message.$match[2])} л`);
});

updates.hear(/^(?:give)\s([0-9]+)\s(.*)$/i, async (message) => {
	if(message.user.bangive) return message.reply(`вам недоступны команды для взаимодействия с балансом.`);

	if(vips.indexOf(message.senderId) === -1) return;
	if(admins.indexOf(message.senderId) === -1 && message.user.admingive > getUnix()) return message.reply(`вы сможете выдавать через ${unixStampLeft(message.user.admingive - getUnix())}`);

	let user = await User.findOne({ uid: Number(message.$match[1]) });
	if(!user) return message.reply(`неверный ID.`);

	message.$match[2] = utils.parseBet(message.$match[2], message.user.balance);
	if(!message.$match[2]) return;
	
	if(user.id !== message.senderId && message.$match[2] > 1000000000000) return message.reply(`лимит: 1 триллион`);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) выдал деньги (${utils.spaces(message.$match[2])}) игроку @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	await user.inc("balance", message.$match[2]);
	await message.user.set("admingive", getUnix() + 120000);

	return message.reply(`вы выдали игроку <<@id${user.id} (${user.tag})>> ${utils.spaces(message.$match[2])}$`);
});

updates.hear(/^(?:setbalance)\s([0-9]+)\s(.*)$/i, async (message) => {
	if(message.user.bangive) return message.reply(`вам недоступны команды для взаимодействия с балансом.`);

	if(vips.indexOf(message.senderId) === -1) return;
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);

	message.$match[2] = utils.parseBet(message.$match[2], message.user.balance);
	if(!message.$match[2]) return;

	if(user.id !== message.senderId && message.$match[2] > 1000000000000) return message.reply(`лимит: 1 триллион`);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) установил баланс (${utils.spaces(message.$match[2])}) игроку @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	await user.set("balance", message.$match[2]);
	return message.reply(`вы установили игроку <<@id${user.id} (${user.tag})>> баланс на ${utils.spaces(message.$match[2])}$`);
});

updates.hear(/^(?:setdiamonds)\s([0-9]+)\s(.*)$/i, async (message) => {
	if(message.user.bangive) return message.reply(`вам недоступны команды для взаимодействия с балансом.`);

	if(vips.indexOf(message.senderId) === -1) return;
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);

	message.$match[2] = utils.parseBet(message.$match[2], message.user.diamonds);
	if(!message.$match[2]) return;
	
	if(user.id !== message.senderId && message.$match[2] > 100000) return message.reply(`лимит: 100 тысяч`);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) установил алмазы (${utils.spaces(message.$match[2])}) игроку @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	await user.set("diamonds", message.$match[2]);
	return message.reply(`вы установили игроку <<@id${user.id} (${user.tag})>> алмазы на ${utils.spaces(message.$match[2])}`);
});

updates.hear(/^(?:setcar)\s([0-9]+)\s(.*)$/i, async (message) => {
	if(message.user.bangive) return message.reply(`вам недоступны команды для взаимодействия с балансом.`);

	if(vips.indexOf(message.senderId) === -1) return;
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);

	message.$match[2] = Number(message.$match[2]);
	if(!message.$match[2]) return;

	setcar = CARS.find((x) => x.id == message.$match[2]).name

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) дал машину (${setcar}) игроку @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	await user.set("car", message.$match[2]);
	return message.reply(`вы дали игроку <<@id${user.id} (${user.tag})>> машину ${setcar}`);
});

updates.hear(/^(?:settoplivo)\s([0-9]+)\s(.*)$/i, async (message) => {
	if(message.user.bangive) return message.reply(`вам недоступны команды для взаимодействия с балансом.`);

	if(vips.indexOf(message.senderId) === -1) return;
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);

	message.$match[2] = utils.parseBet(message.$match[2], message.user.toplivo);
	if(!message.$match[2]) return;
	
	if(user.id !== message.senderId && message.$match[2] > 100000) return message.reply(`лимит: 100 тысяч`);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) установил топливо на ${utils.spaces(message.$match[2])} л игроку @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	await user.set("toplivo", message.$match[2]);
	return message.reply(`вы установили игроку <<@id${user.id} (${user.tag})>> топливо на ${utils.spaces(message.$match[2])} л`);
});

updates.hear(/^(?:setrating)\s([0-9]+)\s(.*)$/i, async (message) => {
	if(message.user.bangive) return message.reply(`вам недоступны команды для взаимодействия с балансом.`);

	if(admins.indexOf(message.senderId) === -1) return message.reply(``);
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);

	message.$match[2] = utils.parseBet(message.$match[2], message.user.rating);
	if(!message.$match[2]) return;
	
	if(user.id !== message.senderId && message.$match[2] > 10000) return message.reply(`лимит: 10 тысяч`);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) установил рейтинг (${utils.spaces(message.$match[2])}) игроку @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	await user.set("rating", message.$match[2]);
	return message.reply(`вы установили игроку <<@id${user.id} (${user.tag})>> рейтинг на ${utils.spaces(message.$match[2])}`);
});

updates.hear(/^(?:resetwork)\s([0-9]+)/i, async (message) => {

	if(admins.indexOf(message.senderId) === -1) return message.reply(``);
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) сбросил таймер работы игроку @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	await user.set("twork", 0);
	return message.reply(`вы сбросили таймер работы игроку <<@id${user.id} (${user.tag})>>`);
});

updates.hear(/^(?:resetcrack)\s([0-9]+)/i, async (message) => {

	if(admins.indexOf(message.senderId) === -1) return message.reply(``);
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) сбросил таймер взлома игроку @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	await user.set("tcrack", 0);
	return message.reply(`вы сбросили таймер взлома игроку <<@id${user.id} (${user.tag})>>`);
});

updates.hear(/^(?:resettaxi)\s([0-9]+)/i, async (message) => {

	if(admins.indexOf(message.senderId) === -1) return message.reply(``);
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) сбросил таймер такси игроку @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	await user.set("ttaxi", 0);
	return message.reply(`вы сбросили таймер такси игроку <<@id${user.id} (${user.tag})>>`);
});

updates.hear(/^(?:resettransfer)\s([0-9]+)/i, async (message) => {

	if(admins.indexOf(message.senderId) === -1) return message.reply(``);
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) сбросил таймер передач игроку @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	await user.set("ttransfer", 0);
	return message.reply(`вы сбросили таймер передач игроку <<@id${user.id} (${user.tag})>>`);
});

updates.hear(/^(?:resetplayer)\s([0-9]+)/i, async (message) => {

	if(admins.indexOf(message.senderId) === -1) return message.reply(``);

	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) обнулил игрока @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	user.balance = 500
	user.bank = 0
	user.rating = 0
	user.diamonds = 0
	user.work = 0
	user.lvl = 1
	user.tbonus = 0
	user.twork = 0
	user.ttransfer = 0
	user.car = 0
	user.toplivo = 0
	user.ttaxi = 0
	user.house = 0
	user.apartment = 0
	user.phone = 0
	user.computer = 0

	await user.save();
	console.log(`[${unixStamp(getUnix())} ${message.isChat ? "chat"+message.chatId+", @id"+message.senderId : "@id"+message.senderId}]: Reset user - @id${user.id}`);

	return message.reply(`вы обнулили игрока <<@id${user.id} (${user.tag})>>`);
});

updates.hear(/^(?:setlvl)\s([0-9]+)\s(.*)$/i, async (message) => {
	if(message.user.bangive) return message.reply(`вам недоступны команды для взаимодействия с балансом.`);

	if(admins.indexOf(message.senderId) === -1) return message.reply(``);
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);

	message.$match[2] = utils.parseBet(message.$match[2], message.user.lvl);
	if(!message.$match[2]) return;
	
	if(user.id !== message.senderId && message.$match[2] > 10000) return message.reply(`лимит: 10 тысяч`);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) установил уровень (${utils.spaces(message.$match[2])}) игроку @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	await user.set("lvl", message.$match[2]);
	return message.reply(`вы установили игроку <<@id${user.id} (${user.tag})>> уровень на ${utils.spaces(message.$match[2])}`);
});

updates.hear(/^(?:setbank)\s([0-9]+)\s(.*)$/i, async (message) => {
	if(message.user.bangive) return message.reply(`вам недоступны команды для взаимодействия с балансом.`);

	if(vips.indexOf(message.senderId) === -1) return;
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);

	message.$match[2] = utils.parseBet(message.$match[2], message.user.bank);
	if(!message.$match[2]) return;
	
	if(user.id !== message.senderId && message.$match[2] > 1000000000000) return message.reply(`лимит: 1 триллион`);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) установил банк (${utils.spaces(message.$match[2])}) игроку @id${user.id} (ID: ${message.$match[1]})`,
		random_id: Math.random()
	});

	await user.set("bank", message.$match[2]);
	return message.reply(`вы установили игроку <<@id${user.id} (${user.tag})>> банк на ${utils.spaces(message.$match[2])}`);
});

updates.hear(/^(?:setnick)\s([0-9]+)\s(.*)$/i, async (message) => {
	if(vips.indexOf(message.senderId) === -1) return;
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);
	await user.set("tag", message.$match[2]);

	vk.api.call("messages.send", {
		chat_id: adminchat,
		message: `🔔 Уведомление:
		
		Администратор @id${message.senderId} (ID: ${message.user.uid}) установил ник игроку игроку @id${user.id} (ID: ${message.$match[1]})\n\nНовый ник игрока: ${message.$match[2]}`,
		random_id: Math.random()
	});

	await message.reply(`вы изменили ник игроку.`);
	await vk.api.call("messages.send", { user_id: user.id, message: `🔔 Вам изменили ник. Ваш новый ник: "${message.$match[2]}"`, random_id: Math.random() });
});

updates.hear(/^(?:статистика)/i, async (message) => {
	if(vips.indexOf(message.senderId) === -1) return;
	let _users = await User.countDocuments();
	let _chats = await Chat.countDocuments();

	return message.send(`Статистика:
🔝 UpTime: ${unixStampLeft(process.uptime() * 1000)}
😸 Количество игроков: ${_users}
😸 Количество бесед: ${_chats}
🚫 Заблокировано: 0
✉️ Сообщений с момента старта: ${utils.spaces(stats.messages.inbox).replace(/\s/g, ".")}
🙎‍♂️ Новых игроков с момента старта: ${utils.spaces(stats.new_users).replace(/\s/g, ".")}
🙎‍♂️ Новых бесед с момента старта: ${utils.spaces(stats.new_chats).replace(/\s/g, ".")}`);
});

updates.hear(/^(?:админка)$/i, async (message) => {
	if(vips.indexOf(message.senderId) === -1) return;
	return message.reply(`команды админа:
	📊 Статистика
	📊 Список игроков [диапазон]
	📊 Рассылка [текст] (прикрепления)
	📊 Написать во все чаты (скрытно) [текст]
	📊 Написать в чат (скрытно) [ID] [текст]

	✒ Setnick [ID] [Ник] - Сменить ник
	💡 Getid +Пересланное сообщение - Узнать айди
	💡 Get [ID] - Инфа о пользователе
	
	🔑 Give [ID] [Сумма] - Выдать деньги
	🔑 Givebank [ID] [Сумма] - Выдать деньги в банк
	🔑 Giverating [ID] [Сумма] - Выдать рейтинг
	🔑 Givediamonds [ID] [Сумма] - Выдать алмазы
	🔑 Givetoplivo [ID] [Сумма] - Выдать топливо
	🔑 Setbalance [ID] [Сумма] - Установить баланс игроку
	🔑 Setbank [ID] [Сумма] - Установить банк игроку
	🔑 Setrating [ID] [Сумма] - Установить рейтинг игроку
	🔑 Setlvl [ID] [Сумма] - Установить уровень игроку
	🔑 Setdiamonds [ID] [Сумма] - Установить алмазы игроку
	🔑 Settoplivo [ID] [Сумма] - Установить топливо игроку
	🔑 Setcar [ID] [ID машины] - Выдать машину игроку
	🔑 Resetwork [ID] - Сбросить таймер работы игроку
	🔑 Resetcrack [ID] - Сбросить таймер взлома игроку
	🔑 Resettaxi [ID] - Сбросить таймер такси игроку
	🔑 Resettransfer [ID] - Сбросить таймер передач игроку
	🔑 Resetplayer [ID] - Обнуление игрока
	
	🆘 Банреп [ID] - Забанить репорт
	🏆 Бантоп [ID] - Забанить топ
	🤝 Пбан [ID] - Забанить передачи`);
});

updates.hear(/^(?:абан)\s([0-9]+)$/i, async (message) => {
	let user = await User.findOne({ uid: Number(message.$match[1]) });

	if(!user) return message.reply(`неверный ID.`);

	if(user.bangive) {
		await user.set("bangive", false);
		return message.reply(`Бан команд снят.`);
	} else {
		await user.set("bangive", true);
		return message.reply(`бан команд выдан.`);
	}
});

updates.hear(/^(?:написать во все чаты|нввч|send message all chat|smac)\s([^]+)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.send(`недостаточно прав.`);

	try {
		Chat.find().then((res) => {
			res.filter((x) => x.cid > 0).map(async x => {
				await vk.api.call("messages.send", { chat_id: x.id, message: `✉ | Сообщение от администратора бота <<${message.user.tag}>>:\n\n${message.$match[1]}`, random_id: Math.random() });
			}); 
		});
		return message.reply(`сообщение отправлено.`);
	} catch (error) {
		console.log(error)
		return message.reply(`ошибка при отправке.`);
	}
});

updates.hear(/^(?:написать во все чаты скрытно|нввчс|send message all chat x|smacx)\s([^]+)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.send(`недостаточно прав.`);

	try {
		Chat.find().then((res) => {
			res.filter((x) => x.cid > 0).map(async x => {
				await vk.api.call("messages.send", { chat_id: x.id, message: `${message.$match[1]}`, random_id: Math.random() });
			}); 
		});
		return message.reply(`сообщение отправлено.`);
	} catch (error) {
		console.log(error)
		return message.reply(`ошибка при отправке.`);
	}
});

updates.hear(/^(?:написать в чат|нвч|send message chat|smc)\s([0-9]+)\s([^]+)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.send(`недостаточно прав.`);

	let chatsend = await Chat.findOne({ id: Number(message.$match[1]) });

	if(!chatsend) return message.reply(`неверный ID.`);

	try {
		await vk.api.call("messages.send", { chat_id: chatsend.id, message: `✉ | Сообщение от администратора бота <<${message.user.tag}>>:\n\n${message.$match[2]}`, random_id: Math.random() });
		return message.reply(`сообщение отправлено.`);
	} catch (error) {
		console.log(error)
		return message.reply(`ошибка при отправке.`);
	}
});

updates.hear(/^(?:написать в чат скрытно|нвчс|send message chat x|smcx)\s([0-9]+)\s([^]+)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.send(`недостаточно прав.`);

	let chatsend = await Chat.findOne({ id: Number(message.$match[1]) });

	if(!chatsend) return message.reply(`неверный ID.`);

	try {
		await vk.api.call("messages.send", { chat_id: chatsend.id, message: `${message.$match[2]}`, random_id: Math.random() });
		return message.reply(`сообщение отправлено.`);
	} catch (error) {
		console.log(error)
		return message.reply(`ошибка при отправке.`);
	}
});

// СЕРВИСНЫЕ КОМАНДЫ*************************************************************************

updates.hear(/^(?:онлайн|созвать|позови всех)$/i, async (message) => {
	if(!message.isChat) return bot(`команда работает только в беседе!`);

	try {
		vk.api.messages.getConversationMembers({
			peer_id: message.peerId,
			fields: "online"
		}).then(async function (response) {
			let text = `список людей, которые сейчас находятся онлайн:\n\n`;
			await response.profiles.map(e => {
				if(e.id < 1) return;
				if(e.online != 0) text += `*id${e.id} (${e.first_name.slice(0,1)}. ${e.last_name})\n`;
				})
			return message.reply(text)
		})
	} catch (APIError) {
		console.log(APIError)
		return message.reply('не удалось получить участников беседы, возможно у меня нет прав администратора!')
	}
});

updates.hear(/^(?:who is|кто тут|кто здесь)\s?(.*)?$/i, async (message) => {
    // Проверка, если сообщение не из чата - игнор
    if (!message.isChat) {
        return message.reply("используйте в чате!");
	}
	if (!message.$match[1]) {
		return message.reply('укажите определение!');
	}

	try {
		let { profiles } = await vk.api.messages.getConversationMembers({
			peer_id: message.peerId
		});
		let profile = utils.pick(profiles);
		await message.reply(utils.pick(['это точно', 'я уверен, что это', 'сотку даю, что это']) + ' -- @id' + profile.id + '(' + profile.first_name + " " + profile.last_name  +  ')');
	} catch (APIError) {
		console.log(APIError)
		return message.reply('не удалось получить участников беседы, возможно у меня нет прав администратора!')
	}
});

updates.hear(/^(?:обзови|оскорби|обзыватель)$/i, async (message) => {
    // Проверка, если сообщение не из чата - игнор
    if (!message.isChat) {
        return message.reply("используйте в чате!");
	}

	let callers = ["алкаш", "алконавт", "аллаяр", "альтернативно-одаренный", "амаус", "аморал", "антихрист", "аптряй", "архаровец", "ащеул", "баба", "бабашкин", "бабинский", "бабуин", "баклан", "балабол", "баламошка", "баламут", "балахвостъ", "балахрыска", "балбес", "балда", "балдабей", "баляба", "бандит", "баран", "бармаглот", "барнабаш", "басалай", "басурманин", "башибузук", "бездарь", "бездельник", "безобразник", "безпелюха", "баба", "белебеня", "бестия", "бесстыдник", "бестолочь", "бесбашаный", "бзыря", "блаженный", "блудоумъ", "блудяшка", "бобыня", "божевольный", "болван", "болдырь", "болтун", "босяк", "ботаник", "брандахлыст", "бредкий", "брехло", "брыдлый", "буня", "буслай", "быдло", "бычара", "бяка", "в попу укушенный", "валандай", "ведьма", "верзила", "вертухай", "вешалка", "висельник", "волк позорный", "волочайка", "волчара", "вонючка", "выродок", "вертихвостка", "гадина", "гамадрил", "гандон", "глиста", "глуподырый", "гнида", "гноище", "гнус", "говно", "говноед", "голова садовая", "гомик", "гондурас", "гопник", "гопота", "грубиян", "грымза", "губошлёп", "гусь", "дармоед", "даун", "дебил", "дегенерат", "декадент", "демон", "дерьмо", "долбень", "долботряс", "дрищь", "дрянь", "дуб", "дубина", "дундук", "дунька", "дупель", "дурак", "дура", "дуралей", "дурень", "дурилка", "дурка", "дуропляс", "дурошлёп", "дурында", "душман", "дятел", "егоза", "едрён батон", "елдыга", "еропка", "ерохвость", "ёжкин кот", "ёкарный бабай", "ёлупень", "ёнда", "ёра", "жаба", "жадина", "жердяй", "жертва аборта", "живоглот", "жиртрест", "жлоб", "жмот", "жополиз", "жулик", "задница", "задрот", "залупа", "заморыш", "зануда", "зараза", "зверь", "злодей", "злыдень", "змея", "идиот", "изверг", "извращенец", "изверг", "изувер", "имбецил", "индюк", "ирод", "иуда", "ишак", "кащей", "киселяй", "колобродъ", "колотовка", "колупай", "королобый", "костеря", "кропотъ", "куёлда", "курощупъ", "кретин", "кикимора", "квазимодо", "курва", "каналья", "кровопийца", "козёл", "коза", "козлина", "какашка", "кривляка", "кошелка", "клюшка", "клоп", "крыса", "корова", "клуша", "каин", "крамольник", "кровосос", "козлодой", "козлодорасина", "козья морда", "копрофил", "копрофаг", "кабан", "козявка", "каланча", "криволапый", "косорукий", "краля", "колдырь", "кугут", "кракозяблик", "лежака", "лох", "лошара", "лоший", "лудъ", "любомудръ", "лярва", "лахудра", "лопух", "лицемер", "лодырь", "лентяй", "лягушатник", "лоботряс", "лось", "лиходей", "макака", "малахольный", "мамошка", "мандуда", "маракуша", "мартышка", "маромойка", "мерзавец", "мерзопакость", "метёлка", "михрютка", "младоуменъ", "мокрица", "мокрощёлка", "монстр", "морда", "мордофиля", "моркотникъ", "москолудъ", "мочалка", "мразь", "мракобес", "муфлон", "мухоблудъ", "мымра", "наглец", "насупа", "насупоня", "нарик", "нахал", "невегласъ", "невежа", "невежда", "негораздокъ", "неповоротень", "несмыселъ", "нефырь", "негодяй", "недоносок", "недотёпа", "недотыкомка", "недоумок", "непотопляемый", "нетопырь", "нехристь", "нечисть", "ничтожество", "обдувало", "обезьяна", "обломъ", "облудъ", "оболдуй", "оболтус", "обормот", "овца", "оглоед", "огуряла", "одоробло", "озорник", "окаёмъ", "окаянный", "околотень", "олень", "олигофрен", "олух", "опущ", "орангутан", "осёл", "остолбень", "остолоп", "отморозок", "отстой", "отымалка", "охальникъ", "охламон", "очкарик", "пакостник", "паршивец", "пеньтюхъ", "пехтюхъ", "печегнётъ", "печная ездова", "плеха", "поганец", "подлец", "попрешница", "потатуй", "похабникъ", "пресноплюй", "проказник", "прохвост", "псоватый", "пустобрёхъ", "пустошный", "пыня", "пятигузъ", "паскуда", "подонок", "пройдоха", "придурок", "петух", "паразит", "подлец", "падаль", "пиписька", "пипирка", "подлиза", "пустомеля", "перечница", "пустозвон", "пустышка", "пёс", "параноик", "пустобрёх", "проглот", "пьянь", "пират", "побируха", "поганец", "пугало", "параша", "пархатый", "песец", "падла", "прошмандовка", "потаскуха", "псих", "прыщ", "пелотка", "простофиля", "поросёнок", "порось", "проныра", "пень", "проститутка", "подстилка", "пердун", "разгильдяй", "раздолбай", "размазня", "рохля", "рыло", "рожа", "разбойник", "редиска", "рвань", "растяпа", "раззява", "сволочь", "сдёргоумка", "стерва", "супостат", "сукин сын", "свинья", "свиноматка", "собака", "сука", "сучара", "скотина", "скунс", "слюнтяй", "срань господня", "ссыкуха", "синяк", "сатана", "скотобаза", "сопля", "сосунок", "соплежуй", "спиногрыз", "сапожник", "сквалыга", "скупердяй", "садист", "слюнтяй", "скряга", "старпёр", "тварь", "титёшница", "тюрюхайло", "тупица", "тормоз", "трынделка", "тюфяк", "тиран", "титька тараканья", "тундра", "травяной мешок", "тугодум", "убожество", "ублюдок", "упырь", "урюпа", "урод", "урюк", "ушлёпок", "фетюк", "фигляр", "фифа", "фофан", "фуфло", "фуфлыга", "хабалъ", "хам", "хамло", "хандрыга", "хмырь", "хмыстень", "хохрикъ", "хобяка", "цуцик", "чёртъ верёвочный", "чужеядъ", "чёрт", "чудовище", "чмо", "чмошник", "чмырь", "чучело", "чувырла", "чепушило", "чикса", "чурка", "черномазый", "чурбан", "чушка", "чуха", "чучундра", "чудик", "четырёхглазый", "шаврикъ", "шалава", "щалопунь", "шантрапа", "шаромыжник", "шваль", "шевяк", "шинора", "шлында", "шпынь голова", "шалопут", "шмара", "шлюха", "шайтан", "шизик", "шакал", "шкура", "шмакодявка", "шавка", "шелупонь", "шаболда", "шалюка", "шалопай", "щаул", "щегол", "щенок", "юродивый", "ябеда", "яйцеголовый", "японский городовой", "ятидрёный хряп"]

	if (!message.forwards[0]) {
		try {
			var users = await vk.api.messages.getConversationMembers({
				peer_id: message.peerId
			})
			var user = utils.pick(users.profiles);
			var caller = utils.pick(callers);
			return message.reply(`@id${user.id} (${user.first_name} ${user.last_name}) - ${caller}`);
		} catch (APIError) {
			console.log(APIError)
			return message.reply('не удалось получить участников беседы, возможно у меня нет прав администратора!');
		}
	} else {
		let [user] = await vk.api.call("users.get", { user_id: message.forwards[0].senderId });

		var caller = utils.pick(callers);

		return message.reply(`@id${user.id} (${user.first_name} ${user.last_name}) - ${caller}`);
	}
});

updates.hear(/^(?:когда|when)\s?([^]+)?$/i, async (message) => {
	if (!message.$match[1]) return message.reply('введите событие, о котором хоите узнать.');
    let times = {
    60: ['секунду', 'секунды', 'секунд'], 
    60: ['минуту', 'минуты', 'минут'], 
    24: ['час', 'часа', 'часов'], 
    365: ['день', 'дня', 'дней'], 
    2018: ['год', 'года', 'лет']
};
    let item = utils.pick(Object.keys(times));
    let time = utils.random(Number(item));
    let date = await nDay(time, times[item]);
    await message.reply(`событие произойдет, через ${time} ${date}`);

function nDay(n, titles) {
    return titles[(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2)];
};
});

updates.hear(/^(?:время|time)$/i, async (message) => {
	await message.reply(`${unixStamp(getUnix())}`);
});

updates.hear(/^(?:выбери)\s([^]+)\s(?:или)\s([^]+)$/i, async (message) => {
	const first = message.$match[1];
	const second = message.$match[2];
	let result = utils.pick([first, second])

	const phrase = utils.pick([`конечно ${result}`, `мне кажется, что ${result} лучше`]);
	await message.reply(`${phrase}`);
});

updates.hear(/^(?:шанс)\s?([^]+)?$/i, async (message) => {
	if (!message.$match[1]) return message.reply('напиши, что именно предсказать.');
	const phrase = utils.pick(['перспективы не очень хорошие', 'сейчас нельзя предсказать', 'пока не ясно', 'знаки говорят - "Да"', 'знаки говорят - "Нет"', 'можешь быть уверен в этом', 'мой ответ - "нет"', 'мой ответ - "да"', 'бесспорно', 'мне кажется - "Да"', 'мне кажется - "Нет"']);
	await message.reply(phrase);
});

updates.hear(/^(?:инфа)\s?(.*)?$/i, async (message) => {
	if (!message.$match[1]) return message.reply('шанс чего?');
    // Самая простая команда, просто рандомим число в промежутке 1-100
    await message.reply(`вероятность -- ${utils.random(100)}%`);
});

updates.hear(/^(?:вики|wiki|википедия|что такое|кто такой|расскажи о)\s?(.*)?$/i, async (message) => {
	if (!message.$match[1]) return message.reply('введите запрос для поиска статьи в википедии!');

	search = message.$match[1];

	request.get({
		url: `https://ru.wikipedia.org//w/api.php?action=query&format=json&prop=extracts|info&indexpageids=1&titles=${encodeURI(search)}&utf8=1&exsentences=10&exintro=1&explaintext=1&inprop=url`,
		json: true
	}, (err, res, data) => {
		if (err || res.statusCode !== 200) {
			console.log(err)
			return message.reply('произошла ошибка, попробуйте позже!');
		} else {
			let datapageids = data.query.pageids[0]
			let datadata = data.query.pages[datapageids]
			let datadatad = datadata.extract
			let datalink = datadata.fullurl
			if (datapageids == -1) {
				return message.reply('ничего не найдено!');
			} else {
				return message.reply("\n" + ` • ${datadatad}\n\n 🌐 Подробнее: ${datalink}`);
			}
		}
	})
});

updates.hear(/^(?:новости|news|что там в мире|какие новости|расскажи новости о)\s?(.*)?$/i, async (message) => {
	var newstheme = {
		'армия': 'https://news.yandex.ru/army.rss',
		'авто': 'https://news.yandex.ru/auto.rss',
		'мир': 'https://news.yandex.ru/world.rss',
		'главное': 'https://news.yandex.ru/index.rss',
		'игры': 'https://news.yandex.ru/games.rss',
		'интернет': 'https://news.yandex.ru/internet.rss',
		'кино': 'https://news.yandex.ru/movies.rss',
		'музыка': 'https://news.yandex.ru/music.rss',
		'политика': 'https://news.yandex.ru/politics.rss',
		'наука': 'https://news.yandex.ru/science.rss',
		'экономика': 'https://news.yandex.ru/business.rss',
		'спорт': 'https://news.yandex.ru/sport.rss',
		'происшествия': 'https://news.yandex.ru/incident.rss',
		'космос': 'https://news.yandex.ru/cosmos.rss'
	}

	if (!message.$match[1]) {
		var newstheme = newstheme['главное']
	} else {
		var newstheme = newstheme[message.$match[1]]
	}

	request.get(newstheme, (err, res, data) => {
		if (err || res.statusCode !== 200) {
			console.log(err)
			return message.reply('произошла ошибка, попробуйте позже!');
		} else {
			parseString(data, (err, res) => {
				if (err) {
					return message.reply('произошла ошибка, попробуйте позже!');
				}
				
				// console.log(res.rss.channel[0].description)

				let response = res.rss.channel[0].item

				let news = "";
				for (let i = 0; i < 3; i++) {
					news += "📰 " + response[i].title + "\n" + " - " + response[i].description + "\n" + response[i].link + "\n";
				}

				return message.reply("\n" + decodeEntities(news))
				// console.log(JSON.stringify(res))
			})
		}
	});
});

updates.hear(/^(?:погода|какая погода в городе|что там по погоде в городе)\s?(.*)?$/i, async (message) => {
	if (!message.$match[1]) return message.reply('введите город, или населенный пункт, в котором вы хотите узнать погоду. Например, погода Москва');

	city = message.$match[1];

	weather.getWeather(city, (err, data) => {
		if (err) {
			return message.reply(err)
		} else {
			return message.reply(`погода в городе/нас. пункте ${city}
				📌 Координаты: ${data.latitude}, ${data.longitude} 
				🌍 Текущая погода:
				💬 ${data.currently.summary}
				📍 Температура: ${data.currently.temperature} °C
				💧 Влажность: ${data.currently.humidity * 100}%
				📐 Давление: ${data.currently.pressure} бар
				💨 Скорость ветра: ${data.currently.windSpeed} m/s
				👀 Видимость: ${data.currently.visibility} км`)
		}
	})
});

updates.hear(/^(?:анекдот|расскажи анекдот)$/i, async (message) => {
	message.user.foolder += 1;
		let filter = (text) => { 
			text = text.replace('&quot;', '"');
			text = text.replace('!&quot;', '"');
			text = text.replace('?&quot;', '"');
			text = text.replace(/(&quot;)/ig, '"');
			return text;
		}

    let anek = await getAnek();
    await message.reply(`держи:\n ${filter(anek)}\n\nПонравилось? Напиши команду "Анекдот" ещё раз)`);

function getAnek() {
    return rq('https://www.anekdot.ru/random/anekdot/').then(body => {
        		let res = body.match(/(?:<div class="text">([^]+)<\/div>)/i);
        		res = res[0].split('</div>');
        		return res[0].split(`<div class="text">`).join('').split('<br>').join('\n');
        	});
   
	}
});

updates.hear(/^(?:сохра)$/i, async (message) => {
    // Получаем стену паблика
    let { items } = await vkuser.api.wall.get({
        owner_id: -168329343,
        offset: 1,
        count: 200
    });
    // Выбираем случайный пост
    let item = utils.pick(items);
    // Выбираем именно первое изображение из поста
	item = item.attachments[0].photo;
	// Отправляем результат
	try {
		await message.send({
			attachment: "photo" + item.owner_id + "_" + item.id
		});
	} catch (error) {
		console.log(error)
		return message.reply('ошибка при выполнении команды. Попробуйте ещё раз.')
	}
});

updates.hear(/^(?:мем|мемы|мемчики)$/i, async (message) => {
    // Получаем стену рандомного паблика
    let { items } = await vkuser.api.wall.get({
        domain: utils.pick(["mudakoff", "chan4", "rzeki4"]),
        offset: 1,
        count: 200
    });
    // Выбираем случайный пост
    let item = utils.pick(items);
    // Выбираем именно первое изображение из поста
    item = item.attachments[0].photo;
	// Отправляем результат
	try {
		await message.send({
			attachment: "photo" + item.owner_id + "_" + item.id
		});
	} catch (error) {
		console.log(error)
		return message.reply('ошибка при выполнении команды. Попробуйте ещё раз.')
	}
});

updates.hear(/^(?:видео|видос|видосы|video|videos|поиск видео)\s?(.*)?$/i, async (message) => {
	if (!message.$match[1]) return message.reply("укажите запрос для поиска видео!")

    let { items } = await vkuser.api.video.search({
		q: message.$match[1],
		sort: 2,
		count: 10,
		adult: 0,
        offset: utils.random(10),
	});
	if (items.length > 0) {
		await message.reply("видео!", {
			attachment: items.map(e => `video${e.owner_id}_${e.id}`).join(',')
		});
	} else {
		return message.reply("ничего не нашлось!");
	}
});

updates.hear(/^(?:гифка|гифки|гиф|gif|gifs|поиск гифок)\s?(.*)?$/i, async (message) => {
	if (!message.$match[1]) return message.reply("укажите запрос для поиска гифок!")

	if (message.$match[1] === 'порно' || message.$match[1] === 'сиськи' || message.$match[1] === 'жопа' || message.$match[1] === 'хуй' || message.$match[1] === 'пизда') return message.reply("нельзя!")

    let { items } = await vkuser.api.docs.search({
        q: message.$match[1] + ".gif",
        offset: utils.random(10),
        count: 10
	});
	if (items.length > 0) {
		await message.reply("гифки!", {
			attachment: items.map(e => `doc${e.owner_id}_${e.id}`).join(',')
		});
	} else {
		return message.reply("ничего не нашлось!");
	}
});

updates.hear(/^(?:перформанс)$/i, async (message) => {
    // Получаем стену паблика
    let { items } = await vkuser.api.wall.get({
        owner_id: -42800749,
        offset: 1,
        count: 200
    });
    // Выбираем случайный пост
    let item = utils.pick(items);
    // Выбираем прикрепления
    atta = item.attachments
    // Получаем столько прикриплений, сколько найдено в посту (только фото)
	attachments = [];
	for (let i = 0; i < atta.length; i++) {
		atta[i] = item.attachments[i].photo;
		attachments.push("photo" + atta[i].owner_id + "_" + atta[i].id)
	}
	// Отправляем результат
	try {
		await Promise.all([
			message.send({
				attachment: attachments
			}),
		]);
	} catch (error) {
		console.log(error)
		return message.reply('ошибка при выполнении команды. Попробуйте ещё раз.')
	}
});

updates.hear(/^(?:музло)$/i, async (message) => {
    // Получаем стену паблика
    let { items } = await vkuser.api.wall.get({
        owner_id: -169113015,
        offset: 1,
        count: 200
    });
    // Выбираем случайный пост
	let item = utils.pick(items);
	atta = item.attachments
	attachments = [];
	for (let i = 0; i < atta.length; i++) {
		atta[i] = item.attachments[i].audio;
		attachments.push("audio" + atta[i].owner_id + "_" + atta[i].id)
	}
	// Отправляем результат
	try {
		await message.send({
			attachment: attachments
		});
	} catch (error) {
		console.log(error)
		return message.reply('ошибка при выполнении команды. Попробуйте ещё раз.')
	}
});

updates.hear(/^(?:рассылка)\s(.*)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.reply(`недостаточно прав.`);
	
	let mallings = await Malling.find();

	let truemallings = mallings.filter((x) => x.mute === false)

	let mallingsеtext1 = '💬 Уведомление\n\n'
	let mallingsеtext2 = '⚙ Данное сообщение является уведомлением (рассылкой), вы можете отписаться от рассылок, для этого используйте команду "уведомления выкл" в беседе или в лс с сообществом.\n\n'

	await truemallings.forEach(async conv => {
		try {
			await message.send({
				peer_id: conv.id,
				message: mallingsеtext1 + mallingsеtext2 + message.$match[1],
				attachment: message.attachments[0]
			});
		} catch (error) {
			console.log(error)
		}
	})

	return message.reply('рассылка выполнена.')
});

updates.hear(/^(?:exec)\s(.*)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.reply(`недостаточно прав.`);

	try {
		const result = eval(message.$match[1]);

		if(typeof(result) === 'string')
		{
			return message.reply(`string: ${result}`);
		} else if(typeof(result) === 'number')
		{
			return message.reply(`number: ${result}`);
		} else {
			return message.reply(`${typeof(result)}: ${JSON.stringify(result, null, '&#12288;\t')}`);
		}
	} catch (e) {
		console.error(e);
		return message.reply(`ошибка:
		${e.toString()}`);
	}
});

updates.hear(/^(?:список игроков|игроки|players|users)\s([0-9]+)\s([0-9]+)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.send(`недостаточно прав.`);

	let value1 = (Number(message.$match[1]) - 1);
	let value2 = Number(message.$match[2]);

	let setalluserss = [];
	let users = await User.find();

	for (let i = 0; i < users.length; i += 1) {
		setalluserss.push({ id: users[i].id, uid: users[i].uid, bank: users[i].bank, rating: users[i].rating, tag: users[i].tag, lvl: users[i].lvl });
	}

	await message.reply(`список игроков по выборке:
	
	${
		setalluserss
		.sort((a, b) => a.uid - b.uid)
		.slice(value1, value2)
		.map((x, i) => `@id${x.id} (${x.tag}) — ID ${x.uid} | 👑 ${utils.spaces(x.rating)} | $${utils.formatNumber(x.bank)} | Lvl ${utils.spaces(x.lvl)}`)
		.join("\n")
	}`, {disable_mentions: 1});
});

updates.hear(/^(?:список бесед|беседы|чаты|chats)\s([0-9]+)\s([0-9]+)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.send(`недостаточно прав.`);

	let value1 = (Number(message.$match[1])) - 1;
	let value2 = Number(message.$match[2]);

	let setallchatss = [];
	let chats = await Chat.find();

	for (let i = 0; i < chats.length; i += 1) {
		setallchatss.push({ id: chats[i].id, cid: chats[i].cid, gamemode: chats[i].gamemode });
	}

	await message.reply(`список бесед по выборке:
	
	${
		setallchatss
		.sort((a, b) => a.сid - b.сid)
		.slice(value1, value2)
		.map((x) => `CID ${x.cid} - ID ${x.id} | Гм ${x.gamemode}`)
		.join("\n")
	}`);
});

updates.hear(/^(?:все игроки|allplayers|allusers|all players|all users)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.send(`недостаточно прав.`);

	await message.reply("список всех игроков:\n\n" + allusers);
});

updates.hear(/^(?:!ботрестарт)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return;

	let Alllobbie = [];
	let lobbies = await Lobbi.find();

	for (let i = 0; i < lobbies.length; i += 1) {
		Alllobbie.push({ id: lobbies[i].id });
	}

	if (Alllobbie.length > 0) {
		for (let i = 0; i < Alllobbie.length; i += 1) {
			lobbieid = Alllobbie[i].id

			let lobbie = await Lobbi.findOne({ id: lobbieid })

			racer1id = lobbie.players[0]
		
			let racer1 = await User.findOne({ id: racer1id });

			await racer1.inc("balance", lobbie.bank1);
			await lobbie.remove();
		}
		await message.reply(`лобби очищены. Ставки возвращены игрокам. Бот перезапускается...`);
	} else {
		await message.reply(`лобби не обнаружены. Бот перезапускается...`);
	}

	process.exit(-1);
});

//Добавление ключа в бд
updates.hear(/^(?:добавить в бд)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.send(`недостаточно прав.`);

	await Malling.updateMany({}, {$set: {mute: false}}, async function(err, result){
		if (err) {
			console.log(err);
			return message.reply("произошла ошибка.")
		}
		console.log(result);
		await message.reply("добавление нового ключа в бд выполнено.");
	});
});

//Удаление ключа из бд
updates.hear(/^(?:удалить из бд)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.send(`недостаточно прав.`);

	await User.updateMany({}, {$unset: {tbank: 1}}, async function(err, result){
		if (err) {
			console.log(err);
			return message.reply("произошла ошибка.")
		}
		console.log(result);
		await message.reply("удаление ключа из бд выполнено.");
	});
});

//Обновление ключа в бд
updates.hear(/^(?:обновить бд)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.send(`недостаточно прав.`);

	let Allusers = [];
	let users = await User.find();

	for (let i = 0; i < users.length; i += 1) {
		Allusers.push({ id: users[i].id, tag: users[i].tag });
	}

	Allusers.map(async (user) => {
        let balanceuser = await User.findOne({ id: user.id });
        await balanceuser.set("tag", "Игрок");
	});
	
	await message.reply("обновление ключа в бд выполнено.");
});

updates.hear(/^(?:включить все уведомления)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.send(`недостаточно прав.`);

	let Allmallings = [];
	let mallings = await Malling.find();

	for (let i = 0; i < mallings.length; i += 1) {
		Allmallings.push({ id: mallings[i].id, mute: mallings[i].mute });
	}

	Allmallings.map(async (malling) => {
        let mutemalling = await Malling.findOne({ id: malling.id });
		await mutemalling.set("mute", false);
		await mutemalling.save();
	});
	
	await message.reply("получение уведомления для всех диалогов включено.");
});

updates.hear(/^(?:выключить все уведомления)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.send(`недостаточно прав.`);

	let Allmallings = [];
	let mallings = await Malling.find();

	for (let i = 0; i < mallings.length; i += 1) {
		Allmallings.push({ id: mallings[i].id, mute: mallings[i].mute });
	}

	Allmallings.map(async (malling) => {
        let mutemalling = await Malling.findOne({ id: malling.id });
		await mutemalling.set("mute", true);
		await mutemalling.save();
	});
	
	await message.reply("получение уведомления для всех диалогов выключено.");
});

updates.hear(/^(?:анимация)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.reply(`недостаточно прав.`);

	await message.send(`1`);
});

updates.hear(/^(?:кто в поиске в группе)\s([0-9]+)/i, async (message) => {

	if(admins.indexOf(message.senderId) === -1) return message.reply(`недостаточно прав.`);

	if(!message.$match[1]) return message.reply(`введите ID/VK ID целевой группы`);

	try {
		vkuser.api.groups.getMembers({
			group_id: message.$match[1],
			offset: utils.random(4000),
			count: 1000,
			fields: "online, sex, bdate, city, country, relation"
		}).then(async function (response) {
			let text = `список случайных участников группы https://vk.com/club${message.$match[1]} с указанным с/п "в активном поиске":\n\n`;
			await response.items.map(e => {
				if(e.id < 1) return;
				if(e.relation == 6) text += `*id${e.id} (${e.first_name} ${e.last_name}) - ${e.sex == 2 ? 'М' : 'Ж'} ${e.country == undefined ? '' : e.country.title} ${e.city == undefined ? '' : e.city.title} ${e.bdate == undefined ? '' : e.bdate}\n`;
				})
			return message.reply(text, {disable_mentions: 1})
		})
	} catch (APIError) {
		console.log(APIError)
		return message.reply('не удалось получить участников!')
	}
});

updates.hear(/^(?:кто в поиске в группе м)\s([0-9]+)/i, async (message) => {

	if(admins.indexOf(message.senderId) === -1) return message.reply(`недостаточно прав.`);

	if(!message.$match[1]) return message.reply(`введите ID/VK ID целевой группы`);

	try {
		vkuser.api.groups.getMembers({
			group_id: message.$match[1],
			offset: utils.random(4000),
			count: 1000,
			fields: "online, sex, bdate, city, country, relation"
		}).then(async function (response) {
			let text = `список случайных участников группы https://vk.com/club${message.$match[1]} с указанным с/п "в активном поиске" с указанным полом м:\n\n`;
			await response.items.map(e => {
				if(e.id < 1) return;
				if(e.relation == 6 && e.sex == 2) text += `*id${e.id} (${e.first_name} ${e.last_name}) - ${e.sex == 2 ? 'М' : 'Ж'} ${e.country == undefined ? '' : e.country.title} ${e.city == undefined ? '' : e.city.title} ${e.bdate == undefined ? '' : e.bdate}\n`;
				})
			return message.reply(text, {disable_mentions: 1})
		})
	} catch (APIError) {
		console.log(APIError)
		return message.reply('не удалось получить участников!')
	}
});

updates.hear(/^(?:кто в поиске в группе ж)\s([0-9]+)/i, async (message) => {

	if(admins.indexOf(message.senderId) === -1) return message.reply(`недостаточно прав.`);

	if(!message.$match[1]) return message.reply(`введите ID/VK ID целевой группы`);

	try {
		vkuser.api.groups.getMembers({
			group_id: message.$match[1],
			offset: utils.random(4000),
			count: 1000,
			fields: "online, sex, bdate, city, country, relation"
		}).then(async function (response) {
			let text = `список случайных участников группы https://vk.com/club${message.$match[1]} с указанным с/п "в активном поиске" с указанным полом ж:\n\n`;
			await response.items.map(e => {
				if(e.id < 1) return;
				if(e.relation == 6 && e.sex == 1) text += `*id${e.id} (${e.first_name} ${e.last_name}) - ${e.sex == 2 ? 'М' : 'Ж'} ${e.country == undefined ? '' : e.country.title} ${e.city == undefined ? '' : e.city.title} ${e.bdate == undefined ? '' : e.bdate}\n`;
				})
			return message.reply(text, {disable_mentions: 1})
		})
	} catch (APIError) {
		console.log(APIError)
		return message.reply('не удалось получить участников!')
	}
});

updates.hear(/^(?:кто в поиске в группе онлайн)\s([0-9]+)/i, async (message) => {

	if(admins.indexOf(message.senderId) === -1) return message.reply(`недостаточно прав.`);

	if(!message.$match[1]) return message.reply(`введите ID/VK ID целевой группы`);

	try {
		vkuser.api.groups.getMembers({
			group_id: message.$match[1],
			offset: utils.random(4000),
			count: 1000,
			fields: "online, sex, bdate, city, country, relation"
		}).then(async function (response) {
			let text = `список случайных участников группы https://vk.com/club${message.$match[1]} с указанным с/п "в активном поиске", которые сейчас онлайн:\n\n`;
			await response.items.map(e => {
				if(e.id < 1) return;
				if(e.relation == 6 && e.online == 1) text += `*id${e.id} (${e.first_name} ${e.last_name}) - ${e.sex == 2 ? 'М' : 'Ж'} ${e.country == undefined ? '' : e.country.title} ${e.city == undefined ? '' : e.city.title} ${e.bdate == undefined ? '' : e.bdate}\n`;
				})
			return message.reply(text, {disable_mentions: 1})
		})
	} catch (APIError) {
		console.log(APIError)
		return message.reply('не удалось получить участников!')
	}
});

updates.hear(/^(?:кто в поиске в группе онлайн м)\s([0-9]+)/i, async (message) => {

	if(admins.indexOf(message.senderId) === -1) return message.reply(`недостаточно прав.`);

	if(!message.$match[1]) return message.reply(`введите ID/VK ID целевой группы`);

	try {
		vkuser.api.groups.getMembers({
			group_id: message.$match[1],
			offset: utils.random(4000),
			count: 1000,
			fields: "online, sex, bdate, city, country, relation"
		}).then(async function (response) {
			let text = `список случайных участников группы https://vk.com/club${message.$match[1]} с указанным с/п "в активном поиске", которые сейчас онлайн, с указанным полом м:\n\n`;
			await response.items.map(e => {
				if(e.id < 1) return;
				if(e.relation == 6 && e.online == 1  && e.sex == 2) text += `*id${e.id} (${e.first_name} ${e.last_name}) - ${e.sex == 2 ? 'М' : 'Ж'} ${e.country == undefined ? '' : e.country.title} ${e.city == undefined ? '' : e.city.title} ${e.bdate == undefined ? '' : e.bdate}\n`;
				})
			return message.reply(text, {disable_mentions: 1})
		})
	} catch (APIError) {
		console.log(APIError)
		return message.reply('не удалось получить участников!')
	}
});

updates.hear(/^(?:кто в поиске в группе онлайн ж)\s([0-9]+)/i, async (message) => {

	if(admins.indexOf(message.senderId) === -1) return message.reply(`недостаточно прав.`);

	if(!message.$match[1]) return message.reply(`введите ID/VK ID целевой группы`);

	try {
		vkuser.api.groups.getMembers({
			group_id: message.$match[1],
			offset: utils.random(4000),
			count: 1000,
			fields: "online, sex, bdate, city, country, relation"
		}).then(async function (response) {
			let text = `список случайных участников группы https://vk.com/club${message.$match[1]} с указанным с/п "в активном поиске", которые сейчас онлайн, с указанным полом ж:\n\n`;
			await response.items.map(e => {
				if(e.id < 1) return;
				if(e.relation == 6 && e.online == 1 && e.sex == 1) text += `*id${e.id} (${e.first_name} ${e.last_name}) - ${e.sex == 2 ? 'М' : 'Ж'} ${e.country == undefined ? '' : e.country.title} ${e.city == undefined ? '' : e.city.title} ${e.bdate == undefined ? '' : e.bdate}\n`;
				})
			return message.reply(text, {disable_mentions: 1})
		})
	} catch (APIError) {
		console.log(APIError)
		return message.reply('не удалось получить участников!')
	}
});

updates.hear(/^(?:телефоны)\s([0-9]+)/i, async (message) => {

	if(admins.indexOf(message.senderId) === -1) return message.reply(`недостаточно прав.`);

	if(!message.$match[1]) return message.reply(`введите ID/VK ID целевой группы`);

	try {
		vkuser.api.groups.getMembers({
			group_id: message.$match[1],
			offset: utils.random(1000),
			count: 1000,
			fields: "online, sex, bdate, city, country, contacts"
		}).then(async function (response) {
			let text = `список случайных участников группы https://vk.com/club${message.$match[1]} с номерами:\n\n`;
			await response.items.map(e => {
				if(e.id < 1) return;
				if(e.mobile_phone !== undefined) text += `*id${e.id} (${e.first_name} ${e.last_name}) - ${e.sex == 2 ? 'М' : 'Ж'} ${e.country == undefined ? '' : e.country.title} ${e.city == undefined ? '' : e.city.title} ${e.bdate == undefined ? '' : e.bdate} Номер: ${e.mobile_phone}\n`;
				})
			return message.reply(text, {disable_mentions: 1})
		})
	} catch (APIError) {
		console.log(APIError)
		return message.reply('не удалось получить участников!')
	}
});

updates.hear(/^(?:сериал|придумай название|название)$/i, async (message) => {

	let name1 = ["невероятные", "опасные", "безумные", "смешные", "унылые", "алкогольные", "правдивые", "ужасающие", "зверские", "эротические", "похотливые", "великолепные", "страшные", "фантастические", "забытые", "лживые", "пикантные", "преступные", "ламповые", "старинные", "затяжные", "подлые", "сверхестественные", "любовные", "четкие"]
	let name2 = ["импровизации", "истории", "повести", "факты", "шутки", "приключения", "похождения", "эксперименты", "преступления", "споры", "отношения", "полеты", "исчезновения", "провалы", "опыты", "разговоры", "шедевры", "страшилки", "ужасы", "умозаключения", "вопросы", "ответы", "нападения", "тайны", "попытки", "песни", "пакости", "несчастья", "следы", "дела", "проклятия"]
	let name3 = ["одного плохиша", "опытного сантехника", "Свердловска", "моей первой любви", "вчерашнего вечера", "завтрашнего дня", "моих друзей", "против здравого смысла", "и всё, что мы о них знаем", "и большие бабки", "или жизнь в России", "восставших коммунистов", "в поисках истины", "одного паренька", "одной девушки", "одноклассников", "четырех пацанов", "ежей", "искуственного интеллекта", "гения", "таланта", "на кухне", "на перепутье двух дорог"]

	let sname1 = utils.pick(name1);
	let sname2 = utils.pick(name2);
	let sname3 = utils.pick(name3);

	let sname4 = utils.pick(name1);
	let sname5 = utils.pick(name2);
	let sname6 = utils.pick(name3);

	let sname7 = utils.pick(name1);
	let sname8 = utils.pick(name2);
	let sname9 = utils.pick(name3);

	let sname10 = utils.pick(name1);
	let sname11 = utils.pick(name2);
	let sname12 = utils.pick(name3);

	let sname13 = utils.pick(name1);
	let sname14 = utils.pick(name2);
	let sname15 = utils.pick(name3);

	let sname16 = utils.pick(name1);
	let sname17 = utils.pick(name2);
	let sname18 = utils.pick(name3);

	return message.reply(`сборка случайных названий для твоего сериала:\n\n${sname1} ${sname2} ${sname3}\n${sname4} ${sname5} ${sname6}\n${sname7} ${sname8} ${sname9}\n${sname10} ${sname11} ${sname12}\n${sname13} ${sname14} ${sname15}\n${sname16} ${sname17} ${sname18}`);

});

updates.hear(/^(?:серия фильмов)$/i, async (message) => {

	let name1 = ["невероятные", "опасные", "безумные", "смешные", "унылые", "алкогольные", "правдивые", "ужасающие", "зверские", "эротические", "похотливые", "великолепные", "страшные", "фантастические", "забытые", "лживые", "пикантные", "преступные", "ламповые", "старинные", "затяжные", "подлые", "сверхестественные", "любовные", "четкие"]
	let name2 = ["импровизации", "истории", "повести", "факты", "шутки", "приключения", "похождения", "эксперименты", "преступления", "споры", "отношения", "полеты", "исчезновения", "провалы", "опыты", "разговоры", "шедевры", "страшилки", "ужасы", "умозаключения", "вопросы", "ответы", "нападения", "тайны", "попытки", "песни", "пакости", "несчастья", "следы", "дела", "проклятия"]
	let name3 = ["одного плохиша", "опытного сантехника", "Свердловска", "моей первой любви", "вчерашнего вечера", "завтрашнего дня", "моих друзей", "против здравого смысла", "и всё, что мы о них знаем", "и большие бабки", "или жизнь в России", "восставших коммунистов", "в поисках истины", "одного паренька", "одной девушки", "одноклассников", "четырех пацанов", "ежей", "искуственного интеллекта", "гения", "таланта", "на кухне", "на перепутье двух дорог"]

	let nm1 = ["начало", "с чего всё начиналось", " исход", "пролог", "первая кровь", "знакомство"]
	let nm2 = ["перезагрузка", "реванш", "воссоединение", "возвращение", "две крепости", "воскрешение", "месть"]
	let nm3 = ["революция", "кульминация", "возвращение короля", "ответный удар"]
	let nm4 = ["темные времена", "выжить любой ценой"]
	let nm5 = ["новая надежда", "возрождение"]
	let nm6 = ["конец", "финал", "последний шаг", "эпилог"]

	// let nm1 = ["начало", "с чего всё начиналось", " исход", "пролог", "первая кровь", "знакомство", "фильм первый", "глава I", "эпизод I"]
	// let nm2 = ["перезагрузка", "реванш", "воссоединение", "возвращение", "две крепости", "воскрешение", "месть", "фильм второй", "глава II", "эпизод II"]
	// let nm3 = ["революция", "кульминация", "возвращение короля", "ответный удар", "фильм третий", "глава III", "эпизод III"]
	// let nm4 = ["темные времена", "фильм четвертый", "глава IV", "эпизод IV"]
	// let nm5 = ["новая надежда", "возрождение", "фильм пятый", "глава V", "эпизод V"]
	// let nm6 = ["конец", "финал", "последний шаг", "эпилог", "фильм шестой", "глава VI", "эпизод VI"]

	let snm1 = utils.pick(nm1);
	let snm2 = utils.pick(nm2);
	let snm3 = utils.pick(nm3);
	let snm4 = utils.pick(nm4);
	let snm5 = utils.pick(nm5);
	let snm6 = utils.pick(nm6);

	let sw1 = utils.random(1, 2);
	let sw2 = utils.random(1, 2);
	let sw3 = utils.random(1, 2);
	let sw4 = utils.random(1, 2);
	let sw5 = utils.random(1, 2);

	let sname1 = utils.pick(name1);
	let sname2 = utils.pick(name2);
	let sname3 = utils.pick(name3);

	let sname4 = utils.pick(name1);
	let sname5 = utils.pick(name2);
	let sname6 = utils.pick(name3);

	let sname7 = utils.pick(name1);
	let sname8 = utils.pick(name2);
	let sname9 = utils.pick(name3);

	let sname10 = utils.pick(name1);
	let sname11 = utils.pick(name2);
	let sname12 = utils.pick(name3);

	let sname13 = utils.pick(name1);
	let sname14 = utils.pick(name2);
	let sname15 = utils.pick(name3);

	let sname16 = utils.pick(name1);
	let sname17 = utils.pick(name2);
	let sname18 = utils.pick(name3);

	return message.reply(`серия фильмов, которая была снята случайно:\n\n${sname1} ${sname2} ${sname3}: ${snm1}\n${sname1} ${sname2} ${sname3} 2: ${sw1 == 1 ? `${snm2}` : `${sname4} ${sname5} ${sname6}`}\n${sname1} ${sname2} ${sname3} 3: ${sw2 == 1 ? `${snm3}` : `${sname7} ${sname8} ${sname9}`}\n${sname1} ${sname2} ${sname3} 4: ${sw3 == 1 ? `${snm4}` : `${sname10} ${sname11} ${sname12}`}\n${sname1} ${sname2} ${sname3} 5: ${sw4 == 1 ? `${snm5}` : `${sname13} ${sname14} ${sname15}`}\n${sname1} ${sname2} ${sname3} 6: ${sw5 == 1 ? `${snm6}` : `${sname16} ${sname17} ${sname18}`}`);

});

updates.hear(/^(?:добавить в базу|обучение)\s?([^]+)(?:\\)([^]+)?$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.reply(`недостаточно прав.`);

	const first = message.$match[1];
	const second = message.$match[2];
	if (!first) {
		return message.reply("введите вопрос и ответ, которые хотите внести в базу ответов. Используйте команду в формате \"обучение [вопрос]\\[ответ]\" ");
	}
	if (!second) {
		return message.reply("введите вопрос и ответ, которые хотите внести в базу ответов. Используйте команду в формате \"обучение [вопрос]\\[ответ]\" ");
	}
	let otvet = `\n${first}\\${second}\\1`
	fs.appendFile("answer_database.bin", otvet, function(error){
		if(error) throw error; // если возникла ошибка
					 
		console.log("Запись файла завершена.");
		return message.reply("новый вопрос\\ответ внесены в файл базы. Необходимо обновить загруженную в ОЗУ базу ответов для применения изменений. Для этого используйте команду \"обновить базу\"");
	});
});

updates.hear(/^(?:обновить базу)$/i, async (message) => {
	if(admins.indexOf(message.senderId) === -1) return message.reply(`недостаточно прав.`);

	dbanswers = await loadAnswerDB('answer_database.bin')
	console.log('База ответов успешно обновлена. Найдено ' + dbanswers.length + ' ответов!')
	
	return message.reply("база ответов в ОЗУ обновлена.");
});

updates.hear(/^(?:ответы все)\s(.*)$/i, async (message) => {
	const findanswers = message.$match[1];

	var min_matchs = {distance: 9999, answers: []};
	if (findanswers.length > 99) {
		return message.reply('слишком много символов, чтобы обработать ответ');
	}
	dbanswers.forEach(answer => {
		var distance = Levenshtein(answer.q, findanswers, {insertion_cost: 1, deletion_cost: 1, substitution_cost: 1});
		if (distance < min_matchs.distance) {
			min_matchs = {distance: distance, answers: [answer.answer]}
		} else if (distance == min_matchs.distance) {
			min_matchs.answers.push(answer.answer);
		}
	});
	if (min_matchs.answers[0] == '') return;
	if(min_matchs.distance > 5) {
		return message.reply("не найдено ответов.");
	}
	console.log('Найдено ' + min_matchs.answers.length + ' ответов в DB!')
	let allanswers = [];
	for (let i = 0; i < min_matchs.answers.length; i++) {
		allanswers += `Ответ ${i + 1}: ${min_matchs.answers[i]}\n`
	}
	return message.reply(`все ответы, найденные в базе ответов на вопрос <<${findanswers}>>:\n${allanswers}`);
});

updates.hear(/./i, async (message) => {
	if(message.isChat && message.chat.gamemode) {
		if (message.hasForwards && message.hasText) {
			for (let i = 0; i < message.forwards.length; i++) {
				if (message.forwards[i].senderId === -BotGroupId) {
					var min_matchs = {distance: 9999, answers: []};
					if (message.text.length > 99) {
						return message.reply('слишком много символов, чтобы обработать сообщение');
					}
					await message.setActivity({type: 'typing', peer_id: message.peerId});
					dbanswers.forEach(answer => {
						var distance = Levenshtein(answer.q, message.text, {insertion_cost: 1, deletion_cost: 1, substitution_cost: 1});
						if (distance < min_matchs.distance) {
							min_matchs = {distance: distance, answers: [answer.answer]}
						} else if (distance == min_matchs.distance) {
							min_matchs.answers.push(answer.answer);
						}
					});
					if (min_matchs.answers[0] == '') return;
					let answ = utils.pick(min_matchs.answers)
					console.log('Найдено ' + min_matchs.answers.length + ' ответов в DB!')
					
					// let timesleep = utils.random(1000, 5000);
				
					// sleep(timesleep);
				
					// console.log(`[${unixStamp(getUnix())}] ${message.isChat ? "chat"+message.chatId+", @id"+message.senderId : "@id"+message.senderId} [${message.text}]\\[${answ}]`);
				
					return message.reply(answ.lowercapitalize());
				}
			}
		} else if (message.hasReplyMessage && message.hasText && message.replyMessage.senderId === -BotGroupId) {
			var min_matchs = {distance: 9999, answers: []};
			if (message.text.length > 99) {
				return message.reply('слишком много символов, чтобы обработать сообщение');
			}
			await message.setActivity({type: 'typing', peer_id: message.peerId});
			dbanswers.forEach(answer => {
				var distance = Levenshtein(answer.q, message.text, {insertion_cost: 1, deletion_cost: 1, substitution_cost: 1});
				if (distance < min_matchs.distance) {
					min_matchs = {distance: distance, answers: [answer.answer]}
				} else if (distance == min_matchs.distance) {
					min_matchs.answers.push(answer.answer);
				}
			});
			if (min_matchs.answers[0] == '') return;
			let answ = utils.pick(min_matchs.answers)
			console.log('Найдено ' + min_matchs.answers.length + ' ответов в DB!')
			
			// let timesleep = utils.random(1000, 5000);
		
			// sleep(timesleep);
		
			// console.log(`[${unixStamp(getUnix())}] ${message.isChat ? "chat"+message.chatId+", @id"+message.senderId : "@id"+message.senderId} [${message.text}]\\[${answ}]`);
		
			return message.reply(answ.lowercapitalize());
		} else {
			return;
		}
	} else if (!message.isChat) {
		var min_matchs = {distance: 9999, answers: []};
		if (message.text.length > 99) {
			return message.reply('слишком много символов, чтобы обработать сообщение');
		}
		await message.setActivity({type: 'typing', peer_id: message.peerId});
		dbanswers.forEach(answer => {
			var distance = Levenshtein(answer.q, message.text, {insertion_cost: 1, deletion_cost: 1, substitution_cost: 1});
			if (distance < min_matchs.distance) {
				min_matchs = {distance: distance, answers: [answer.answer]}
			} else if (distance == min_matchs.distance) {
				min_matchs.answers.push(answer.answer);
			}
		});
		if (min_matchs.answers[0] == '') return;
		let answ = utils.pick(min_matchs.answers)
		console.log('Найдено ' + min_matchs.answers.length + ' ответов в DB!')
	
		return message.reply(answ);
	} else {
		var min_matchs = {distance: 9999, answers: []};
		if (message.text.length > 99) {
			return message.reply('слишком много символов, чтобы обработать сообщение');
		}
		await message.setActivity({type: 'typing', peer_id: message.peerId});
		dbanswers.forEach(answer => {
			var distance = Levenshtein(answer.q, message.text, {insertion_cost: 1, deletion_cost: 1, substitution_cost: 1});
			if (distance < min_matchs.distance) {
				min_matchs = {distance: distance, answers: [answer.answer]}
			} else if (distance == min_matchs.distance) {
				min_matchs.answers.push(answer.answer);
			}
		});
		if (min_matchs.answers[0] == '') return;
		let answ = utils.pick(min_matchs.answers)
		console.log('Найдено ' + min_matchs.answers.length + ' ответов в DB!')
		
		// let timesleep = utils.random(1000, 5000);
	
		// sleep(timesleep);
	
		// console.log(`[${unixStamp(getUnix())}] ${message.isChat ? "chat"+message.chatId+", @id"+message.senderId : "@id"+message.senderId} [${message.text}]\\[${answ}]`);
	
		return message.reply(answ.lowercapitalize());
	}
});

updates.setHearFallbackHandler(async (message) => {
	if(!message.isChat) {
		await message.reply("такой команды не существует. Напиши мне <<помощь>>, чтобы узнать мои команды.");
	}
});

//Прототипы для изменения значений
User.prototype.inc = function(field, value) {
	this[field] += value;
	return this.save();
}

User.prototype.dec = function(field, value) {
	this[field] -= value;
	return this.save();
}

User.prototype.set = function(field, value) {
	this[field] = value;
	return this.save();
}

Timer.prototype.inc = function(field, value) {
	this[field] += value;
	return this.save();
}

Timer.prototype.dec = function(field, value) {
	this[field] -= value;
	return this.save();
}

Timer.prototype.set = function(field, value) {
	this[field] = value;
	return this.save();
}

Lobbi.prototype.inc = function(field, value) {
	this[field] += value;
	return this.save();
}

Lobbi.prototype.dec = function(field, value) {
	this[field] -= value;
	return this.save();
}

Lobbi.prototype.set = function(field, value) {
	this[field] = value;
	return this.save();
}

String.prototype.lowercapitalize = function() {
    return this.replace(/(?:^)\S/g, function(a) {
            return a.toLowerCase();
    	});
};

String.prototype.capitalize = function() {
    return this.replace(/(?:^)\S/g, function(a) {
            return a.toUpperCase();
    	});
};

//Функции
function sleep(millis) {
    var t = (new Date()).getTime();
    var i = 0;
    while (((new Date()).getTime() - t) < millis) {
        i++;
    }
}

function getUnix() {
	return Date.now();
}

function unixStamp(stamp) {
	let date = new Date(stamp),
		year = date.getFullYear(),
		month = date.getMonth() + 1,
		day = date.getDate(),
		hour = date.getHours() < 10 ? "0"+date.getHours() : date.getHours(),
		mins = date.getMinutes() < 10 ? "0"+date.getMinutes() : date.getMinutes(),
		secs = date.getSeconds() < 10 ? "0"+date.getSeconds() : date.getSeconds();

	return `${day}.${month}.${year}, ${hour}:${mins}:${secs}`;
}

function unixStampLeft(stamp) {
	stamp = stamp / 1000;

	let s = stamp % 60;
	stamp = ( stamp - s ) / 60;

	let m = stamp % 60;
	stamp = ( stamp - m ) / 60;

	let	h = ( stamp ) % 24;
	let	d = ( stamp - h ) / 24;

	let text = ``;

	if(d > 0) text += Math.floor(d) + " д. ";
	if(h > 0) text += Math.floor(h) + " ч. ";
	if(m > 0) text += Math.floor(m) + " мин. ";
	if(s > 0) text += Math.floor(s) + " с.";

	return text;
}

function generateKeyboard(array) {
	let kb = [];
	if(array.length > 40) return false;

	for (let i = 0; i < 10; i += 1) {
		if(!array.slice(i * 4, i * 4 + 4)[0]) break;
		kb.push(array.slice(i * 4, i * 4 + 4));
	}

	kb.map((arr) => {
		arr.map((button, i) => {
			arr[i] = Keyboard.textButton({ label: button });
		});
	});

	return Keyboard.keyboard(kb);
}

function decodeEntities(encodedString) {
    var translate_re = /&(nbsp|amp|quot|lt|gt);/g;
    var translate = {
        "nbsp":" ",
        "amp" : "&",
        "quot": "\"",
        "lt"  : "<",
        "gt"  : ">"
    };
    return encodedString.replace(translate_re, function(match, entity) {
        return translate[entity];
    }).replace(/&#(\d+);/gi, function(match, numStr) {
        var num = parseInt(numStr, 10);
        return String.fromCharCode(num);
    });
}

async function leaderBoardtoBank() {
	let lb = [];
	let users = await User.find({ bantop: false });

	for (let i = 0; i < users.length; i += 1) {
		lb.push({ id: users[i].id, bank: users[i].bank + users[i].balance, rating: users[i].rating, tag: users[i].tag, mentiontop: users[i].mentiontop, lvl: users[i].lvl });
	}

	return lb
	.sort((a, b) => b.bank - a.bank)
	.slice(0, 10)
	.map((x, i) => `${i === 9 ? "&#128287;" : `${i + 1}&#8419;`} ${x.mentiontop ? `@id${x.id} (${x.tag})` : `${x.tag}`} — $${utils.formatNumber(x.bank)} | 👑 ${utils.spaces(x.rating)} | Lvl ${utils.spaces(x.lvl)}`)
	.join("\n")
}

async function leaderBoardtoLevel() {
	let lb = [];
	let users = await User.find({ bantop: false });

	for (let i = 0; i < users.length; i += 1) {
		lb.push({ id: users[i].id, bank: users[i].bank + users[i].balance, rating: users[i].rating, tag: users[i].tag, mentiontop: users[i].mentiontop, lvl: users[i].lvl });
	}


	return lb
	.sort((a, b) => b.lvl - a.lvl)
	.slice(0, 10)
	.map((x, i) => `${i === 9 ? "&#128287;" : `${i + 1}&#8419;`} ${x.mentiontop ? `@id${x.id} (${x.tag})` : `${x.tag}`} — Lvl ${utils.spaces(x.lvl)} | 👑 ${utils.spaces(x.rating)} | $${utils.formatNumber(x.bank)}`)
	.join("\n")
}

async function leaderBoard() {
	let lb = [];
	let users = await User.find({ bantop: false });

	for (let i = 0; i < users.length; i += 1) {
		lb.push({ id: users[i].id, bank: users[i].bank + users[i].balance, rating: users[i].rating, tag: users[i].tag, mentiontop: users[i].mentiontop, lvl: users[i].lvl });
	}


	return lb
	.sort((a, b) => b.rating - a.rating)
	.slice(0, 10)
	.map((x, i) => `${i === 9 ? "&#128287;" : `${i + 1}&#8419;`} ${x.mentiontop ? `@id${x.id} (${x.tag})` : `${x.tag}`} — 👑 ${utils.spaces(x.rating)} | Lvl ${utils.spaces(x.lvl)} | $${utils.formatNumber(x.bank)}`)
	.join("\n")
}

async function allUsers() {
	let alluserss = [];
	let users = await User.find();

	for (let i = 0; i < users.length; i += 1) {
		alluserss.push({ id: users[i].id, uid: users[i].uid, balance: users[i].balance, rating: users[i].rating, tag: users[i].tag });
	}


	return alluserss
	.sort((a, b) => a.uid - b.uid)
	.slice(0, alluserss.length)
	.map((x, i) => `@id${x.id} (${x.tag}) — ${x.uid} | 👑${utils.spaces(x.rating)} | $${utils.formatNumber(x.balance)}`)
	.join("\n")
}

async function allTimers() {
	timers = await Timer.findOne();

	if (!timers) {
		let course = utils.random(5000, 6000);
		let coursetoplivo = utils.random(400, 800);
		let globaltoplivo = utils.random(800, 2000);
	
		let $timers = new Timer({
			course: course,
			tcourse: getUnix() + 600000,
			tcourseupdated: getUnix(),
			coursetoplivo: coursetoplivo,
			tcoursetoplivo: getUnix() + 600000,
			tcoursetoplivoupdated: getUnix(),
			globaltoplivo: globaltoplivo,
			tglobaltoplivo: getUnix() + 600000,
			tglobaltoplivoupdated: getUnix()
		});
		await $timers.save();
		console.info(`[${unixStamp(getUnix())} Timers created`);
	}

	if(timers.tcourse <= getUnix()) {
		let course = utils.random(5000, 6000);
		timers.course = course;
		timers.tcourse = getUnix() + 600000;
		timers.tcourseupdated = getUnix();
	}

	if(timers.tcoursetoplivo <= getUnix()) {
		let coursetoplivo = utils.random(400, 800);
		timers.coursetoplivo = coursetoplivo;
		timers.tcoursetoplivo = getUnix() + 600000;
		timers.tcoursetoplivoupdated = getUnix();
	}

	if(timers.tglobaltoplivo <= getUnix()) {
		let globaltoplivo = utils.random(800, 2000);
		timers.globaltoplivo = globaltoplivo;
		timers.tglobaltoplivo = getUnix() + 600000;
		timers.tglobaltoplivoupdated = getUnix();
	}

	await timers.save();
}

async function loadUnknownDB(file) {
    var fileStream = fs.createReadStream(file),
        rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        }),
        unknowns = [];
    
    for await (var line of rl) {
        var spl = line.split('\\')
        unknowns.push({q: spl[0], unknowns: spl[1]})
    }

    return unknowns;
}

async function loadAnswerDB(file) {
    var fileStream = fs.createReadStream(file),
        rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        }),
        answers = [];
    
    for await (var line of rl) {
        var spl = line.split('\\')
        answers.push({q: spl[0], answer: spl[1]})
    }

    return answers;
}

setInterval(async () => {
	let Allusers = [];
	let users = await User.find();

	for (let i = 0; i < users.length; i += 1) {
		Allusers.push({ id: users[i].id, bank: users[i].bank, lvl: users[i].lvl });
	}

	Allusers.map(async (user) => {
		if(user.bank && user.bank < 1000000000) {
			let bankuser = await User.findOne({ id: user.id });
			if (user.lvl < 100) {
				let bankusersumma = Math.floor((user.bank * 1)/100);
				await bankuser.inc("bank", bankusersumma);
	
				try {
					await vk.api.call("messages.send", {
						user_id: user.id,
						message: `💸 На ваш банковский счет пришёл 1% на сумму ${utils.spaces(bankusersumma)}$.\n💳 В банке: ${utils.spaces(user.bank)}$`,
						random_id: Math.random()
					});
				} catch (error) {
					console.log(error)
				}
			}
			if (user.lvl >= 100 && user.lvl < 200) {
				let bankusersumma = Math.floor((user.bank * 2)/100);
				await bankuser.inc("bank", bankusersumma);
	
				try {
					await vk.api.call("messages.send", {
						user_id: user.id,
						message: `💸 На ваш банковский счет пришли 2% на сумму ${utils.spaces(bankusersumma)}$.\n💳 В банке: ${utils.spaces(user.bank)}$`,
						random_id: Math.random()
					});
				} catch (error) {
					console.log(error)
				}
			}
			if (user.lvl >= 200 && user.lvl < 300) {
				let bankusersumma = Math.floor((user.bank * 3)/100);
				await bankuser.inc("bank", bankusersumma);
	
				try {
					await vk.api.call("messages.send", {
						user_id: user.id,
						message: `💸 На ваш банковский счет пришли 3% на сумму ${utils.spaces(bankusersumma)}$.\n💳 В банке: ${utils.spaces(user.bank)}$`,
						random_id: Math.random()
					});
				} catch (error) {
					console.log(error)
				}
			}
			if (user.lvl >= 300 && user.lvl < 400) {
				let bankusersumma = Math.floor((user.bank * 4)/100);
				await bankuser.inc("bank", bankusersumma);
	
				try {
					await vk.api.call("messages.send", {
						user_id: user.id,
						message: `💸 На ваш банковский счет пришли 4% на сумму ${utils.spaces(bankusersumma)}$.\n💳 В банке: ${utils.spaces(user.bank)}$`,
						random_id: Math.random()
					});
				} catch (error) {
					console.log(error)
				}
			}
			if (user.lvl >= 400 && user.lvl < 500) {
				let bankusersumma = Math.floor((user.bank * 5)/100);
				await bankuser.inc("bank", bankusersumma);
	
				try {
					await vk.api.call("messages.send", {
						user_id: user.id,
						message: `💸 На ваш банковский счет пришли 5% на сумму ${utils.spaces(bankusersumma)}$.\n💳 В банке: ${utils.spaces(user.bank)}$`,
						random_id: Math.random()
					});
				} catch (error) {
					console.log(error)
				}
			}
			if (user.lvl >= 500) {
				let bankusersumma = Math.floor((user.bank * 6)/100);
				await bankuser.inc("bank", bankusersumma);
	
				try {
					await vk.api.call("messages.send", {
						user_id: user.id,
						message: `💸 На ваш банковский счет пришли 6% на сумму ${utils.spaces(bankusersumma)}$.\n💳 В банке: ${utils.spaces(user.bank)}$`,
						random_id: Math.random()
					});
				} catch (error) {
					console.log(error)
				}
			}
		}
	});
}, 3600000);

setInterval(async () => {
	let Allusers = [];
	let users = await User.find();

	for (let i = 0; i < users.length; i += 1) {
		Allusers.push({ id: users[i].id, bank: users[i].bank, lvl: users[i].lvl });
	}

	Allusers.map(async (user) => {
		if(user.bank && user.bank > 1000000000) {
			let bankuser = await User.findOne({ id: user.id });
			if (user.lvl < 100) {
				let bankusersumma = Math.floor((user.bank * 5)/100);
				await bankuser.dec("bank", bankusersumma);
	
				try {
					await vk.api.call("messages.send", {
						user_id: user.id,
						message: `📝 С вашего банковского счета списаны 5% в качестве налога "Счет в банке свыше 1 млрд." на сумму ${utils.spaces(bankusersumma)}$.\n💳 В банке: ${utils.spaces(user.bank)}$`,
						random_id: Math.random()
					});
				} catch (error) {
					console.log(error)
				}
			}
			if (user.lvl >= 100 && user.lvl < 200) {
				let bankusersumma = Math.floor((user.bank * 6)/100);
				await bankuser.dec("bank", bankusersumma);
	
				try {
					await vk.api.call("messages.send", {
						user_id: user.id,
						message: `📝 С вашего банковского счета списаны 6% в качестве налога "Счет в банке свыше 1 млрд." на сумму ${utils.spaces(bankusersumma)}$.\n💳 В банке: ${utils.spaces(user.bank)}$`,
						random_id: Math.random()
					});
				} catch (error) {
					console.log(error)
				}
			}
			if (user.lvl >= 200 && user.lvl < 300) {
				let bankusersumma = Math.floor((user.bank * 7)/100);
				await bankuser.dec("bank", bankusersumma);
	
				try {
					await vk.api.call("messages.send", {
						user_id: user.id,
						message: `📝 С вашего банковского счета списаны 7% в качестве налога "Счет в банке свыше 1 млрд." на сумму ${utils.spaces(bankusersumma)}$.\n💳 В банке: ${utils.spaces(user.bank)}$`,
						random_id: Math.random()
					});
				} catch (error) {
					console.log(error)
				}
			}
			if (user.lvl >= 300 && user.lvl < 400) {
				let bankusersumma = Math.floor((user.bank * 8)/100);
				await bankuser.dec("bank", bankusersumma);
	
				try {
					await vk.api.call("messages.send", {
						user_id: user.id,
						message: `📝 С вашего банковского счета списаны 8% в качестве налога "Счет в банке свыше 1 млрд." на сумму ${utils.spaces(bankusersumma)}$.\n💳 В банке: ${utils.spaces(user.bank)}$`,
						random_id: Math.random()
					});
				} catch (error) {
					console.log(error)
				}
			}
			if (user.lvl >= 400 && user.lvl < 500) {
				let bankusersumma = Math.floor((user.bank * 9)/100);
				await bankuser.dec("bank", bankusersumma);
	
				try {
					await vk.api.call("messages.send", {
						user_id: user.id,
						message: `📝 С вашего банковского счета списаны 9% в качестве налога "Счет в банке свыше 1 млрд." на сумму ${utils.spaces(bankusersumma)}$.\n💳 В банке: ${utils.spaces(user.bank)}$`,
						random_id: Math.random()
					});
				} catch (error) {
					console.log(error)
				}
			}
			if (user.lvl >= 500) {
				let bankusersumma = Math.floor((user.bank * 10)/100);
				await bankuser.dec("bank", bankusersumma);
	
				try {
					await vk.api.call("messages.send", {
						user_id: user.id,
						message: `📝 С вашего банковского счета списаны 10% в качестве налога "Счет в банке свыше 1 млрд." на сумму ${utils.spaces(bankusersumma)}$.\n💳 В банке: ${utils.spaces(user.bank)}$`,
						random_id: Math.random()
					});
				} catch (error) {
					console.log(error)
				}
			}
		}
	});
}, 3600000);

setInterval(async () => {
	alltimers = await allTimers();
}, 10000);

//Функция для запуска бота
async function run() {
	dbanswers = await loadAnswerDB('answer_database.bin')
	console.log('База ответов успешно загружена. В базе ' + dbanswers.length + ' ответов!')

	top = await leaderBoard();
	toplvl = await leaderBoardtoLevel();
	topbank = await leaderBoardtoBank();
	allusers = await allUsers();
	
    await vk.updates.startPolling();
    console.log('Бот успешно запущен!');
} 

run().catch(console.error)