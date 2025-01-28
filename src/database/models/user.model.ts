import mongoose, {Document, Schema} from 'mongoose';
import {SubscriptionType} from "@/config";

export interface IUserDocument extends Document {
    userId: number;
    username?: string;
    subscriptionStart: Date;
    subscriptionEnd: Date;
    isActive: boolean;
    subscriptionType: SubscriptionType;
    isKickedOut: boolean;  // New field
}

const userSchema = new Schema({
    userId: {type: Number, required: true, unique: true},
    username: {type: String},
    subscriptionStart: {type: Date, required: true},
    subscriptionEnd: {type: Date, required: true},
    isActive: {type: Boolean, default: true},
    subscriptionType: {type: String, required: true},
    isKickedOut: {type: Boolean, default: false}  // New field
});

userSchema.index({userId: 1, isActive: 1});
userSchema.index({subscriptionEnd: 1});

export const UserModel = mongoose.model<IUserDocument>('User', userSchema);
