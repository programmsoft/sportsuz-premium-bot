import mongoose from 'mongoose';

export const PaymentProvider = {
    PAYME: 'payme',
    UZUM: 'uzum',
    CLICK: 'click'
};

export const TransactionStatus = {
    PENDING: 'PENDING',
    CREATED: 'CREATED',
    PAID: 'PAID',
    CANCELED: 'CANCELED'
};

export const transactionSchema = new mongoose.Schema({
    provider: {
        type: String,
        enum: Object.values(PaymentProvider),
        required: true
    },
    transId: {
        type: String,
        unique: true,
        sparse: true
    },
    amount: {
        type: Number,
        required: true
    },
    prepareId: Number,
    performTime: Date,
    cancelTime: Date,
    reason: Number,
    state: Number,
    status: {
        type: String,
        enum: Object.values(TransactionStatus),
        default: TransactionStatus.PENDING
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plan',
        required: true
    }
}, {
    timestamps: true
});

export const Transaction = mongoose.model('Transaction', transactionSchema);
