import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiagnosticReport } from '../entities/diagnostic-report.entity';
import { DatabaseRepository } from './db.repository';

@Injectable()
export class DiagnosticReportRepository extends DatabaseRepository<DiagnosticReport> {
  constructor(
    @InjectRepository(DiagnosticReport)
    protected readonly model: Repository<DiagnosticReport>,
  ) {
    super(model);
  }
}
