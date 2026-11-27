import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoiceController } from './voice.controller';
import { VoiceAssistantService } from './voice-assistant.service';
import { VoiceIntent, MobileAction } from '../../common/enums';
import { VoiceCommandResultDto } from './dto/voice-command-result.dto';

describe('VoiceController', () => {
  let controller: VoiceController;
  let voiceAssistantService: {
    processCommand: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    voiceAssistantService = {
      processCommand: vi.fn(),
    };
    controller = new VoiceController(
      voiceAssistantService as unknown as VoiceAssistantService,
    );
  });

  it('should delegate command execution to VoiceAssistantService and return result', async () => {
    const mockResult: VoiceCommandResultDto = {
      userInput: 'اقرأ لي الورقة دي',
      detectedIntent: VoiceIntent.READ_DOCUMENT,
      confidence: 0.95,
      spokenResponse: 'تمام، وجه الكاميرا نحو الورقة وسأقرأها لك حالاً',
      actionToTriggerOnMobile: MobileAction.OPEN_CAMERA_OCR,
      requiresClarification: false,
    };
    voiceAssistantService.processCommand.mockResolvedValue(mockResult);

    const dto = { userSpeech: 'اقرأ لي الورقة دي', language: 'ar-EG' };
    const response = await controller.processCommand(dto, 'corr-test-1');

    expect(voiceAssistantService.processCommand).toHaveBeenCalledWith(
      dto,
      'corr-test-1',
    );
    expect(response).toEqual(mockResult);
  });

  it('should have JwtAuthGuard and TokenBucketRateLimitGuard applied at the controller class level', () => {
    // Verify the decorator metadata is attached — NestJS stores guard metadata
    // on the class itself via Reflect.
    const guardMetadata: any[] =
      Reflect.getMetadata('__guards__', VoiceController) ?? [];
    const guardNames = guardMetadata.map((g: any) =>
      typeof g === 'function' ? g.name : g?.constructor?.name,
    );
    expect(guardNames).toContain('JwtAuthGuard');
    expect(guardNames).toContain('TokenBucketRateLimitGuard');
  });
});
