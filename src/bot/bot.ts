import {Bot, Context, InlineKeyboard, session, SessionFlavor} from 'grammy';
import {config, SubscriptionType} from '../config';
import {SubscriptionService} from '../services/subscription.service';
import logger from '../utils/logger';
import {Plan} from "../database/models/plans.model";
import {UserModel} from "../database/models/user.model";
import {generatePaymeLink} from "../shared/generators/payme-link.generator";
import {SubscriptionMonitorService} from '../services/subscription-monitor.service';
import {SubscriptionChecker} from '../schedulers/subscription-checker';
import {ClickRedirectParams, getClickRedirectLink} from "../shared/generators/click-redirect-link.generator";


interface SessionData {
    pendingSubscription?: {
        type: SubscriptionType
    };
}

type BotContext = Context & SessionFlavor<SessionData>;

export class SubscriptionBot {
    private bot: Bot<BotContext>;
    private subscriptionService: SubscriptionService;
    private subscriptionMonitorService: SubscriptionMonitorService;
    private subscriptionChecker: SubscriptionChecker;

    constructor() {
        this.bot = new Bot<BotContext>(config.BOT_TOKEN);
        this.subscriptionService = new SubscriptionService();
        this.subscriptionMonitorService = new SubscriptionMonitorService(this.bot);
        this.subscriptionChecker = new SubscriptionChecker(this.subscriptionMonitorService);
        this.setupMiddleware();
        this.setupHandlers();
    }

    public async start(): Promise<void> {
        // Just start the checker once
        this.subscriptionChecker.start();

        await this.bot.start({
            onStart: () => {
                logger.info('Bot started');
            }
        });
    }

    async handlePaymentSuccess(userId: string, telegramId: number, username?: string): Promise<void> {
        console.log("WATCH! @@@ handlePaymentSuccess is being called! ");

        try {
            const plan = await Plan.findOne({name: 'Basic'});

            if (!plan) {
                logger.error('No plan found with name "Basic"');
                return;
            }

            const {user: subscription, wasKickedOut} = await this.subscriptionService.createSubscription(
                userId,
                plan,
                username
            );

            const privateLink = await this.getPrivateLink();
            const keyboard = new InlineKeyboard()
                .url("🔗 Kanalga kirish", privateLink.invite_link)
                .row()
                .text("🔙 Asosiy menyu", "main_menu");

            let messageText = `🎉 Tabriklaymiz! To'lov muvaffaqiyatli amalga oshirildi!\n\n` +
                `⏰ Obuna tugash muddati: ${subscription.subscriptionEnd.getDate().toString().padStart(2, '0')}.${(subscription.subscriptionEnd.getMonth() + 1).toString().padStart(2, '0')}.${subscription.subscriptionEnd.getFullYear()}\n\n`;

            if (wasKickedOut) {
                messageText += `ℹ️ Sizning avvalgi bloklanishingiz bekor qilindi. ` +
                    `Quyidagi havola orqali kanalga qayta kirishingiz mumkin:`;
            } else {
                messageText += `Quyidagi havola orqali kanalga kirishingiz mumkin:`;
            }

            await this.bot.api.sendMessage(
                telegramId,
                messageText,
                {
                    reply_markup: keyboard,
                    parse_mode: "HTML"
                }
            );
            console.log("WATCH! @@@ handlePaymentSuccess sent the message");

        } catch (error) {
            logger.error('Payment success handling error:', error);
            // Optionally send error message to user
            await this.bot.api.sendMessage(
                telegramId,
                "⚠️ To'lov amalga oshirildi, lekin obunani faollashtirish bilan bog'liq muammo yuzaga keldi. Iltimos, administrator bilan bog'laning."
            );
        }
    }

    private setupMiddleware(): void {
        this.bot.use(session({
            initial(): SessionData {
                return {};
            }
        }));
        this.bot.use((ctx, next) => {
            logger.info(`user chatId: ${ctx.from?.id}`);
            return next();
        })

        this.bot.catch((err) => {
            logger.error('Bot error:', err);
        });
    }

    private setupHandlers(): void {
        this.bot.command('start', this.handleStart.bind(this));
        this.bot.on('callback_query', this.handleCallbackQuery.bind(this));
    }

    private async handleCallbackQuery(ctx: BotContext): Promise<void> {


        if (!ctx.callbackQuery?.data) return;

        const data = ctx.callbackQuery.data;
        if (!data) return;

        const handlers: { [key: string]: (ctx: BotContext) => Promise<void> } = {
            'subscribe': this.handleSubscribeCallback.bind(this),
            'check_status': this.handleStatus.bind(this),
            'renew': this.handleRenew.bind(this),
            'main_menu': this.showMainMenu.bind(this),
            'confirm_subscribe_basic': this.confirmSubscription.bind(this),

            // 'cancel_subscription': this.handleCancelSubscription.bind(this),

            // test
            // 'dev_test_subscribe': this.handleDevTestSubscribe.bind(this),
        };

        const handler = handlers[data];
        if (handler) {
            await handler(ctx);
        }
    }

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

    private async handleStart(ctx: BotContext): Promise<void> {
        await this.createUserIfNotExist(ctx);
        await this.showMainMenu(ctx);
    }

    // TEST
    private async handleDevTestSubscribe(ctx: BotContext): Promise<void> {
        try {
            const telegramId = ctx.from?.id;
            const user = await UserModel.findOne({telegramId});
            if (!user) {
                await ctx.answerCallbackQuery("Foydalanuvchi ID'sini olishda xatolik yuz berdi.");
                return;
            }

            const plan = await Plan.findOne({
                name: 'Basic'
            });

            if (!plan) {
                logger.error('No plan found with name "Basic"');
                return;
            }

            try {
                const {user: subscription, wasKickedOut} = await this.subscriptionService.createSubscription(
                    user._id as string,
                    plan,
                    ctx.from?.username
                );

                const privateLink = await this.getPrivateLink();
                const keyboard = new InlineKeyboard()
                    .url("🔗 Kanalga kirish", privateLink.invite_link)
                    .row()
                    .text("🔙 Asosiy menyu", "main_menu");

                let messageText = `🎉 DEV TEST: Muvaffaqiyatli obuna bo'ldingiz!\n\n` +
                    `⏰ Obuna tugash muddati: ${subscription.subscriptionEnd.toLocaleDateString()}\n\n` +
                    `[DEV MODE] To'lov talab qilinmadi\n\n`;

                if (wasKickedOut) {
                    messageText += `ℹ️ Sizning avvalgi bloklanishingiz bekor qilindi. `;
                }

                messageText += `Quyidagi havola orqali kanalga kirishingiz mumkin:`;

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
                logger.error('Dev test subscription error:', error);
                await ctx.answerCallbackQuery("Obunani tasdiqlashda xatolik yuz berdi.");
            }
        } catch (error) {
            logger.error('Dev test subscription error:', error);
            await ctx.answerCallbackQuery("Dev test obunasini yaratishda xatolik yuz berdi.");
        }
    }

    private async handleStatus(ctx: BotContext): Promise<void> {
        try {
            const telegramId = ctx.from?.id;
            const user = await UserModel.findOne({telegramId});

            if (!user) {
                await ctx.answerCallbackQuery("Foydalanuvchi ID'sini olishda xatolik yuz berdi.");
                return;
            }

            // If user has never had a subscription, show different message
            if (!user.subscriptionStart && !user.subscriptionEnd) {
                const keyboard = new InlineKeyboard()
                    .text("🎯 Obuna bo'lish", "subscribe")
                    .row()
                    .text("🔙 Asosiy menyu", "main_menu");

                await ctx.editMessageText(
                    "Siz hali obuna bo'lmagansiz 🤷‍♂️\nObuna bo'lish uchun quyidagi tugmani bosing:",
                    {reply_markup: keyboard}
                );
                return;
            }

            const subscription = await this.subscriptionService.getSubscription(user._id as string);

            if (!subscription) {
                const keyboard = new InlineKeyboard()
                    .text("🎯 Obuna bo'lish", "subscribe")
                    .row()
                    .text("🔙 Asosiy menyu", "main_menu");

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

            let subscriptionStartDate = 'Mavjud emas';
            let subscriptionEndDate = 'Mavjud emas';

            if (subscription.subscriptionStart) {
                const d = subscription.subscriptionStart;
                subscriptionStartDate = `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
            }
            if (subscription.subscriptionEnd) {
                const d = subscription.subscriptionEnd;
                subscriptionEndDate = `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
            }

            const message = `🎫 <b>Obuna ma'lumotlari:</b>\n
📅 Holati: ${status}
📆 Obuna bo'lgan sana: ${subscriptionStartDate}
${expirationLabel} ${subscriptionEndDate}`;

            const keyboard = new InlineKeyboard();

            if (subscription.isActive) {
                const privateLink = await this.getPrivateLink();
                keyboard.row()
                keyboard.url("🔗 Kanalga kirish", privateLink.invite_link)
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

    private async handleSubscribeCallback(ctx: BotContext): Promise<void> {
        try {
            const telegramId = ctx.from?.id;
            const user = await UserModel.findOne({telegramId});
            if (!user) {
                await ctx.answerCallbackQuery("Foydalanuvchi ID'sini olishda xatolik yuz berdi.");
                return;
            }

            const existingSubscription = await this.subscriptionService.getSubscription(user._id as string);
            if (existingSubscription?.isActive) {
                const keyboard = new InlineKeyboard()
                    .text("📊 Obuna holati", "check_status");

                await ctx.editMessageText(
                    `⚠️ Siz allaqachon obuna bo'lgansiz ✅\n\nObuna tugash muddati: ${existingSubscription.subscriptionEnd.getDate().toString().padStart(2, '0')}.${(existingSubscription.subscriptionEnd.getMonth() + 1).toString().padStart(2, '0')}.${existingSubscription.subscriptionEnd.getFullYear()}`,
                    {reply_markup: keyboard}
                );
                return;
            }

            const plan = await Plan.findOne({
                name: 'Basic'
            });

            if (!plan) {
                await ctx.answerCallbackQuery("Obuna turlarini ko'rsatishda xatolik yuz berdi.");
                return;
            }

            // Option 1: Keep using current Payme implementation
            const paymeCheckoutPageLink = generatePaymeLink({
                planId: plan._id as string,
                amount: plan.price,
                userId: user._id as string
            });

            // const keyboard = new InlineKeyboard()
            //     .url(
            //         `${plan.name} - ${plan.price} so'm / ${plan.duration} kun`,
            //         paymeCheckoutPageLink
            //     )
            //     .row()
            //     .text("🔙 Asosiy menyu", "main_menu");

            // Option 2: Uncomment to use payment method selection
            const keyboard = await this.getPaymentMethodKeyboard(plan, user._id as string);


            await ctx.editMessageText(
                "🎯 Iltimos, o'zingizga ma'qul to'lov turini tanlang:",
                {reply_markup: keyboard}
            );
        } catch (error) {
            logger.error('Subscription plan display error:', error);
            await ctx.answerCallbackQuery("Obuna turlarini ko'rsatishda xatolik yuz berdi.");
        }
    }

    private async confirmSubscription(ctx: BotContext): Promise<void> {
        try {
            const telegramId = ctx.from?.id;
            const user = await UserModel.findOne({telegramId: telegramId});
            if (!user) {
                await ctx.answerCallbackQuery("Foydalanuvchi ID'sini olishda xatolik yuz berdi.");
                return;
            }

            const plan = await Plan.findOne({
                name: 'Basic'
            });

            if (!plan) {
                logger.error('No plan found with name "Basic"');
                return;
            }

            try {
                const {user: subscription, wasKickedOut} = await this.subscriptionService.createSubscription(
                    user._id as string,
                    plan,
                    ctx.from?.username
                );

                const privateLink = await this.getPrivateLink();
                const keyboard = new InlineKeyboard()
                    .url("🔗 Kanalga kirish", privateLink.invite_link)
                    .row()
                    .text("🔙 Asosiy menyu", "main_menu");

                let messageText = `🎉 Tabriklaymiz! Siz muvaffaqiyatli obuna bo'ldingiz!\n\n` +
                    `⏰ Obuna tugash muddati: ${subscription.subscriptionEnd.getDate().toString().padStart(2, '0')}.${(subscription.subscriptionEnd.getMonth() + 1).toString().padStart(2, '0')}.${subscription.subscriptionEnd.getFullYear()}\n\n` +
                    `Quyidagi havola orqali kanalga kirishingiz mumkin:\n\n`;


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
                logger.error('Subscription confirmation error:', error);
                await ctx.answerCallbackQuery("Obunani tasdiqlashda xatolik yuz berdi.");
            }
        } catch (error) {
            logger.error('Subscription confirmation error:', error);
            await ctx.answerCallbackQuery("Obunani tasdiqlashda xatolik yuz berdi.");
        }
    }

    private async getPrivateLink() {
        try {
            // Create a permanent invite link with no expiration and single-use
            logger.info('Generating private channel invite link with channelId: ', config.CHANNEL_ID);
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
            const telegramId = ctx.from?.id;
            const user = await UserModel.findOne({telegramId});
            if (!user) {
                await ctx.answerCallbackQuery("Foydalanuvchi ID'sini olishda xatolik yuz berdi.");
                return;
            }

            // Check if subscription exists and is active
            const existingSubscription = await this.subscriptionService.getSubscription(user._id as string);


            if (!existingSubscription?.isActive || !existingSubscription) {
                const keyboard = new InlineKeyboard()
                    .text("🎯 Obuna bo'lish", "subscribe")
                    .row()
                    .text("🔙 Asosiy menyu", "main_menu");

                await ctx.editMessageText(
                    "⚠️ Siz hali obuna bo'lmagansiz. Obuna bo'lish uchun quyidagi tugmani bosing:",
                    {reply_markup: keyboard}
                );
                return;
            }

            // Calculate days until subscription expires
            const now = new Date();
            const daysUntilExpiration = Math.ceil(
                (existingSubscription.subscriptionEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            );

            // If subscription is active and not within 3 days of expiration
            if (existingSubscription.isActive && daysUntilExpiration > 3) {
                const keyboard = new InlineKeyboard()
                    .text("📊 Obuna holati", "check_status")
                    .row()
                    .text("🔙 Asosiy menyu", "main_menu");

                await ctx.editMessageText(
                    `⚠️ Sizning obunangiz hali faol va ${daysUntilExpiration} kundan so'ng tugaydi.\n\n` +
                    `Obunani faqat muddati tugashiga 3 kun qolganda yoki muddati tugagandan so'ng yangilash mumkin.`,
                    {reply_markup: keyboard}
                );
                return;
            }

            const plan = await Plan.findOne({
                name: 'Basic'
            });

            if (!plan) {
                logger.error('No plan found with name "Basic"');
                return;
            }

            // Generate PayMe checkout link for renewal
            const paymeCheckoutPageLink = generatePaymeLink({
                planId: plan._id as string,
                amount: plan.price,
                userId: user._id as string
            });

            // Get payment method keyboard with all available payment options
            const keyboard = await this.getPaymentMethodKeyboard(plan, user._id as string);

            let message = "🔄 Obunani yangilash uchun to'lov turini tanlang:";
            if (existingSubscription.isActive) {
                message = `⚠️ Sizning obunangiz ${daysUntilExpiration} kundan so'ng tugaydi.\n\n` +
                    `🔄 Obunani yangilash uchun to'lov turini tanlang:`;
            }

            await ctx.editMessageText(
                message,
                {reply_markup: keyboard}
            );
        } catch (error) {
            logger.error('Renewal error:', error);
            await ctx.answerCallbackQuery("Obunani yangilashda xatolik yuz berdi.");
        }
    }

    // Method to handle successful renewal payment callback
    private async handleRenewalSuccess(userId: string): Promise<void> {
        try {
            const user = await UserModel.findById(userId);
            if (!user) {
                logger.error('User not found for renewal success handling');
                return;
            }

            const plan = await Plan.findOne({name: 'Basic'});
            if (!plan) {
                logger.error('No plan found with name "Basic"');
                return;
            }

            const subscription = await this.subscriptionService.renewSubscription(userId, plan);
            if (!subscription) {
                logger.error('Failed to renew subscription after payment');
                return;
            }

            await this.bot.api.unbanChatMember(config.CHANNEL_ID, user.telegramId);

            // Send success message to user
            const privateLink = await this.getPrivateLink();
            const keyboard = new InlineKeyboard()
                .url("🔗 Kanalga kirish", privateLink.invite_link)
                .row()
                .text("🔙 Asosiy menyu", "main_menu");

            await this.bot.api.sendMessage(
                user.telegramId,
                `✅ Obuna muvaffaqiyatli yangilandi!\n\n⏰ Yangi muddat: ${subscription.subscriptionEnd.getDate().toString().padStart(2, '0')}.${(subscription.subscriptionEnd.getMonth() + 1).toString().padStart(2, '0')}.${subscription.subscriptionEnd.getFullYear()}`,
                {
                    reply_markup: keyboard
                }
            );
        } catch (error) {
            logger.error('Error handling renewal success:', error);
        }
    }

    private async handleCancelSubscription(ctx: BotContext): Promise<void> {
        try {
            const telegramId = ctx.from?.id;
            const user = await UserModel.findOne({telegramId: telegramId});
            if (!telegramId || !user) {
                await ctx.answerCallbackQuery("Foydalanuvchi ID'sini olishda xatolik yuz berdi.");
                return;
            }


            const success = await this.subscriptionService.cancelSubscription(user._id as string);

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

    private async createUserIfNotExist(ctx: BotContext): Promise<void> {
        const telegramId = ctx.from?.id;
        const username = ctx.from?.username;

        if (!telegramId) {
            return;
        }

        const user = await UserModel.findOne({telegramId});
        if (!user) {
            const newUser = new UserModel({
                telegramId,
                username
            });
            await newUser.save();
        } else if (username && user.username !== username) {
            // Update username if it has changed
            user.username = username;
            await user.save();
        }
    }

    private async getPaymentMethodKeyboard(plan: any, userId: string) {

        const redirectURLParams: ClickRedirectParams = {
            userId: userId,
            planId: plan._id,
            amount: plan.price,
        };

        const paymeCheckoutPageLink = generatePaymeLink({
            planId: plan._id as string,
            amount: plan.price,
            userId: userId
        });
        const clickUrl = getClickRedirectLink(redirectURLParams);

        return new InlineKeyboard()
            .url('📲 Payme orqali to\'lash', paymeCheckoutPageLink)
            // Uncomment when Click integration is ready
            .url('💳 Click orqali to\'lash', clickUrl)

            .row()
            .text("🔙 Asosiy menyu", "main_menu");
    }


}