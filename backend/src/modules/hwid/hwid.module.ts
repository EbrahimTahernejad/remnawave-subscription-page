import cookieParser from 'cookie-parser';

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { getJWTConfig } from '@common/config/jwt/jwt.config';

import { HwidController } from './hwid.controller';
import { HwidService } from './hwid.service';

@Module({
    imports: [JwtModule.registerAsync(getJWTConfig())],
    controllers: [HwidController],
    providers: [HwidService],
})
export class HwidModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        // cookie-parser is only mounted on /assets globally; these routes need the session cookie.
        consumer.apply(cookieParser()).forRoutes(HwidController);
    }
}
