import {Bot, Context, InlineKeyboard, session, SessionFlavor} from 'grammy';
import {config, SubscriptionType} from '../config';
import {SubscriptionService} from '../services/subscription.service';
import logger from '../utils/logger';
import {Plan} from "../database/models/plans.model";


// 27-Yanvarda userlarni kickout qilish methodi qolib ketdi
interface SessionData {
    pendingSubscription?: {
        type: SubscriptionType
    };
}

type BotContext = Context & SessionFlavor<SessionData>;

// Subscription plan details
const SUBSCRIPTION_PLANS = {
    basic: {price: 7777, duration: 30, name: 'Basic'},
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

    public async start(): Promise<void> {
        // Clean up expired subscriptions every 2 seconds
        setInterval(async () => {
            try {
                logger.info('Running subscription cleanup job...'); // Debug log

                // First deactivate expired subscriptions
                await this.subscriptionService.deactivateExpiredSubscriptions();
                logger.info('Deactivated expired subscriptions'); // Debug log

                // Get list of expired users
                const expiredUsers = await this.subscriptionService.listExpiredSubscriptions();
                logger.info(`Found ${expiredUsers.length} expired subscriptions`); // Debug log

                // Process each expired user
                for (const user of expiredUsers) {
                    logger.info(`Processing expired user: ${user.userId}`); // Debug log
                    await this.handleKickOutForNonPayment(user);
                }
            } catch (error) {
                logger.error('Error in subscription cleanup job:', error);
            }
        }, 1000 * 60 * 60); // 1 hour

        await this.bot.start({
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
            'cancel_subscription': this.handleCancelSubscription.bind(this),
            'kick_out_for_non_payment': this.handleKickOutForNonPayment.bind(this),
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
            const plan =  await Plan.findOne({
                name: 'Basic'
            });

            if (!plan) {
                await ctx.answerCallbackQuery("Obuna turlarini ko'rsatishda xatolik yuz berdi.");
                return;
            }

            keyboard.text(
                `${plan.name} - ${plan.price} so'm / ${plan.duration} kun`,
                `confirm_subscribe_basic`
            );

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
// Modified confirmSubscription method
    private async confirmSubscription(type: SubscriptionType, ctx: BotContext): Promise<void> {
        try {
            const userId = ctx.from?.id;
            if (!userId) {
                await ctx.answerCallbackQuery("Foydalanuvchi ID'sini olishda xatolik yuz berdi.");
                return;
            }

            try {
                const {user: subscription, wasKickedOut} = await this.subscriptionService.createSubscription(
                    userId,
                    type,
                    ctx.from?.username
                );

                // If user was previously kicked out, handle unban process
                if (wasKickedOut) {
                    const unbanSuccess = await this.handleUserUnban(userId, config.CHANNEL_ID);
                    if (!unbanSuccess) {
                        logger.error(`Failed to process unban for user ${userId}`);
                        // Continue with subscription but log the error
                    }
                }

                const privateLink = await this.getPrivateLink();
                const keyboard = new InlineKeyboard()
                    .url("🔗 Kanalga kirish", privateLink.invite_link)
                    .row()
                    .text("🔙 Asosiy menyu", "main_menu");

                let messageText = `🎉 Tabriklaymiz! Siz muvaffaqiyatli obuna bo'ldingiz!\n\n` +
                    `⏰ Obuna tugash muddati: ${subscription.subscriptionEnd.toLocaleDateString()}\n\n`;

                if (wasKickedOut) {
                    messageText += `ℹ️ Sizning avvalgi bloklanishingiz bekor qilindi. ` +
                        `Quyidagi havola orqali kanalga qayta kirishingiz mumkin:\n\n`;
                } else {
                    messageText += `Quyidagi havola orqali kanalga kirishingiz mumkin:\n\n`;
                }

                await ctx.editMessageText(messageText, {
                    reply_markup: keyboard,
                    parse_mode: "HTML"
                });

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
                throw error;
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
        try {
            // Create a permanent invite link with no expiration and single-use
            const link = await this.bot.api.createChatInviteLink(config.CHANNEL_ID, {
                member_limit: 1,
                // should be set to another value later
                expire_date: 0, // Set to 0 for no expiration
                creates_join_request: false // Direct join without admin approval
            });
            logger.info('Private channel invite link:', link.invite_link);
            return link;
        } catch (error) {
            logger.error('Error generating channel invite link:', error);
            throw error;
        }
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

    private async handleKickOutForNonPayment(userOrCtx: BotContext | { userId: number, _id: any }): Promise<void> {
        try {
            let userId: number;

            if ('from' in userOrCtx) {
                userId = userOrCtx.from?.id || 0;
            } else {
                userId = userOrCtx.userId;
            }

            if (!userId) {
                logger.error("User ID is missing.");
                return;
            }

            const subscription = await this.subscriptionService.getSubscription(userId);

            if (!subscription || !subscription.isActive) {
                try {
                    // Check if user is already kicked out
                    if (subscription?.isKickedOut) {
                        logger.info(`User ${userId} was already kicked out. Skipping.`);
                        return;
                    }

                    // Ban user from channel
                    await this.bot.api.banChatMember(config.CHANNEL_ID, userId);
                    logger.info(`Successfully kicked out user ${userId}`);

                    // Update the database to mark user as kicked out
                    if (subscription) {
                        subscription.isKickedOut = true;
                        await subscription.save();
                        logger.info(`Marked user ${userId} as kicked out in database`);
                    }

                    // Notify the user (only sent once due to isKickedOut flag)
                    try {
                        await this.bot.api.sendMessage(userId,
                            "⚠️ Sizning obunangiz muddati tugaganligi sababli kanaldan chiqarildingi. " +
                            "Qayta obuna bo'lish uchun botga murojaat qiling.");
                        logger.info(`Notification sent to user ${userId}`);
                    } catch (error) {
                        logger.error(`Failed to send notification to user ${userId}:`, error);
                    }
                } catch (error) {
                    logger.error(`Failed to kick out user ${userId}:`, error);
                }
            }
        } catch (error) {
            logger.error('Error in handleKickOutForNonPayment:', error);
        }
    }

    private async handleUserUnban(userId: number, channelId: string): Promise<boolean> {
        try {
            // First, check if the user is actually banned
            try {
                const member = await this.bot.api.getChatMember(channelId, userId);
                if (member.status === 'kicked') {
                    // User is banned, proceed with unban
                    await this.bot.api.unbanChatMember(channelId, userId, {
                        only_if_banned: true
                    });

                    // After unbanning, create a new invite link for this specific user
                    const privateLink = await this.getPrivateLink();

                    // Send the new invite link to the user
                    await this.bot.api.sendMessage(userId,
                        `✅ Sizning obunangiz faollashtirildi!\n\n` +
                        `🔗 Kanalga qayta kirish uchun havola: ${privateLink.invite_link}`
                    );

                    logger.info(`Successfully unbanned user ${userId} and sent new invite link`);
                    return true;
                } else {
                    logger.info(`User ${userId} is not banned (current status: ${member.status}). No unban needed.`);
                    return true;
                }
            } catch (error) {

                logger.info(`User ${userId} is not a member of the channel. Proceeding with subscription.`);
                return true;

                throw error;
            }
        } catch (error) {
            logger.error(`Failed to process unban for user ${userId}:`, error);
            return false;
        }
    }


    // sending message to users who have not paid
    // TODO: send message to users who have not paid 3 days before their subscription ends

}