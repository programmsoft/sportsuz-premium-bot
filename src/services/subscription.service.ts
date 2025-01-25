import { UserModel, IUserDocument } from '../database/models/user.model';
import { SUBSCRIPTION_PLANS } from '../config';
import logger from '../utils/logger';

export class SubscriptionService {
    async createSubscription(
        userId: number,
        username?: string,
        planType: 'basic' | 'standard' | 'premium' = 'basic'
    ): Promise<IUserDocument> {
        const plan = SUBSCRIPTION_PLANS[planType];
        const now = new Date();
        const endDate = new Date();
        endDate.setDate(now.getDate() + plan.durationInDays);

        const subscription = new UserModel({
            userId,
            username,
            subscriptionStart: now,
            subscriptionEnd: endDate,
            isActive: true,
            subscriptionType: planType
        });

        logger.info(`Creating new subscription for user ${userId}`, { planType });
        return await subscription.save();
    }

    async getSubscription(userId: number): Promise<IUserDocument | null> {
        return await UserModel.findOne({ userId });
    }

    async canAccessMessage(userId: number, messageDate: Date): Promise<boolean> {
        const subscription = await this.getSubscription(userId);

        if (!subscription || !subscription.isActive) {
            return false;
        }

        return messageDate <= subscription.subscriptionEnd;
    }

    async renewSubscription(
        userId: number,
        planType?: 'basic' | 'premium'
    ): Promise<IUserDocument | null> {
        const subscription = await this.getSubscription(userId);

        if (!subscription) {
            return null;
        }

        const plan = SUBSCRIPTION_PLANS[planType || subscription.subscriptionType];
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + plan.durationInDays);

        subscription.subscriptionEnd = endDate;
        subscription.isActive = true;
        if (planType) {
            subscription.subscriptionType = planType;
        }

        logger.info(`Renewing subscription for user ${userId}`, { planType });
        return await subscription.save();
    }

    async listExpiredSubscriptions(): Promise<IUserDocument[]> {
        const now = new Date();
        return await UserModel.find({
            subscriptionEnd: { $lt: now },
            isActive: true
        });
    }

    async deactivateExpiredSubscriptions(): Promise<void> {
        const now = new Date();
        await UserModel.updateMany(
            {
                subscriptionEnd: { $lt: now },
                isActive: true
            },
            {
                $set: { isActive: false }
            }
        );
    }

}