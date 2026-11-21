import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ImageInputDto {
  @ApiProperty({
    example: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
    description:
      'Base64 encoded image string (JPEG/PNG). Testing fake triggers: send "blurry" for ERR_IMAGE_BLURRY, "dark" for ERR_IMAGE_TOO_DARK, "notext" for ERR_NO_TEXT_DETECTED (OCR only), "unsupported" for ERR_UNSUPPORTED_IMAGE_FORMAT, or "toolarge" for ERR_FILE_TOO_LARGE.',
  })
  @IsString({ message: 'imageBase64 must be a string' })
  @IsNotEmpty({ message: 'imageBase64 is required and cannot be empty' })
  imageBase64: string;
}
