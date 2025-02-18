import {ConfigService} from '@nestjs/config';

export type ClickRedirectParams = {
    amount: number;
    planId: string;
    userId: string;
};
const CLICK_URL = `https://my.click.uz`;
const BOT_URL = 'https://t.me/sportsuz_premium_bot';

export function getClickRedirectLink(params: ClickRedirectParams) {
    const configService = new ConfigService();
    const serviceId = configService.get<number>('CLICK_SERVICE_ID');
    const merchantId = configService.get<string>('CLICK_MERCHANT_ID');


    console.log('CLICK_URL:', CLICK_URL);
    console.log('BOT_URL:', BOT_URL);
    console.log('params:', params);
    console.log('serviceId:', serviceId);
    console.log('merchantId:', merchantId);
    console.log('amount:', params.amount);
    console.log('planId:', params.planId);
    console.log('userId:', params.userId);


    return `${CLICK_URL}/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${params.amount}&transaction_param=${params.planId}&return_url=${BOT_URL}`;
}

// &return_url=https://t.me/sportsuz_premium_bot