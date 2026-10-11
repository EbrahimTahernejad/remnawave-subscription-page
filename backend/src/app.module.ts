import { Module } from '@nestjs/common';
import { ConditionalModule } from '@nestjs/config';

import { AxiosModule } from '@common/axios/axios.module';
import { AppConfigModule } from '@common/config/app-config/app-config.module';

import { HwidModule } from '@modules/hwid/hwid.module';
import { MarzbanModule } from '@modules/marzban/marzban.module';
import { SubscriptionModule } from '@modules/subscription/subscription.module';
import { WebpageModule } from '@modules/webpage/webpage.module';

@Module({
    imports: [
        AppConfigModule,
        AxiosModule,
        WebpageModule,
        HwidModule,
        ConditionalModule.registerWhen(MarzbanModule, 'MARZBAN_LEGACY_LINK_ENABLED'),
        SubscriptionModule,
    ],
})
export class AppModule {}
