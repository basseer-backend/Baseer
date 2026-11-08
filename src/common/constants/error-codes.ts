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

  // Vision & Camera / OCR Errors
  IMAGE_BLURRY = 'ERR_IMAGE_BLURRY',
  IMAGE_TOO_DARK = 'ERR_IMAGE_TOO_DARK',
  NO_TEXT_DETECTED = 'ERR_NO_TEXT_DETECTED',
  UNSUPPORTED_IMAGE_FORMAT = 'ERR_UNSUPPORTED_IMAGE_FORMAT',

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

  // Image errors (422)
  [AppErrorCode.IMAGE_BLURRY]: HttpStatus.UNPROCESSABLE_ENTITY, // 422
  [AppErrorCode.IMAGE_TOO_DARK]: HttpStatus.UNPROCESSABLE_ENTITY, // 422
  [AppErrorCode.NO_TEXT_DETECTED]: HttpStatus.UNPROCESSABLE_ENTITY, // 422
  [AppErrorCode.UNSUPPORTED_IMAGE_FORMAT]: HttpStatus.UNPROCESSABLE_ENTITY, // 422

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

  // Vision & Camera / OCR
  [AppErrorCode.IMAGE_BLURRY]:
    'الصورة مشوشة أو غير واضحة، يرجى إعادة التقاطها بثبات',
  [AppErrorCode.IMAGE_TOO_DARK]:
    'الإضاءة ضعيفة جداً، يرجى تشغيل الفلاش أو الانتقال لمكان مضيء',
  [AppErrorCode.NO_TEXT_DETECTED]:
    'لم يتم العثور على أي نص في الصورة الملتقطة',
  [AppErrorCode.UNSUPPORTED_IMAGE_FORMAT]:
    'صيغة الصورة غير مدعومة، يرجى إرسال صورة JPEG أو PNG',

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
