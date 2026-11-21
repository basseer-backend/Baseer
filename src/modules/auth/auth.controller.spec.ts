import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    guest: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    getMe: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authService = {
      guest: vi.fn(),
      refresh: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn(),
    };

    controller = new AuthController(authService as unknown as AuthService);
  });

  it('should delegate guest to AuthService', async () => {
    authService.guest.mockResolvedValue({ user: { isGuest: true }, tokens: {} });

    await controller.guest({ preferredLanguage: 'ar-EG' });
    expect(authService.guest).toHaveBeenCalledWith({ preferredLanguage: 'ar-EG' });
  });

  it('should delegate refresh to AuthService', async () => {
    const dto = { refreshToken: 'valid-token' };
    authService.refresh.mockResolvedValue({ accessToken: 'new' });

    await controller.refresh(dto);
    expect(authService.refresh).toHaveBeenCalledWith(dto);
  });

  it('should delegate logout to AuthService', async () => {
    authService.logout.mockResolvedValue({ success: true, message: 'Logged out' });

    const result = await controller.logout('user-1', { refreshToken: 't' });
    expect(authService.logout).toHaveBeenCalledWith('user-1', { refreshToken: 't' });
    expect(result.success).toBe(true);
  });

  it('should delegate getMe to AuthService', async () => {
    authService.getMe.mockResolvedValue({ id: 'user-1' });

    const result = await controller.getMe('user-1');
    expect(authService.getMe).toHaveBeenCalledWith('user-1');
    expect(result.id).toBe('user-1');
  });
});
