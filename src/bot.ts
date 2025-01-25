import { Bot, Context, InlineKeyboard, Keyboard, session, SessionFlavor } from 'grammy';
import { config } from './config';
import { SubscriptionService } from './services/subscription.service';
import logger from './utils/logger';

interface SessionData {
    pendingSubscription?: {
        type: 'basic' | 'standard' | 'premium';
    };
}

type BotContext = Context & SessionFlavor<SessionData>;

export class SubscriptionBot {
    private bot: Bot<BotContext>;
    private subscriptionService: SubscriptionService;

    constructor() {
        this.bot = new Bot<BotContext>(config.BOT_TOKEN);
        this.subscriptionService = new SubscriptionService();
        this.setupMiddleware();
        this.setupHandlers();
    }

    private setupMiddleware(): void {
        this.bot.use(session({
            initial(): SessionData {
                return {};
            }
        }));

        this.bot.catch((err) => {
            logger.error('Bot error:', err);
        });
    }

    private setupHandlers(): void {
        this.bot.command('start', this.handleStart.bind(this));

        this.bot.on('callback_query', async (ctx) => {
            const data = ctx.callbackQuery.data;
            if (!data) return;

            switch (data) {
                case 'subscribe':
                    await this.handleSubscribeCallback(ctx);
                    break;
                case 'check_status':
                    await this.handleStatus(ctx);
                    break;
                case 'renew':
                    await this.handleRenew(ctx);
                    break;
                case 'main_menu':
                    await this.showMainMenu(ctx);
                    break;
                case 'get_link':
                    await this.handleGetLink(ctx);
                    break;
                case 'confirm_subscribe':
                    await this.confirmSubscription(ctx);
                    break;
            }
        });
    }


    private async showMainMenu(ctx: BotContext): Promise<void> {
        const keyboard = new InlineKeyboard()
            .text("🎯 Obuna bo'lish", "subscribe")
            .row()
            .text("📊 Obuna holati", "check_status")
            .row()
            .text("🔄 Obunani yangilash", "renew");

        const message = `Assalomu alaykum, ${ctx.from?.first_name}! 👋

Sports Uz premium kontentiga xush kelibsiz 🏆

Quyidagi tugmalardan birini tanlang:`;

        await ctx.reply(message, {
            reply_markup: keyboard,
            parse_mode: "HTML"
        });
    }

    private async handleStart(ctx: BotContext): Promise<void> {
        await this.showMainMenu(ctx);
    }

    private async handleStatus(ctx: BotContext): Promise<void> {
        try {
            const userId = ctx.from?.id;

            if (!userId) {
                await ctx.answerCallbackQuery("Foydalanuvchi ID'sini olishda xatolik yuz berdi.");
                return;
            }

            const subscription = await this.subscriptionService.getSubscription(userId);

            if (!subscription) {
                const keyboard = new InlineKeyboard()
                    .text("🎯 Obuna bo'lish", "subscribe");

                await ctx.editMessageText(
                    "Hech qanday obuna topilmadi 🤷‍♂️\nObuna bo'lish uchun quyidagi tugmani bosing:",
                    { reply_markup: keyboard }
                );
                return;
            }

            const status = subscription.isActive ? '✅ Faol' : '❌ Muddati tugagan';
            const message = `🎫 <b>Obuna ma'lumotlari:</b>\n
📅 Holati: ${status}
📆 Obuna bo'lgan sana: ${subscription.subscriptionStart.toLocaleDateString()}
⏰ Obuna tugash muddati: ${subscription.subscriptionEnd.toLocaleDateString()}`;

            const keyboard = new InlineKeyboard()
                .text("Qo'shilish linkini olish", "get_link")
                .text("🔙 Asosiy menyu", "main_menu");

            await ctx.editMessageText(message, {
                reply_markup: keyboard,
                parse_mode: "HTML"
            });
        } catch (error) {
            logger.error('Status check error:', error);
            await ctx.answerCallbackQuery("Obuna holatini tekshirishda xatolik yuz berdi.");
        }
    }

    private async handleRenew(ctx: BotContext): Promise<void> {
        try {
            const userId = ctx.from?.id;

            if (!userId) {
                await ctx.answerCallbackQuery("Foydalanuvchi ID'sini olishda xatolik yuz berdi.");
                return;
            }

            const subscription = await this.subscriptionService.renewSubscription(userId);

            if (!subscription) {
                const keyboard = new InlineKeyboard()
                    .text("🎯 Obuna bo'lish", "subscribe");

                await ctx.editMessageText(
                    "Obuna topilmadi 🤷‍♂️\nObuna bo'lish uchun quyidagi tugmani bosing:",
                    { reply_markup: keyboard }
                );
                return;
            }

            const keyboard = new InlineKeyboard()
                .text("🔙 Asosiy menyu", "main_menu");

            await ctx.editMessageText(
                `✅ Obuna muvaffaqiyatli yangilandi!\n\n⏰ Yangi muddat: ${subscription.subscriptionEnd.toLocaleDateString()}`,
                {
                    reply_markup: keyboard,
                    parse_mode: "HTML"
                }
            );
        } catch (error) {
            logger.error('Renewal error:', error);
            await ctx.answerCallbackQuery("Obunani yangilashda xatolik yuz berdi.");
        }
    }

    private async handleSubscribeCallback(ctx: BotContext): Promise<void> {
        try {
            const userId = ctx.from?.id;

            if (!userId) {
                await ctx.answerCallbackQuery("Foydalanuvchi ID'sini olishda xatolik yuz berdi.");
                return;
            }

            const existingSubscription = await this.subscriptionService.getSubscription(userId);
            if (existingSubscription?.isActive) {
                const keyboard = new InlineKeyboard()
                    .text("📊 Obuna holati", "check_status");

                await ctx.editMessageText(
                    `Siz allaqachon obuna bo'lgansiz ✅\n\nObuna tugash muddati: ${existingSubscription.subscriptionEnd.toLocaleDateString()}`,
                    {
                        reply_markup: keyboard,
                        parse_mode: "HTML"
                    }
                );
                return;
            }

            const keyboard = new InlineKeyboard()
                .text("✅ Tasdiqlash (0 so'm)", "confirm_subscribe");

            await ctx.editMessageText(
                `📌 <b>Obuna ma'lumotlari:</b>\n
💰 Narx: 7777 so'm
⏱ Muddat: 30 kun

🎁 Maxsus taklif: Hozir tekinga obuna bo'ling!`,
                {
                    reply_markup: keyboard,
                    parse_mode: "HTML"
                }
            );
        } catch (error) {
            logger.error('Subscription error:', error);
            await ctx.answerCallbackQuery("Obuna bo'lishda xatolik yuz berdi.");
        }
    }

    private async confirmSubscription(ctx: BotContext): Promise<void> {
        try {
            const userId = ctx.from?.id;

            if (!userId) {
                await ctx.answerCallbackQuery("Foydalanuvchi ID'sini olishda xatolik yuz berdi.");
                return;
            }

            const subscription = await this.subscriptionService.createSubscription(
                userId,
                ctx.from?.username,
                "basic"
            );

            if (!subscription) {
                await ctx.answerCallbackQuery("Obuna yaratishda xatolik yuz berdi.");
                return;
            }

            const privateLink = await this.getPrivateLink();
            const keyboard = new InlineKeyboard()
                .url("🔗 Kanalga kirish", privateLink.invite_link)
                .row()
                .text("🔙 Asosiy menyu", "main_menu");

            await ctx.editMessageText(
                `🎉 Tabriklaymiz! Siz muvaffaqiyatli obuna bo'ldingiz!\n
⏰ Obuna tugash muddati: ${subscription.subscriptionEnd.toLocaleDateString()}\n
Quyidagi havola orqali kanalga kirishingiz mumkin:`,
                {
                    reply_markup: keyboard,
                    parse_mode: "HTML"
                }
            );
        } catch (error) {
            logger.error('Subscription confirmation error:', error);
            await ctx.answerCallbackQuery("Obunani tasdiqlashda xatolik yuz berdi.");
        }
    }

    private async getPrivateLink() {
        return await this.bot.api.createChatInviteLink(config.CHANNEL_ID, { member_limit: 1 });
    }

    private async handleGetLink(ctx: BotContext): Promise<void> {
        try {
            const userId = ctx.from?.id;
            if (!userId) {
                await ctx.answerCallbackQuery("Foydalanuvchi ID'sini olishda xatolik yuz berdi.");
                return;
            }
            const isUserInChannel = await this.checkUserExistenceInChannel(userId);

            if (isUserInChannel) {
                await ctx.reply("Foydalanuvchi kanalga qo'shilgan.");
                return;
            }

            const privateLink = await this.getPrivateLink();

            await ctx.reply(
                `🔗 Kanalga kirish havolasi:\n`, {
                reply_markup: new InlineKeyboard().url("🔗 Qo'shilish", privateLink.invite_link),
            });
        } catch (error) {
            logger.error('Private link error:', error);
            await ctx.answerCallbackQuery("Havolani olishda xatolik yuz berdi.");
        }
    }


    private async checkUserExistenceInChannel(userId: number): Promise<boolean> {
        try {
            const chatMember = await this.bot.api.getChatMember(config.CHANNEL_ID, userId);
            logger.info(`User ${userId} status: ${chatMember.status}`);
            return chatMember.status === 'member';
        } catch (error) {
            logger.error('User existence check error:', error);
            return false;
        }
    }

    public async start(): Promise<void> {
        setInterval(async () => {
            try {
                await this.subscriptionService.deactivateExpiredSubscriptions();
            } catch (error) {
                logger.error('Error in subscription cleanup job:', error);
            }
        }, 24 * 60 * 60 * 1000);

        this.bot.start({
            onStart: () => {
                logger.info('Bot started');
            }
        });
    }
}