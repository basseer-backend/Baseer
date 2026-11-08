import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiagnosticReport } from '../../database/entities/diagnostic-report.entity';
import { DiagnosticReportRepository } from '../../database/repositories/diagnostic-report.repository';

@Module({
  imports: [TypeOrmModule.forFeature([DiagnosticReport])],
  providers: [DiagnosticReportRepository],
  exports: [DiagnosticReportRepository],
})
export class DiagnosticsModule {}
