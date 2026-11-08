import { join } from 'path';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { databaseEntities } from './entities';

export interface DatabaseEnvironment {
  DB_HOST?: string;
  DB_PORT?: string;
  DB_USERNAME?: string;
  DB_PASSWORD?: string;
  DB_DATABASE?: string;
  DB_SYNCHRONIZE?: string;
  DB_LOGGING?: string;
}

export function createDatabaseOptions(
  env: DatabaseEnvironment,
): DataSourceOptions {
  if ((env.DB_SYNCHRONIZE ?? 'false').trim().toLowerCase() === 'true') {
    throw new Error(
      'DB_SYNCHRONIZE must be false. Schema changes are applied only through migrations.',
    );
  }

  const port = Number(env.DB_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('DB_PORT must be a positive integer.');
  }

  return {
    type: 'postgres',
    host: required(env.DB_HOST, 'DB_HOST'),
    port,
    username: required(env.DB_USERNAME, 'DB_USERNAME'),
    password: required(env.DB_PASSWORD, 'DB_PASSWORD'),
    database: required(env.DB_DATABASE, 'DB_DATABASE'),
    synchronize: false,
    logging: (env.DB_LOGGING ?? 'false').trim().toLowerCase() === 'true',
    entities: databaseEntities,
    migrations: [`${join(__dirname, 'migrations').replace(/\\/g, '/')}/*.js`],
    migrationsTableName: 'migrations',
  };
}

export function readDatabaseEnvironment(
  source: DatabaseEnvironment,
): DatabaseEnvironment {
  return {
    DB_HOST: source.DB_HOST,
    DB_PORT: source.DB_PORT,
    DB_USERNAME: source.DB_USERNAME,
    DB_PASSWORD: source.DB_PASSWORD,
    DB_DATABASE: source.DB_DATABASE,
    DB_SYNCHRONIZE: source.DB_SYNCHRONIZE,
    DB_LOGGING: source.DB_LOGGING,
  };
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
}

export function createDataSource(env: DatabaseEnvironment): DataSource {
  return new DataSource(createDatabaseOptions(env));
}
