import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import morgan from "morgan";
import {ConfigService} from "@nestjs/config";

export async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const configService: ConfigService = app.get(ConfigService);

    app.enableCors();

    app.setGlobalPrefix('api');

    app.use(morgan('dev'));

    const PORT =  configService.get<string>('APP_PORT') || 3000;
    await app.listen(PORT);
    console.log(`Application is running on: ${await app.getUrl()}`);
}