import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ClickRequest } from "./types/click-request.type";
import { ClickService } from "./click.service";


@Controller('click')
export class ClickController {
    constructor(private readonly clickService: ClickService) { }
    @Post('')
    @HttpCode(HttpStatus.OK)
    async handleMerchantTransactions(@Body() clickReqBody: ClickRequest) {
        return await this.clickService.handleMerchantTransactions(clickReqBody);
    }
}
