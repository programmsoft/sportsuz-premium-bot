import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {ClickRequest} from './types/click-request.type';
import {Transaction, TransactionStatus} from "../../database/models/transactions.model";
import {ClickAction, ClickError} from "./enums";
import {UserModel} from "../../database/models/user.model";
import {Plan} from "../../database/models/plans.model";
import {SubscriptionBot} from "../../bot/bot";
import {generateMD5} from "../../utils/hashing/hasher.helper";
import logger from "../../utils/logger";


@Injectable()
export class ClickService {
    private readonly secretKey: string;
    private readonly botService: SubscriptionBot;


    constructor(
        private readonly configService: ConfigService,
    ) {
        const secretKey = this.configService.get<string>('CLICK_SECRET');
        if (!secretKey) {
            throw new Error('CLICK_SECRET is not defined in the configuration');
        }
        this.secretKey = secretKey;
    }

    async handleMerchantTransactions(clickReqBody: ClickRequest) {
        const actionType = +clickReqBody.action;
        clickReqBody.amount = parseFloat(clickReqBody.amount + '');

        switch (actionType) {
            case ClickAction.Prepare:
                return this.prepare(clickReqBody);
            case ClickAction.Complete:
                return this.complete(clickReqBody);
            default:
                return {
                    error: ClickError.ActionNotFound,
                    error_note: 'Invalid action',
                };
        }
    }

    async prepare(clickReqBody: ClickRequest) {
        console.log("I am being called: prepare method. The first line of the method")
        const planId = clickReqBody.merchant_trans_id;
        const userId = clickReqBody.param2;
        const amount = clickReqBody.amount;
        const transId = clickReqBody.click_trans_id + '';
        const signString = clickReqBody.sign_string;
        const signTime = new Date(clickReqBody.sign_time).toISOString();

        const myMD5Params = {
            clickTransId: transId,
            serviceId: clickReqBody.service_id,
            secretKey: this.secretKey,
            merchantTransId: planId,
            amount: amount,
            action: clickReqBody.action,
            signTime: clickReqBody.sign_time,
        };

        const myMD5Hash = generateMD5(myMD5Params);

        if (signString !== myMD5Hash) {
            return {
                error: ClickError.SignFailed,
                error_note: 'Invalid sign_string',
            };
        }

        const isAlreadyPaid = await Transaction.findOne({
            userId,
            planId,
            status: TransactionStatus.PAID,
        });

        if (isAlreadyPaid) {
            return {
                error: ClickError.AlreadyPaid,
                error_note: 'Already paid',
            };
        }

        const isCancelled = await Transaction.findOne({
            userId,
            planId,
            status: TransactionStatus.CANCELED,
        });

        if (isCancelled) {
            return {
                error: ClickError.TransactionCanceled,
                error_note: 'Cancelled',
            };
        }

        const user = await UserModel.findById(userId);

        if (!user) {
            return {
                error: ClickError.UserNotFound,
                error_note: 'Invalid userId',
            };
        }

        const plan = await Plan.findById(planId);

        if (!plan) {
            return {
                error: ClickError.UserNotFound,
                error_note: 'Product not found',
            };
        }

        if (parseInt(`${amount}`) !== plan.price) {
            console.error('Invalid amount');
            return {
                error: ClickError.InvalidAmount,
                error_note: 'Invalid amount',
            };
        }

        const transaction = await Transaction.findOne({
            transId: transId,
        });

        if (transaction && transaction.status === TransactionStatus.CANCELED) {
            return {
                error: ClickError.TransactionCanceled,
                error_note: 'Transaction canceled',
            };
        }

        const time = new Date().getTime();

        await Transaction.create({
            provider: 'click',
            planId,
            userId,
            signTime,
            transId,
            prepareId: time,
            status: TransactionStatus.PENDING,
            amount: clickReqBody.amount,
            createdAt: new Date(time),
        });

        return {
            click_trans_id: +transId,
            merchant_trans_id: planId,
            merchant_prepare_id: time,
            error: ClickError.Success,
            error_note: 'Success',
        };
    }

    async complete(clickReqBody: ClickRequest) {
        const planId = clickReqBody.merchant_trans_id;
        const userId = clickReqBody.param2;
        const prepareId = clickReqBody.merchant_prepare_id;
        const transId = clickReqBody.click_trans_id + '';
        const serviceId = clickReqBody.service_id;
        const amount = clickReqBody.amount;
        const signTime = clickReqBody.sign_time;
        const error = clickReqBody.error;
        const signString = clickReqBody.sign_string;

        const myMD5Params = {
            clickTransId: transId,
            serviceId,
            secretKey: this.secretKey,
            merchantTransId: planId,
            merchantPrepareId: prepareId,
            amount,
            action: clickReqBody.action,
            signTime,
        };

        const myMD5Hash = generateMD5(myMD5Params);

        if (signString !== myMD5Hash) {
            return {
                error: ClickError.SignFailed,
                error_note: 'Invalid sign_string',
            };
        }

        const user = await UserModel.findById(userId);

        if (!user) {
            return {
                error: ClickError.UserNotFound,
                error_note: 'Invalid userId',
            };
        }

        const plan = await Plan.findById(planId);

        if (!plan) {
            return {
                error: ClickError.UserNotFound,
                error_note: 'Invalid planId',
            };
        }

        const isPrepared = await Transaction.findOne({
            prepareId,
            userId,
            planId,
        });

        if (!isPrepared) {
            return {
                error: ClickError.TransactionNotFound,
                error_note: 'Invalid merchant_prepare_id',
            };
        }

        const isAlreadyPaid = await Transaction.findOne({
            planId,
            prepareId,
            status: TransactionStatus.PAID,
        });

        if (isAlreadyPaid) {
            return {
                error: ClickError.AlreadyPaid,
                error_note: 'Already paid',
            };
        }

        if (parseInt(`${amount}`) !== plan.price) {
            return {
                error: ClickError.InvalidAmount,
                error_note: 'Invalid amount',
            };
        }

        const transaction = await Transaction.findOne({
            transId,
        });

        if (transaction && transaction.status === TransactionStatus.CANCELED) {
            return {
                error: ClickError.TransactionCanceled,
                error_note: 'Already cancelled',
            };
        }

        if (error > 0) {
            await Transaction.findByIdAndUpdate(transId, {
                status: TransactionStatus.CANCELED,
            });
            return {
                error: error,
                error_note: 'Failed',
            };
        }

        // update payment status
        await Transaction.findByIdAndUpdate(transId, {
            status: TransactionStatus.PAID,
        });

        const startDate = new Date();
        const endDate = new Date(new Date().setDate(new Date().getDate() + plan.duration));

        // Add plan to user's plans array
        await UserModel.findByIdAndUpdate(userId, {
            $push: {plans: planId},
            subscriptionStart: startDate,
            subscriptionEnd: endDate,
            isActive: true,
        });


        console.log("WATCH: FROM CLICK complete method: ")
        if (transaction) {
            try {
                const user = await UserModel.findById(transaction.userId).exec();
                if (user) {
                    await this.botService.handlePaymentSuccess(
                        transaction.userId.toString(),
                        user.telegramId,
                        user.username
                    );
                }
            } catch (error) {
                logger.error('Error handling payment success:', error);
                // Continue with the response even if notification fails
            }
        }

        return {
            click_trans_id: +transId,
            merchant_trans_id: planId,
            error: ClickError.Success,
            error_note: 'Success',
        };
    }
}