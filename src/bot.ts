import {Bot, Context, InlineKeyboard, session, SessionFlavor} from 'grammy';
import {config} from './config';
import {SubscriptionService} from './services/subscription.service';
import logger from './utils/logger';

interface SessionData {
    pendingSubscription?: {
        type: 'basic' | 'standard' | 'premium';
    };
}

type BotContext = Context & SessionFlavor<SessionData>;

// Subscription plan details
const SUBSCRIPTION_PLANS = {
    basic: {price: 1000, duration: 30, name: 'Basic'},
    standard: {price: 5000, duration: 90, name: 'Standard'},
    premium: {price: 15000, duration: 360, name: 'Premium'}
};

export class SubscriptionBot {
    private bot: Bot<BotContext>;
    private subscriptionService: SubscriptionService;

    constructor() {
        this.bot = new Bot<BotContext>(config.BOT_TOKEN);
        this.subscriptionService = new SubscriptionService();
        this.setupMiddleware();
        this.setupHandlers();
    }

    /**
     * Start the bot and set up subscription cleanup job
     */
    public async start(): Promise<void> {
        // Clean up expired subscriptions every 24 hours
        setInterval(async () => {
            try {
                await this.subscriptionService.deactivateExpiredSubscriptions();
            } catch (error) {
                logger.error('Error in subscription cleanup job:', error);
            }
        }, 2000);
        // 24 * 60 * 60 * 1000
        this.bot.start({
            onStart: () => {
                logger.info('Bot started');
            }
        });
    }

    /**
     * Set up bot middleware including session management and error handling
     */
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

    /**
     * Set up command and callback query handlers
     */
    private setupHandlers(): void {
        this.bot.command('start', this.handleStart.bind(this));
        this.bot.on('callback_query', this.handleCallbackQuery.bind(this));
    }

    /**
     * Handle all callback queries in one place
     */
    private async handleCallbackQuery(ctx: BotContext): Promise<void> {


        if (!ctx.callbackQuery?.data) return;

        const data = ctx.callbackQuery.data;
        if (!data) return;

        const handlers: { [key: string]: (ctx: BotContext) => Promise<void> } = {
            'subscribe': this.handleSubscribeCallback.bind(this),
            'check_status': this.handleStatus.bind(this),
            'renew': this.handleRenew.bind(this),
            'main_menu': this.showMainMenu.bind(this),
            'confirm_subscribe_basic': this.confirmSubscription.bind(this, 'basic'),
            'confirm_subscribe_standard': this.confirmSubscription.bind(this, 'standard'),
            'confirm_subscribe_premium': this.confirmSubscription.bind(this, 'premium'),
            'cancel_subscription': this.handleCancelSubscription.bind(this)
        };

        const handler = handlers[data];
        if (handler) {
            await handler(ctx);
        }
    }

    /**
     * Show main menu with subscription options
     */
    private async showMainMenu(ctx: BotContext): Promise<void> {
        const keyboard = new InlineKeyboard()
            .text("🎯 Obuna bo'lish", "subscribe")
            .row()
            .text("📊 Obuna holati", "check_status")
            .row()
            .text("🔄 Obunani yangilash", "renew");

        const message = `Assalomu alaykum, ${ctx.from?.first_name}! 👋\n\nSports Uz premium kontentiga xush kelibsiz 🏆\n\nQuyidagi tugmalardan birini tanlang:`;

        if (ctx.callbackQuery) {
            await ctx.editMessageText(message, {
                reply_markup: keyboard,
                parse_mode: "HTML"
            });
        } else {
            await ctx.reply(message, {
                reply_markup: keyboard,
                parse_mode: "HTML"
            });
        }
    }

    /**
     * Handle /start command
     */
    private async handleStart(ctx: BotContext): Promise<void> {
        await this.showMainMenu(ctx);
    }

    /**
     * Check and display subscription status
     */
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
                    {reply_markup: keyboard}
                );
                return;
            }

            const status = subscription.isActive ? '✅ Faol' : '❌ Muddati tugagan';
            const expirationLabel = subscription.isActive
                ? '⏰ Obuna tugash muddati:'
                : '⏰ Obuna tamomlangan sana:';

            const message = `🎫 <b>Obuna ma'lumotlari:</b>\n
📅 Holati: ${status}
📆 Obuna bo'lgan sana: ${subscription.subscriptionStart?.toLocaleDateString()}
${expirationLabel} ${subscription.subscriptionEnd?.toLocaleDateString()}`;

            const keyboard = new InlineKeyboard();

            if (subscription.isActive) {
                keyboard.text("❌ Obunani bekor qilish", "cancel_subscription");
            } else {
                keyboard.text("🎯 Qayta obuna bo'lish", "subscribe");
            }

            keyboard.row().text("🔙 Asosiy menyu", "main_menu");

            await ctx.editMessageText(message, {
                reply_markup: keyboard,
                parse_mode: "HTML"
            });
        } catch (error) {
            logger.error('Status check error:', error);
            await ctx.answerCallbackQuery("Obuna holatini tekshirishda xatolik yuz berdi.");
        }
    }


    /**
     * Display subscription plans
     */
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
                    {reply_markup: keyboard}
                );
                return;
            }

            const keyboard = new InlineKeyboard();
            Object.entries(SUBSCRIPTION_PLANS).forEach(([type, plan]) => {
                keyboard
                    .text(
                        `${plan.name} - ${plan.price} so'm / ${plan.duration} kun`,
                        `confirm_subscribe_${type}`
                    )
                    .row();
            });
            keyboard.text("🔙 Asosiy menyu", "main_menu");

            await ctx.editMessageText(
                "🎯 Iltimos, o'zingizga ma'qul obuna turini tanlang:",
                {reply_markup: keyboard}
            );
        } catch (error) {
            logger.error('Subscription plan display error:', error);
            await ctx.answerCallbackQuery("Obuna turlarini ko'rsatishda xatolik yuz berdi.");
        }
    }

    /**
     * Create new subscription for user
     */
    private async confirmSubscription(type: 'basic' | 'standard' | 'premium', ctx: BotContext): Promise<void> {
        try {
            const userId = ctx.from?.id;
            if (!userId) {
                await ctx.answerCallbackQuery("Foydalanuvchi ID'sini olishda xatolik yuz berdi.");
                return;
            }

            try {
                const subscription = await this.subscriptionService.createSubscription(
                    userId,
                    ctx.from?.username,
                    type
                );

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
                if (error instanceof Error && error.message === 'User already has an active subscription') {
                    const keyboard = new InlineKeyboard()
                        .text("📊 Obuna holati", "check_status")
                        .row()
                        .text("🔙 Asosiy menyu", "main_menu");

                    await ctx.editMessageText(
                        "⚠️ Siz allaqachon faol obunaga egasiz. Obuna holatini tekshirish uchun quyidagi tugmani bosing:",
                        {reply_markup: keyboard}
                    );
                    return;
                }
                throw error; // Re-throw other errors to be caught by outer catch block
            }
        } catch (error) {
            logger.error('Subscription confirmation error:', error);
            await ctx.answerCallbackQuery("Obunani tasdiqlashda xatolik yuz berdi.");
        }
    }

    /**
     * Generate private channel invite link
     */
    private async getPrivateLink() {
        return await this.bot.api.createChatInviteLink(config.CHANNEL_ID, {member_limit: 1});
    }

    /**
     * Handle subscription renewal
     */
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
                    {reply_markup: keyboard}
                );
                return;
            }

            const privateLink = await this.getPrivateLink();

            const keyboard = new InlineKeyboard()
                .url("🔗 Kanalga kirish", privateLink.invite_link)
                .row()
                .text("🔙 Asosiy menyu", "main_menu");


            await ctx.editMessageText(
                `✅ Obuna muvaffaqiyatli yangilandi!\n\n⏰ Yangi muddat: ${subscription.subscriptionEnd.toLocaleDateString()}`,
                {reply_markup: keyboard}
            );
        } catch (error) {
            logger.error('Renewal error:', error);
            await ctx.answerCallbackQuery("Obunani yangilashda xatolik yuz berdi.");
        }
    }

    /**
     * Handle subscription cancellation
     */
    private async handleCancelSubscription(ctx: BotContext): Promise<void> {
        try {
            const userId = ctx.from?.id;
            if (!userId) {
                await ctx.answerCallbackQuery("Foydalanuvchi ID'sini olishda xatolik yuz berdi.");
                return;
            }

            const success = await this.subscriptionService.cancelSubscription(userId);

            if (success) {
                const keyboard = new InlineKeyboard()
                    .text("🎯 Qayta obuna bo'lish", "subscribe")
                    .row()
                    .text("🔙 Asosiy menyu", "main_menu");

                await ctx.editMessageText(
                    "✅ Sizning obunangiz bekor qilindi.\n\nQayta obuna bo'lish uchun quyidagi tugmani bosing:",
                    {reply_markup: keyboard}
                );
            } else {
                await ctx.answerCallbackQuery("Obunani bekor qilishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
            }
        } catch (error) {
            logger.error('Cancel subscription error:', error);
            await ctx.answerCallbackQuery("Obunani bekor qilishda xatolik yuz berdi.");
        }
    }
}