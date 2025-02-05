import {config} from "../../config";

export type PaymeLinkGeneratorParams = {
    planId: string;
    userId: string;
    amount: number;
}


const PAYME_CHECKOUT_URL='https://checkout.paycom.uz';

export function generatePaymeLink(params: PaymeLinkGeneratorParams): string {
    const merchantId = config.PAYME_MERCHANT_ID;
    const encodedParams = base64Encode(`m=${merchantId};ac.plan_id=${params.planId};ac.user_id=${params.userId};a=${params.amount}`);
    return `${PAYME_CHECKOUT_URL}/${encodedParams}`;
}

function base64Encode(input: string): string {
    return Buffer.from(input).toString('base64');
}