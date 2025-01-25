import mongoose, { Schema, Document } from 'mongoose';
import { UserSubscription } from '../../types';

export interface IUserDocument extends UserSubscription, Document { }

const userSchema = new Schema({
    userId: { type: Number, required: true, unique: true },
    username: { type: String },
    subscriptionStart: { type: Date, required: true },
    subscriptionEnd: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    subscriptionType: {
        type: String,
        enum: ['basic', 'premium', 'standard'],
        default: 'basic',
        required: true
    }
}, {
    timestamps: true
});

userSchema.index({ userId: 1, isActive: 1 });
userSchema.index({ subscriptionEnd: 1 });

export const UserModel = mongoose.model<IUserDocument>('User', userSchema);
