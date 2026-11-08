import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AiModelsModule } from './modules/ai-models/ai-models.module';
import { AuthModule } from './modules/auth/auth.module';
import { DeletionModule } from './modules/deletion/deletion.module';
import { DiagnosticsModule } from './modules/diagnostics/diagnostics.module';
import { LocationsModule } from './modules/locations/locations.module';
import { NavigationModule } from './modules/navigation/navigation.module';
import { OcrModule } from './modules/ocr/ocr.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';
import { VoiceModule } from './modules/voice/voice.module';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      runtimeMetrics: !Boolean(process.versions?.['webcontainer']),
      serviceId: 'nest-typescript-starter',
    }),
    AuthModule,
    UsersModule,
    PreferencesModule,
    LocationsModule,
    AiModelsModule,
    TasksModule,
    DeletionModule,
    DiagnosticsModule,
    NavigationModule,
    OcrModule,
    VoiceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
