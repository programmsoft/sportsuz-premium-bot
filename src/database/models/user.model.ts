import mongoose, {Document, Schema} from 'mongoose';
import {IPlanDocument} from "./plans.model";

export interface IUserDocument extends Document {
    telegramId: number;
    username?: string;
    subscriptionStart: Date;
    subscriptionEnd: Date;
    isActive: boolean;
    plans: IPlanDocument[];
    isKickedOut: boolean;
}

const userSchema = new Schema({
    telegramId: {type: Number, required: true, unique: true},
    username: {type: String},
    subscriptionStart: {type: Date, required: false},
    subscriptionEnd: {type: Date, required: false},
    isActive: {type: Boolean, default: false},
    plans: [{type: Schema.Types.ObjectId, ref: 'Plan'}],
    isKickedOut: {type: Boolean, default: false}
});

userSchema.index({ telegramId: 1, isActive: 1});
userSchema.index({subscriptionEnd: 1});

export const UserModel = mongoose.model<IUserDocument>('User', userSchema);
