import {IUserDocument, UserModel} from '../database/models/user.model';
import {SUBSCRIPTION_PLANS, SubscriptionType} from '../config';
import logger from '../utils/logger';

export class SubscriptionService {
    async createSubscription(
        userId: number,
        planType: SubscriptionType,
        username?: string,
    ): Promise<IUserDocument> {
        // First check if user already exists
        const existingUser = await UserModel.findOne({userId});

        if (existingUser) {
            // If user exists but subscription is not active, handle renewal
            if (!existingUser.isActive) {
                const now = new Date();
                let endDate = new Date();

                // If same plan type and subscription hasn't expired yet
                if (existingUser.subscriptionType === planType && existingUser.subscriptionEnd > now) {
                    // Continue from the previous end date
                    endDate = new Date(existingUser.subscriptionEnd);
                    endDate.setDate(endDate.getDate() + SUBSCRIPTION_PLANS[planType].duration);
                } else {
                    // Different plan type or expired subscription - start fresh
                    const plan = SUBSCRIPTION_PLANS[planType];
                    endDate.setDate(now.getDate() + plan.duration);
                }

                existingUser.subscriptionStart = now;
                existingUser.subscriptionEnd = endDate;
                existingUser.isActive = true;
                existingUser.subscriptionType = planType;
                if (username) {
                    existingUser.username = username;
                }

                logger.info(`Reactivating subscription for existing user ${userId}`, {
                    planType,
                    continuedFromPrevious: existingUser.subscriptionType === planType && existingUser.subscriptionEnd > now
                });
                return await existingUser.save();
            }

            // If user exists and subscription is active, throw error
            logger.info(`User ${userId} already has an active subscription`);
            throw new Error('User already has an active subscription');
        }

        // If user doesn't exist, create new subscription
        const plan = SUBSCRIPTION_PLANS[planType];
        const now = new Date();
        const endDate = new Date();
        endDate.setDate(now.getDate() + plan.duration);

        const subscription = new UserModel({
            userId,
            username,
            subscriptionStart: now,
            subscriptionEnd: endDate,
            isActive: true,
            subscriptionType: planType
        });

        logger.info(`Creating new subscription for user ${userId}`, {planType});
        return await subscription.save();
    }

    async getSubscription(userId: number): Promise<IUserDocument | null> {
        return await UserModel.findOne({userId});
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
        planType?: SubscriptionType
    ): Promise<IUserDocument | null> {
        const subscription = await this.getSubscription(userId);

        if (!subscription) {
            return null;
        }

        const plan = SUBSCRIPTION_PLANS[planType || subscription.subscriptionType];
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + plan.duration);

        subscription.subscriptionEnd = endDate;
        subscription.isActive = true;
        if (planType) {
            subscription.subscriptionType = planType;
        }

        logger.info(`Renewing subscription for user ${userId}`, {planType});
        return await subscription.save();
    }

    async listExpiredSubscriptions(): Promise<IUserDocument[]> {
        const now = new Date();
        return await UserModel.find({
            subscriptionEnd: {$lt: now},
            isActive: true
        });
    }

    async deactivateExpiredSubscriptions(): Promise<void> {
        const now = new Date();
        await UserModel.updateMany(
            {
                subscriptionEnd: {$lt: now},
                isActive: true
            },
            {
                $set: {isActive: false}
            }
        );
    }

    async cancelSubscription(userId: number): Promise<boolean> {
        try {
            const subscription = await this.getSubscription(userId);

            if (!subscription || !subscription.isActive) {
                logger.info(`No active subscription found for user ${userId}.`);
                return false;
            }

            subscription.isActive = false;
            // subscription.subscriptionEnd = new Date(); // buni o'zgartirmaymiz chunki allaqachon pul to'lagan

            await subscription.save();

            logger.info(`Subscription for user ${userId} has been canceled.`);
            return true;
        } catch (error) {
            logger.error(`Failed to cancel subscription for user ${userId}:`, error);
            return false;
        }
    }


}