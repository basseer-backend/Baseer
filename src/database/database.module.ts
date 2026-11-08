
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  createDatabaseOptions,
  readDatabaseEnvironment,
} from './database-options';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'config/.env.dev',
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createDatabaseOptions(
          readDatabaseEnvironment({
            DB_HOST: config.get<string>('DB_HOST'),
            DB_PORT: config.get<string>('DB_PORT'),
            DB_USERNAME: config.get<string>('DB_USERNAME'),
            DB_PASSWORD: config.get<string>('DB_PASSWORD'),
            DB_DATABASE: config.get<string>('DB_DATABASE'),
            DB_SYNCHRONIZE: config.get<string>('DB_SYNCHRONIZE'),
            DB_LOGGING: config.get<string>('DB_LOGGING'),
          }),
        ),
    }),
  ],
})
export class DatabaseModule {}
