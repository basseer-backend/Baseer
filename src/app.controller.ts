import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApiOkEnvelope } from './common/decorators/swagger.decorator.js';
import { HealthCheckDto } from './common/dto/health-check.dto.js';

@ApiTags('System & Health')
@Controller('health')
export class AppController {
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Health check endpoint to verify server status' })
  @ApiOkEnvelope(HealthCheckDto)
  getHealth(): HealthCheckDto {
    return {
      status: 'ok',
      message: 'Baseer API is healthy and operational',
    };
  }
}
