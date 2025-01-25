export interface UserSubscription {
    userId: number;
    username?: string;
    subscriptionStart: Date;
    subscriptionEnd: Date;
    isActive: boolean;
    subscriptionType: 'basic' | 'premium' | 'standard';
}

export interface SubscriptionPlan {
    type: 'basic' | 'standard' | 'premium';
    durationInDays: number;
    price: number;
}