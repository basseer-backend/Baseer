import { HttpStatus } from '@nestjs/common';

export enum AppErrorCode {
  // Common HTTP & Server Errors
  INTERNAL_SERVER_ERROR = 'ERR_INTERNAL_SERVER_ERROR',
  VALIDATION_FAILED = 'ERR_VALIDATION_FAILED',
  UNAUTHORIZED = 'ERR_UNAUTHORIZED',
  FORBIDDEN = 'ERR_FORBIDDEN',
  NOT_FOUND = 'ERR_NOT_FOUND',
  BAD_REQUEST = 'ERR_BAD_REQUEST',
  FILE_TOO_LARGE = 'ERR_FILE_TOO_LARGE',
  TOO_MANY_REQUESTS = 'ERR_TOO_MANY_REQUESTS',
  SERVICE_UNAVAILABLE = 'ERR_SERVICE_UNAVAILABLE',
  REQUEST_TIMEOUT = 'ERR_REQUEST_TIMEOUT',

  // Vision & Camera / OCR Errors
  IMAGE_BLURRY = 'ERR_IMAGE_BLURRY',
  IMAGE_TOO_DARK = 'ERR_IMAGE_TOO_DARK',
  NO_TEXT_DETECTED = 'ERR_NO_TEXT_DETECTED',
  UNSUPPORTED_IMAGE_FORMAT = 'ERR_UNSUPPORTED_IMAGE_FORMAT',
  LOW_CONFIDENCE = 'ERR_LOW_CONFIDENCE',

  // Audio & Voice Assistant Errors
  INTENT_NOT_RECOGNIZED = 'ERR_INTENT_NOT_RECOGNIZED',

  // Indoor Navigation & QR Errors
  QR_NOT_FOUND = 'ERR_QR_NOT_FOUND',
  INVALID_QR_CODE = 'ERR_INVALID_QR_CODE',
  DESTINATION_NOT_FOUND = 'ERR_DESTINATION_NOT_FOUND',
  ROUTE_CALCULATION_FAILED = 'ERR_ROUTE_CALCULATION_FAILED',
}

export const ERROR_HTTP_STATUS: Record<AppErrorCode, HttpStatus> = {
  [AppErrorCode.INTERNAL_SERVER_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR, // 500
  [AppErrorCode.VALIDATION_FAILED]: HttpStatus.BAD_REQUEST, // 400
  [AppErrorCode.UNAUTHORIZED]: HttpStatus.UNAUTHORIZED, // 401
  [AppErrorCode.FORBIDDEN]: HttpStatus.FORBIDDEN, // 403
  [AppErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND, // 404
  [AppErrorCode.BAD_REQUEST]: HttpStatus.BAD_REQUEST, // 400
  [AppErrorCode.FILE_TOO_LARGE]: HttpStatus.PAYLOAD_TOO_LARGE, // 413
  [AppErrorCode.TOO_MANY_REQUESTS]: HttpStatus.TOO_MANY_REQUESTS, // 429
  [AppErrorCode.SERVICE_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE, // 503
  [AppErrorCode.REQUEST_TIMEOUT]: HttpStatus.GATEWAY_TIMEOUT, // 504

  // Image errors (422)
  [AppErrorCode.IMAGE_BLURRY]: HttpStatus.UNPROCESSABLE_ENTITY, // 422
  [AppErrorCode.IMAGE_TOO_DARK]: HttpStatus.UNPROCESSABLE_ENTITY, // 422
  [AppErrorCode.NO_TEXT_DETECTED]: HttpStatus.UNPROCESSABLE_ENTITY, // 422
  [AppErrorCode.UNSUPPORTED_IMAGE_FORMAT]: HttpStatus.UNPROCESSABLE_ENTITY, // 422
  [AppErrorCode.LOW_CONFIDENCE]: HttpStatus.UNPROCESSABLE_ENTITY, // 422

  // Voice (422)
  [AppErrorCode.INTENT_NOT_RECOGNIZED]: HttpStatus.UNPROCESSABLE_ENTITY, // 422

  // Navigation & QR
  [AppErrorCode.INVALID_QR_CODE]: HttpStatus.BAD_REQUEST, // 400
  [AppErrorCode.QR_NOT_FOUND]: HttpStatus.NOT_FOUND, // 404
  [AppErrorCode.DESTINATION_NOT_FOUND]: HttpStatus.NOT_FOUND, // 404
  [AppErrorCode.ROUTE_CALCULATION_FAILED]: HttpStatus.UNPROCESSABLE_ENTITY, // 422
};

export const ERROR_MESSAGES: Record<AppErrorCode, string> = {
  [AppErrorCode.INTERNAL_SERVER_ERROR]: 'حدث خطأ غير متوقع في الخادم',
  [AppErrorCode.VALIDATION_FAILED]: 'بيانات الطلب غير صالحة',
  [AppErrorCode.UNAUTHORIZED]: 'يرجى تسجيل الدخول أولاً',
  [AppErrorCode.FORBIDDEN]: 'غير مصرح لك بالوصول لهذا المورد',
  [AppErrorCode.NOT_FOUND]: 'المورد المطلوب غير موجود',
  [AppErrorCode.BAD_REQUEST]: 'طلب غير صحيح',
  [AppErrorCode.FILE_TOO_LARGE]: 'حجم الصورة كبير جداً وتجاوز الحد الأقصى',
  [AppErrorCode.TOO_MANY_REQUESTS]: 'طلبات كثيرة جداً، يرجى الانتظار قليلاً',
  [AppErrorCode.SERVICE_UNAVAILABLE]: 'الخدمة غير متوفرة حالياً، حاول لاحقاً',
  [AppErrorCode.REQUEST_TIMEOUT]:
    'استغرق الطلب وقتاً أطول من المعتاد، يرجى المحاولة مرة أخرى',

  // Vision & Camera / OCR
  [AppErrorCode.IMAGE_BLURRY]:
    'الصورة مشوشة أو غير واضحة، يرجى إعادة التقاطها بثبات',
  [AppErrorCode.IMAGE_TOO_DARK]:
    'الإضاءة ضعيفة جداً، يرجى تشغيل الفلاش أو الانتقال لمكان مضيء',
  [AppErrorCode.NO_TEXT_DETECTED]:
    'لم يتم العثور على أي نص في الصورة الملتقطة',
  [AppErrorCode.UNSUPPORTED_IMAGE_FORMAT]:
    'صيغة الصورة غير مدعومة، يرجى إرسال صورة JPEG أو PNG',
  [AppErrorCode.LOW_CONFIDENCE]:
    'لم أتمكن من التأكد من النتيجة، يرجى المحاولة مرة أخرى بشكل أوضح',

  // Voice Assistant
  [AppErrorCode.INTENT_NOT_RECOGNIZED]:
    'عذراً، لم أفهم طلبك، يرجى المحاولة بصيغة أخرى',

  // Indoor Navigation & QR
  [AppErrorCode.QR_NOT_FOUND]: 'لم يتم العثور على أي كود QR في الإطار',
  [AppErrorCode.INVALID_QR_CODE]: 'كود الـ QR غير صالح أو تالف',
  [AppErrorCode.DESTINATION_NOT_FOUND]:
    'المكان أو الوجهة المطلوبة غير مسجلة بالنظام',
  [AppErrorCode.ROUTE_CALCULATION_FAILED]:
    'تعذر حساب المسار إلى الوجهة المطلوبة',
};

export const ERROR_META: Record<
  AppErrorCode,
  {
    owner: ('backend' | 'ai')[];
    retry: 'same_request' | 'new_capture' | 'login' | 'none';
    messageKey: string;
    fallbackMessage: string;
  }
> = {
  [AppErrorCode.INTERNAL_SERVER_ERROR]: {
    owner: ['backend', 'ai'],
    retry: 'same_request',
    messageKey: 'server_error',
    fallbackMessage: 'The server encountered a problem. Please try again.',
  },
  [AppErrorCode.VALIDATION_FAILED]: {
    owner: ['backend', 'ai'],
    retry: 'none',
    messageKey: 'invalid_request',
    fallbackMessage: 'The request could not be sent. Please try again.',
  },
  [AppErrorCode.BAD_REQUEST]: {
    owner: ['backend', 'ai'],
    retry: 'none',
    messageKey: 'invalid_request',
    fallbackMessage: 'The request could not be sent. Please try again.',
  },
  [AppErrorCode.UNAUTHORIZED]: {
    owner: ['backend'],
    retry: 'login',
    messageKey: 'unauthorized',
    fallbackMessage: 'Your session has expired. Please sign in again.',
  },
  [AppErrorCode.FORBIDDEN]: {
    owner: ['backend'],
    retry: 'none',
    messageKey: 'forbidden',
    fallbackMessage: 'You do not have permission to do this.',
  },
  [AppErrorCode.NOT_FOUND]: {
    owner: ['backend', 'ai'],
    retry: 'none',
    messageKey: 'not_found',
    fallbackMessage: 'The requested item was not found.',
  },
  [AppErrorCode.FILE_TOO_LARGE]: {
    owner: ['backend', 'ai'],
    retry: 'new_capture',
    messageKey: 'image_too_large',
    fallbackMessage: 'The image is too large. Take a new photo.',
  },
  [AppErrorCode.TOO_MANY_REQUESTS]: {
    owner: ['backend', 'ai'],
    retry: 'same_request',
    messageKey: 'too_many_requests',
    fallbackMessage: 'Too many requests. Wait a moment and try again.',
  },
  [AppErrorCode.SERVICE_UNAVAILABLE]: {
    owner: ['backend', 'ai'],
    retry: 'same_request',
    messageKey: 'service_unavailable',
    fallbackMessage:
      'The service is unavailable right now. Please try again shortly.',
  },
  [AppErrorCode.REQUEST_TIMEOUT]: {
    owner: ['backend', 'ai'],
    retry: 'same_request',
    messageKey: 'timeout_error',
    fallbackMessage: 'The request took too long. Please try again.',
  },
  [AppErrorCode.IMAGE_BLURRY]: {
    owner: ['ai'],
    retry: 'new_capture',
    messageKey: 'image_blurry',
    fallbackMessage:
      'The image is not clear. Hold the phone steady and take a new photo.',
  },
  [AppErrorCode.IMAGE_TOO_DARK]: {
    owner: ['ai'],
    retry: 'new_capture',
    messageKey: 'image_too_dark',
    fallbackMessage:
      'The lighting is too low. Turn on the flash or move to a brighter place.',
  },
  [AppErrorCode.NO_TEXT_DETECTED]: {
    owner: ['ai'],
    retry: 'new_capture',
    messageKey: 'ocr_no_text',
    fallbackMessage:
      'No text found. Move the camera closer to the text and check the lighting.',
  },
  [AppErrorCode.UNSUPPORTED_IMAGE_FORMAT]: {
    owner: ['backend', 'ai'],
    retry: 'new_capture',
    messageKey: 'image_unsupported',
    fallbackMessage: 'This image format is not supported. Take a new photo.',
  },
  [AppErrorCode.INTENT_NOT_RECOGNIZED]: {
    owner: ['ai'],
    retry: 'new_capture',
    messageKey: 'intent_unknown',
    fallbackMessage:
      'I did not understand your request. Please say it another way.',
  },
  [AppErrorCode.LOW_CONFIDENCE]: {
    owner: ['ai'],
    retry: 'new_capture',
    messageKey: 'low_confidence',
    fallbackMessage:
      'I could not be sure of the result. Please try again more clearly.',
  },
  [AppErrorCode.QR_NOT_FOUND]: {
    owner: ['backend'],
    retry: 'new_capture',
    messageKey: 'qr_not_found',
    fallbackMessage: 'I could not find a QR code. Move the camera slowly.',
  },
  [AppErrorCode.INVALID_QR_CODE]: {
    owner: ['backend'],
    retry: 'new_capture',
    messageKey: 'qr_invalid',
    fallbackMessage: 'This QR code is not valid. Try another one.',
  },
  [AppErrorCode.DESTINATION_NOT_FOUND]: {
    owner: ['backend'],
    retry: 'none',
    messageKey: 'destination_not_found',
    fallbackMessage:
      'This destination is not registered. Choose another one.',
  },
  [AppErrorCode.ROUTE_CALCULATION_FAILED]: {
    owner: ['backend'],
    retry: 'same_request',
    messageKey: 'route_failed',
    fallbackMessage: 'The route could not be calculated. Please try again.',
  },
};
