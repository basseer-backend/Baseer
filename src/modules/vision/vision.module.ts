import { Module } from '@nestjs/common';
import { VisionController } from './vision.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  controllers: [VisionController],
  providers: [JwtAuthGuard],
})
export class VisionModule {}
