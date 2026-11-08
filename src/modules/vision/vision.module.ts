import { Module } from '@nestjs/common';
import { VisionController } from './vision.controller.js';

@Module({
  controllers: [VisionController],
})
export class VisionModule {}
