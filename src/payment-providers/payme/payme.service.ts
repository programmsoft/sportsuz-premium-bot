import { Injectable } from '@nestjs/common';
import { TransactionMethods } from './constants/transaction-methods';
import { CheckPerformTransactionDto } from './dto/check-perform-transaction.dto';
import { RequestBody } from './types/incoming-request-body';
import { GetStatementDto } from './dto/get-statement.dto';
import { CancelTransactionDto } from './dto/cancel-transaction.dto';
import { PerformTransactionDto } from './dto/perform-transaction.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ErrorStatusCodes } from './constants/error-status-codes';
import { TransactionState } from './constants/transaction-state';
import { CheckTransactionDto } from './dto/check-transaction.dto';
import { PaymeError } from './constants/payme-error';
import { CancelingReasons } from './constants/canceling-reasons';
import {UserModel as userModel} from "../../database/models/user.model";
import {Plan as planModel} from "../../database/models/plans.model";
import {Transaction as transactionModel} from "../../database/models/transactions.model";
import {ValidationHelper} from "../../utils/validation.helper";

@Injectable()
export class PaymeService {
  constructor() {}

  async handleTransactionMethods(reqBody: RequestBody) {
    console.log("WATCH the request body: ", reqBody)
    const method = reqBody.method;
    console.log("WATCH! the method is: ", method);
    switch (method) {
      case TransactionMethods.CheckPerformTransaction:
        return await this.checkPerformTransaction(
            reqBody as CheckPerformTransactionDto,
        );

      case TransactionMethods.CreateTransaction:
        return await this.createTransaction(reqBody as CreateTransactionDto);

      case TransactionMethods.CheckTransaction:
        return await this.checkTransaction(
            reqBody as unknown as CheckTransactionDto,
        );

      case TransactionMethods.PerformTransaction:
        return await this.performTransaction(reqBody as PerformTransactionDto);

      case TransactionMethods.CancelTransaction:
        return await this.cancelTransaction(reqBody as CancelTransactionDto);

      case TransactionMethods.GetStatement:
        return await this.getStatement(reqBody as GetStatementDto);
      default:
        return 'Invalid transaction method';
    }
  }

  async checkPerformTransaction(
      checkPerformTransactionDto: CheckPerformTransactionDto,
  ) {
    const planId = checkPerformTransactionDto.params?.account?.plan_id;
    const userId = checkPerformTransactionDto.params?.account?.user_id;

    if (!ValidationHelper.isValidObjectId(planId)) {
      return {
        error: {
          code: ErrorStatusCodes.TransactionNotAllowed,
          message: {
            uz: 'Sizda mahsulot/foydalanuvchi topilmadi',
            en: 'Product/user not found',
            ru: 'Товар/пользователь не найден',
          },
          data: null,
        },
      };
    }

    if (!ValidationHelper.isValidObjectId(userId)) {
      return {
        error: {
          code: ErrorStatusCodes.TransactionNotAllowed,
          message: {
            uz: 'Sizda mahsulot/foydalanuvchi topilmadi',
            en: 'Product/user not found',
            ru: 'Товар/пользователь не найден',
          },
          data: null,
        },
      };
    }


    const plan = await planModel.findById(planId).exec();
    const user = await userModel.findById(userId).exec();
    console.log("WATCH! the plan is: ", plan);
    console.log("WATCH! the user is: ", user);



    if (!plan || !user) {
      return {
        error: {
          code: ErrorStatusCodes.TransactionNotAllowed,
          message: {
            uz: 'Sizda mahsulot/foydalanuvchi topilmadi',
            en: 'Product/user not found',
            ru: 'Товар/пользователь не найден',
          },
          data: null,
        },
      };
    }

    if (plan.price !== checkPerformTransactionDto.params.amount) {
      return {
        error: PaymeError.InvalidAmount,
      };
    }
    return {
      result: {
        allow: true,
      },
    };
  }

  async createTransaction(createTransactionDto: CreateTransactionDto) {
    const planId = createTransactionDto.params?.account?.plan_id;
    const userId = createTransactionDto.params?.account?.user_id;
    const transId = createTransactionDto.params?.id;

    if (!ValidationHelper.isValidObjectId(planId)) {
      return {
        error: PaymeError.ProductNotFound,
        id: transId,
      };
    }

    if (!ValidationHelper.isValidObjectId(userId)) {
      return {
        error: PaymeError.UserNotFound,
        id: transId,
      };
    }

    const plan = await planModel.findById(planId).exec();
    const user = await userModel.findById(userId).exec();

    if (!user) {
      return {
        error: PaymeError.UserNotFound,
        id: transId,
      };
    }

    if (!plan) {
      return {
        error: PaymeError.ProductNotFound,
        id: transId,
      };
    }

    if (createTransactionDto.params.amount !== plan.price) {
      return {
        error: PaymeError.InvalidAmount,
        id: transId,
      };
    }

    const existingActiveTransaction = await transactionModel.findOne({
      userId: userId,
      planId: planId,
      status: { $in: ['PENDING', 'PAID'] }  // Check for any active transactions
    }).exec();

    if (existingActiveTransaction) {
      return {
        error: PaymeError.Pending,
        id: transId
      };
    }

    const transaction = await transactionModel.findOne({ transId }).exec();

    if (transaction) {
      if (transaction.status !== 'PENDING') {
        return {
          error: PaymeError.CantDoOperation,
          id: transId,
        };
      }

      if (this.checkTransactionExpiration(transaction.createdAt)) {
        await transactionModel.findOneAndUpdate(
            { transId },
            {
              status: 'CANCELED',
              cancelTime: new Date(),
              state: TransactionState.PendingCanceled,
              reason: CancelingReasons.CanceledDueToTimeout,
            },
        ).exec();

        return {
          error: {
            ...PaymeError.CantDoOperation,
            state: TransactionState.PendingCanceled,
            reason: CancelingReasons.CanceledDueToTimeout,
          },
          id: transId,
        };
      }

      return {
        result: {
          transaction: transaction.id,
          state: TransactionState.Pending,
          create_time: new Date(transaction.createdAt).getTime(),
        },
      };
    }

    const checkTransaction: CheckPerformTransactionDto = {
      method: TransactionMethods.CheckPerformTransaction,
      params: {
        amount: plan.price,
        account: {
          plan_id: planId,
          user_id: userId,
        },
      },
    };

    const checkResult = await this.checkPerformTransaction(checkTransaction);

    if (checkResult.error) {
      return {
        error: checkResult.error,
        id: transId,
      };
    }

    const newTransaction = await transactionModel.create({
      transId: createTransactionDto.params.id,
      userId: createTransactionDto.params.account.user_id,
      planId: createTransactionDto.params.account.plan_id,
      provider: 'payme',
      state: TransactionState.Pending,
      amount: createTransactionDto.params.amount,
    });

    return {
      result: {
        transaction: newTransaction.id,
        state: TransactionState.Pending,
        create_time: new Date(newTransaction.createdAt).getTime(),
      },
    };
  }

  async performTransaction(performTransactionDto: PerformTransactionDto) {
    const transaction = await transactionModel
        .findOne({ transId: performTransactionDto.params.id })
        .exec();

    if (!transaction) {
      return {
        error: PaymeError.TransactionNotFound,
        id: performTransactionDto.params.id,
      };
    }

    if (transaction.status !== 'PENDING') {
      if (transaction.status !== 'PAID') {
        return {
          error: PaymeError.CantDoOperation,
          id: performTransactionDto.params.id,
        };
      }

      return {
        result: {
          state: transaction.state,
          transaction: transaction.id,
          perform_time: transaction.performTime ? new Date(transaction.performTime).getTime() : null,
        },
      };
    }

    const expirationTime = this.checkTransactionExpiration(
        transaction.createdAt,
    );

    if (expirationTime) {
      await transactionModel
          .findOneAndUpdate(
              { transId: performTransactionDto.params.id },
              {
                status: 'CANCELED',
                cancelTime: new Date(),
                state: TransactionState.PendingCanceled,
                reason: CancelingReasons.CanceledDueToTimeout,
              },
          )
          .exec();

      return {
        error: {
          state: TransactionState.PendingCanceled,
          reason: CancelingReasons.CanceledDueToTimeout,
          ...PaymeError.CantDoOperation,
        },
        id: performTransactionDto.params.id,
      };
    }

    // TODO: Implement perform transaction for your service here
    console.log("Payment successfully performed!!!");

    const performTime = new Date();

    const updatedPayment = await transactionModel
        .findOneAndUpdate(
            { transId: performTransactionDto.params.id },
            {
              status: 'PAID',
              state: TransactionState.Paid,
              performTime,
            },
            { new: true },
        )
        .exec();

    return {
      result: {
        transaction: updatedPayment?.id,
        perform_time: performTime.getTime(),
        state: TransactionState.Paid,
      },
    };
  }

  async cancelTransaction(cancelTransactionDto: CancelTransactionDto) {
    const transId = cancelTransactionDto.params.id;

    const transaction = await transactionModel
        .findOne({ transId })
        .exec();

    if (!transaction) {
      return {
        id: transId,
        error: PaymeError.TransactionNotFound,
      };
    }

    if (transaction.status === 'PENDING') {
      const cancelTransaction = await transactionModel
          .findByIdAndUpdate(
              transaction.id,
              {
                status: 'CANCELED',
                state: TransactionState.PendingCanceled,
                cancelTime: new Date(),
                reason: cancelTransactionDto.params.reason,
              },
              { new: true },
          )
          .exec();

      return {
        result: {
          cancel_time: cancelTransaction?.cancelTime?.getTime(),
          transaction: cancelTransaction?.id,
          state: TransactionState.PendingCanceled,
        },
      };
    }

    if (transaction.state !== TransactionState.Paid) {
      return {
        result: {
          state: transaction.state,
          transaction: transaction.id,
          cancel_time: transaction.cancelTime?.getTime(),
        },
      };
    }

    // TODO: Implement cancel transaction for your service here
    console.log("Payment successfully canceled!!!");


    const updatedTransaction = await transactionModel
        .findByIdAndUpdate(
            transaction.id,
            {
              status: 'CANCELED',
              state: TransactionState.PaidCanceled,
              cancelTime: new Date(),
              reason: cancelTransactionDto.params.reason,
            },
            { new: true },
        )
        .exec();

    return {
      result: {
        cancel_time: updatedTransaction?.cancelTime?.getTime(),
        transaction: updatedTransaction?.id,
        state: TransactionState.PaidCanceled,
      },
    };
  }

  async checkTransaction(checkTransactionDto: CheckTransactionDto) {
    const transaction = await transactionModel
        .findOne({ transId: checkTransactionDto.params.id })
        .exec();

    if (!transaction) {
      return {
        error: PaymeError.TransactionNotFound,
        id: checkTransactionDto.params.id,
      };
    }

    return {
      result: {
        create_time: transaction.createdAt.getTime(),
        perform_time: transaction.performTime ? new Date(transaction.performTime).getTime() : 0,
        cancel_time:transaction.cancelTime ? new Date(transaction.cancelTime).getTime() : 0,
        transaction: transaction.id,
        state: transaction.state,
        reason: transaction.reason ?? null,
      },
    };
  }

  async getStatement(getStatementDto: GetStatementDto) {
    const transactions = await transactionModel
        .find({
          createdAt: {
            $gte: new Date(getStatementDto.params.from),
            $lte: new Date(getStatementDto.params.to),
          },
          provider: 'payme',
        })
        .exec();

    return {
      result: {
        transactions: transactions.map((transaction) => {
          return {
            id: transaction.transId,
            time: new Date(transaction.createdAt).getTime(),
            amount: transaction.amount,
            account: {
              user_id: transaction.userId,
              planId: transaction.planId,
            },
            create_time: new Date(transaction.createdAt).getTime(),
            perform_time: transaction.performTime ? new Date(transaction.performTime).getTime() : null,
            cancel_time:transaction.cancelTime ? new Date(transaction.cancelTime).getTime() : null,
            transaction: transaction.id,
            state: transaction.state,
            reason: transaction.reason || null,
          };
        }),
      },
    };
  }

  private checkTransactionExpiration(createdAt: Date) {
    const transactionCreatedAt = new Date(createdAt);
    const timeoutDuration = 720 * 60 * 1000; // 720 minutes converted to milliseconds
    const timeoutThreshold = new Date(Date.now() - timeoutDuration);

    return transactionCreatedAt < timeoutThreshold;
  }
}