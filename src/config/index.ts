import dotenv from 'dotenv';
import {cleanEnv, str} from 'envalid';

export interface SubscriptionPlan {
    price: number;
    duration: number;
    name: string;
}

export type SubscriptionType = 'basic' | 'standard' | 'premium';

export const SUBSCRIPTION_PLANS: Record<SubscriptionType, SubscriptionPlan> = {
    basic: {price: 1000, duration: 30, name: 'Basic'},
    standard: {price: 5000, duration: 90, name: 'Standard'},
    premium: {price: 15000, duration: 360, name: 'Premium'}
};

dotenv.config();

export const config = cleanEnv(process.env, {
    BOT_TOKEN: str(),
    MONGODB_URI: str(),
    CHANNEL_ID: str(),
    NODE_ENV: str({choices: ['development', 'production'], default: 'development'})
});
