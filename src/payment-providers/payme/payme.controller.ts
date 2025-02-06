import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { PaymeService } from './payme.service';
import { RequestBody } from './types/incoming-request-body';
import {PaymeBasicAuthGuard} from "./auth/guards/payme.guard";

@Controller('payme')
export class PaymeController {
  constructor(private readonly paymeService: PaymeService) {}

  @Post()
  @UseGuards(PaymeBasicAuthGuard)
  @HttpCode(HttpStatus.OK)
  async handleTransactionMethods(@Body() reqBody: RequestBody) {
    console.log("I am being called with reqBody:", reqBody);
    const result = await this.paymeService.handleTransactionMethods(reqBody);

    console.log("The result is:", result);
    return result;
  }
}
