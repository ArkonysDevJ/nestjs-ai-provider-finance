// src/health/health.controller.ts
// [F-ID: SRC-HEALTH-CONTROLLER-01]
// @version 1.0.0
// @changelog 1.0.0 — GET /v1/health. Deliberately unauthenticated: it
//   exists to be pinged by an unattended scheduler
//   (.github/workflows/keep-alive.yml) every few days, purely to
//   generate real database activity and keep the free-tier Supabase
//   project from auto-pausing after ~7 days of inactivity. See
//   HealthService for why a JWT would be the wrong fit here. Returns
//   503 (not a thrown 500) on a real DB failure, so an external
//   `curl -f` correctly reports the check as failed.

import {
  Controller,
  Get,
  HttpCode,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HealthService, HealthStatus } from './health.service';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(200)
  async check(): Promise<HealthStatus> {
    try {
      return await this.healthService.check();
    } catch (error) {
      this.logger.error('Database unreachable', error as Error);
      throw new ServiceUnavailableException('Database unreachable');
    }
  }
}
