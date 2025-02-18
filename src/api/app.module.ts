import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {PaymeModule} from "../payment-providers/payme/payme.module";
import {ClickModule} from "../payment-providers/click/click.module";

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        PaymeModule,
        ClickModule,
    ],
})
export class AppModule {}