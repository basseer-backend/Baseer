import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { createDataSource, readDatabaseEnvironment } from './database-options';

loadEnv({ path: resolve(__dirname, '../../config/.env.dev') });

export default createDataSource(readDatabaseEnvironment(process.env));
