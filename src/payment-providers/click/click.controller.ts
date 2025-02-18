import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ClickRequest } from "./types/click-request.type";
import { ClickService } from "./click.service";


@Controller('click')
export class ClickController {
    constructor(private readonly clickService: ClickService) {
        console.log('ClickController initialized');
    }
    @Post('')
    @HttpCode(HttpStatus.OK)
    async handleMerchantTransactions(@Body() clickReqBody: ClickRequest) {
        console.log("WATCH click controller: click is being used")

        console.log("Received Click request:", {
            method: 'POST',
            path: '/api/click',
            body: clickReqBody
        });
        return await this.clickService.handleMerchantTransactions(clickReqBody);
    }
}
