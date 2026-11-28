import {
  ArgumentMetadata,
  Injectable,
  Optional,
  PipeTransform,
} from '@nestjs/common';
import { ImageInputDto } from '../dto/image-input.dto';
import { sanitizeImage } from '../helpers/image-sanitizer.helper';

export interface ImageSanitizerPipeOptions {
  allowNoTextTrigger?: boolean;
}

/**
 * NestJS Pipe to sanitize, validate, and normalize incoming image payloads.
 * Ensures the incoming Base64 is verified by magic bytes, stripped of metadata,
 * alpha channels flattened onto white, and canonicalized into pure Base64 JPEG.
 */
@Injectable()
export class ImageSanitizerPipe
  implements PipeTransform<ImageInputDto, Promise<ImageInputDto>>
{
  constructor(@Optional() private readonly options: ImageSanitizerPipeOptions = {}) {}

  async transform(
    value: ImageInputDto,
    _metadata: ArgumentMetadata,
  ): Promise<ImageInputDto> {
    if (!value || typeof value.imageBase64 !== 'string') {
      return value;
    }

    const sanitized = await sanitizeImage(value.imageBase64, {
      allowNoTextTrigger: this.options.allowNoTextTrigger,
    });

    return {
      ...value,
      imageBase64: sanitized.base64,
    };
  }
}
