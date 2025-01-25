import { SubscriptionPlan } from '@/types';
import dotenv from 'dotenv';
import { cleanEnv, str } from 'envalid';

dotenv.config();

export const config = cleanEnv(process.env, {
    BOT_TOKEN: str(),
    MONGODB_URI: str(),
    CHANNEL_ID: str(),
    NODE_ENV: str({ choices: ['development', 'production'], default: 'development' })
});

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
    basic: {
        type: 'basic',
        durationInDays: 30,
        price: 10
    },
    standard: {
        type: 'standard',
        durationInDays: 30,
        price: 10
    },
    premium: {
        type: 'premium',
        durationInDays: 30,
        price: 20
    }
};