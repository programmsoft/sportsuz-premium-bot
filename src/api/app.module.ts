import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {PaymeModule} from "../payment-providers/payme/payme.module";

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        PaymeModule
    ],
})
export class AppModule {}