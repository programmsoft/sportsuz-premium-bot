import {IUserDocument, UserModel} from '../database/models/user.model';

import logger from '../utils/logger';
import {IPlanDocument} from "../database/models/plans.model";

interface SubscriptionResponse {
    user: IUserDocument;
    wasKickedOut: boolean;
}

export class SubscriptionService {
    async createSubscription(
        userId: string,
        plan: IPlanDocument,
        username?: string,
    ): Promise<SubscriptionResponse> {
        const existingUser = await UserModel.findById(userId).exec();

        if (existingUser) {
            if (!existingUser.isActive) {
                const now = new Date();
                let endDate = new Date();

                if (existingUser.subscriptionEnd > now) {
                    endDate = new Date(existingUser.subscriptionEnd);
                    endDate.setDate(endDate.getDate() + plan.duration);
                } else {

                    endDate.setDate(now.getDate() + plan.duration);
                }

                existingUser.subscriptionStart = now;
                existingUser.subscriptionEnd = endDate;
                existingUser.isActive = true;
                existingUser.plans.push(plan);
                existingUser.isKickedOut = false;
                if (username) {
                    existingUser.username = username;
                }

                const wasKickedOut = existingUser.isKickedOut;
                existingUser.isKickedOut = false;

                const savedUser = await existingUser.save();

                return {
                    user: savedUser,
                    wasKickedOut
                };
            }

            throw new Error('User already has an active subscription');
        }


        const now = new Date();
        const endDate = new Date();
        endDate.setDate(now.getDate() + plan.duration);

        const subscription = new UserModel({
            userId,
            username,
            subscriptionStart: now,
            subscriptionEnd: endDate,
            isActive: true,
            planId: plan.id,
            isKickedOut: false
        });

        const savedUser = await subscription.save();

        return {
            user: savedUser,
            wasKickedOut: false
        };
    }


    async getSubscription(userId: string): Promise<IUserDocument | null> {
        return UserModel.findById(userId).exec();
    }

    async renewSubscription(
        userId: string,
        plan: IPlanDocument
    ): Promise<IUserDocument | null> {
        const subscription = await this.getSubscription(userId);

        if (!subscription) {
            return null;
        }


        const endDate = new Date();
        endDate.setDate(endDate.getDate() + plan.duration);

        subscription.subscriptionEnd = endDate;
        subscription.isActive = true;

        logger.info(`Renewing subscription for user ${userId}`, {plan});
        return await subscription.save();
    }

    async listExpiredSubscriptions(): Promise<IUserDocument[]> {
        const now = new Date();
        logger.info('Checking for expired subscriptions...', {currentTime: now});

        const expiredUsers = await UserModel.find({
            subscriptionEnd: {$lt: now},
            isActive: false,
            isKickedOut: false
        });

        logger.info(`Found ${expiredUsers.length} expired subscriptions`, {
            expiredUsers: expiredUsers.map(user => ({
                userId: user._id,
                endDate: user.subscriptionEnd
            }))
        });

        return expiredUsers;
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

    async cancelSubscription(userId: string): Promise<boolean> {
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