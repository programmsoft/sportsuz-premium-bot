import { Bot, Context } from 'grammy';
import { SessionFlavor } from 'grammy';
import { UserModel, IUserDocument } from '../database/models/user.model';
import {config, SubscriptionType} from '../config';
import logger from '../utils/logger';
import { InlineKeyboard } from 'grammy';

interface SessionData {
    pendingSubscription?: {
        type: SubscriptionType
    };
}

type BotContext = Context & SessionFlavor<SessionData>;

export class SubscriptionMonitorService {
    private bot: Bot<BotContext>;

    constructor(bot: Bot<BotContext>) {
        this.bot = bot;
    }

    async checkExpiringSubscriptions(): Promise<void> {
        const threeDaysFromNow = new Date();
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

        // Find users whose subscriptions expire in 3 days and are still active
        const expiringUsers = await UserModel.find({
            subscriptionEnd: {
                $gte: new Date(),
                $lte: threeDaysFromNow
            },
            isActive: true
        });

        for (const user of expiringUsers) {
            await this.sendExpirationWarning(user);
        }
    }

    async handleExpiredSubscriptions(): Promise<void> {
        const now = new Date();

        // Find users whose subscriptions have expired but haven't been kicked
        const expiredUsers = await UserModel.find({
            subscriptionEnd: { $lt: now },
            isActive: true,
            isKickedOut: false
        });

        for (const user of expiredUsers) {
            await this.handleExpiredUser(user);
        }
    }

    private async sendExpirationWarning(user: IUserDocument): Promise<void> {
        try {
            const daysLeft = Math.ceil(
                (user.subscriptionEnd.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
            );

            const keyboard = new InlineKeyboard()
                .text("🔄 Obunani yangilash", "renew")
                .row()
                .text("📊 Obuna holati", "check_status");

            const message = `⚠️ Ogohlantirish!\n\n` +
                `Sizning obunangiz ${daysLeft} kundan so'ng tugaydi.\n` +
                `Agar obunani yangilamasangiz, kanal a'zoligidan chiqarilasiz.\n\n` +
                `Obunani yangilash uchun quyidagi tugmani bosing:`;

            await this.bot.api.sendMessage(
                user.telegramId,
                message,
                { reply_markup: keyboard }
            );

            logger.info(`Sent expiration warning to user ${user.telegramId}`);
        } catch (error) {
            logger.error(`Error sending expiration warning to user ${user.telegramId}:`, error);
        }
    }

    private async handleExpiredUser(user: IUserDocument): Promise<void> {
        try {
            // First unban to clear any existing ban
            await this.bot.api.unbanChatMember(config.CHANNEL_ID, user.telegramId);

            // Then kick them out (ban until current time + 32 seconds)
            // This effectively just removes them from the channel without banning
            const kickUntil = Math.floor(Date.now() / 1000) + 15;
            await this.bot.api.banChatMember(config.CHANNEL_ID, user.telegramId, {
                until_date: kickUntil
            });

            // Update user status
            user.isActive = false;
            user.isKickedOut = true;
            await user.save();

            const keyboard = new InlineKeyboard()
                .text("🎯 Qayta obuna bo'lish", "subscribe")
                .row()
                .text("📊 Obuna holati", "check_status");

            const message = `❌ Sizning obunangiz muddati tugadi va siz kanaldan chiqarildingiz.\n\n` +
                `Qayta obuna bo'lish uchun quyidagi tugmani bosing:`;

            await this.bot.api.sendMessage(
                user.telegramId,
                message,
                { reply_markup: keyboard }
            );

            logger.info(`Handled expired subscription for user ${user.telegramId}`);
        } catch (error) {
            logger.error(`Error handling expired user ${user.telegramId}:`, error);
        }
    }
}