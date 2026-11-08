import { AppErrorCode } from '../constants/error-codes.js';
import { AppException } from '../exceptions/app.exception.js';

export interface ImageValidationOptions {
  allowNoTextTrigger?: boolean;
}

/**
 * Validates fake test triggers for image payloads across OCR and Vision modules.
 * Throws standard AppException with default Arabic messages defined in ERROR_MESSAGES.
 */
export function validateImageInput(
  imageBase64: string,
  options: ImageValidationOptions = {},
): void {
  const raw = imageBase64.trim().toLowerCase();

  if (raw === 'blurry') {
    throw new AppException(AppErrorCode.IMAGE_BLURRY);
  }
  if (raw === 'dark') {
    throw new AppException(AppErrorCode.IMAGE_TOO_DARK);
  }
  if (raw === 'unsupported') {
    throw new AppException(AppErrorCode.UNSUPPORTED_IMAGE_FORMAT);
  }
  if (raw === 'toolarge') {
    throw new AppException(AppErrorCode.FILE_TOO_LARGE);
  }
  if (options.allowNoTextTrigger && raw === 'notext') {
    throw new AppException(AppErrorCode.NO_TEXT_DETECTED);
  }
}
