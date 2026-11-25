import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { DeletionStatus } from './deletion.constants';
import { DeletionController } from './deletion.controller';
import { DeletionService } from './deletion.service';
import { CreateDeletionRequestDto } from './dto/create-deletion-request.dto';

describe('DeletionController', () => {
  let controller: DeletionController;
  let service: {
    createRequest: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
  };

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockRequestId = '22222222-2222-2222-2222-222222222222';
  const mockIdempotencyKey = 'client-key-abc';
  const mockCapability =
    '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

  beforeEach(() => {
    service = {
      createRequest: vi.fn(),
      getStatus: vi.fn(),
    };
    controller = new DeletionController(
      service as unknown as DeletionService,
    );
  });

  describe('create (POST /api/v1/deletion/requests)', () => {
    it('returns 201 CREATED for new deletion request with one-time capability secret', async () => {
      const mockAcceptedAt = new Date('2026-11-22T20:00:00Z');
      service.createRequest.mockResolvedValueOnce({
        isNew: true,
        data: {
          id: mockRequestId,
          status: DeletionStatus.ACCEPTED,
          capability: mockCapability,
          acceptedAt: mockAcceptedAt,
        },
      });

      const mockRes = {
        status: vi.fn().mockReturnThis(),
      } as unknown as Response;

      const dto: CreateDeletionRequestDto = {};
      const response = await controller.create(
        mockUserId,
        mockIdempotencyKey,
        mockRes,
        dto,
      );

      expect(service.createRequest).toHaveBeenCalledWith(
        mockUserId,
        mockIdempotencyKey,
      );
      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(response.id).toBe(mockRequestId);
      expect(response.status).toBe(DeletionStatus.ACCEPTED);
      expect(response.capability).toBe(mockCapability);
      expect(response.acceptedAt).toBe(mockAcceptedAt);
    });

    it('returns 200 OK for duplicate request with null capability', async () => {
      const mockAcceptedAt = new Date('2026-11-22T20:00:00Z');
      service.createRequest.mockResolvedValueOnce({
        isNew: false,
        data: {
          id: mockRequestId,
          status: DeletionStatus.ACCEPTED,
          capability: null, // Capability secret omitted
          acceptedAt: mockAcceptedAt,
        },
      });

      const mockRes = {
        status: vi.fn().mockReturnThis(),
      } as unknown as Response;

      const response = await controller.create(
        mockUserId,
        mockIdempotencyKey,
        mockRes,
        {},
      );

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(response.id).toBe(mockRequestId);
      expect(response.capability).toBeNull();
    });
  });

  describe('getStatus (GET /api/v1/deletion/requests/:id)', () => {
    it('retrieves deletion status without user authentication', async () => {
      const mockAcceptedAt = new Date('2026-11-22T20:00:00Z');
      const mockCompletedAt = new Date('2026-11-22T20:00:05Z');

      service.getStatus.mockResolvedValueOnce({
        id: mockRequestId,
        status: DeletionStatus.COMPLETED,
        stageStatus: {
          revoke_sessions: 'COMPLETED',
        },
        acceptedAt: mockAcceptedAt,
        completedAt: mockCompletedAt,
        failureCode: null,
      });

      const response = await controller.getStatus(
        mockRequestId,
        mockCapability,
      );

      expect(service.getStatus).toHaveBeenCalledWith(
        mockRequestId,
        mockCapability,
      );
      expect(response.id).toBe(mockRequestId);
      expect(response.status).toBe(DeletionStatus.COMPLETED);
      expect(response.completedAt).toBe(mockCompletedAt);
    });
  });
});
