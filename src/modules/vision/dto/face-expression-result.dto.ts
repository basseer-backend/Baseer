import { ApiProperty } from '@nestjs/swagger';

export enum FacialExpression {
  HAPPY = 'Smiling / Happy',
  NEUTRAL = 'Neutral',
  SAD = 'Sad',
  SURPRISED = 'Surprised',
  ANGRY = 'Angry',
}

export class FaceExpressionResultDto {
  @ApiProperty({
    enum: FacialExpression,
    example: FacialExpression.HAPPY,
    description: 'Facial expression description',
  })
  expression: FacialExpression | string;

  @ApiProperty({
    example: 'الشخص الذي أمامك يبتسم ويبدو سعيداً',
    description: 'Natural spoken Arabic explanation',
  })
  spokenDescription: string;

  @ApiProperty({
    example: 0.88,
    minimum: 0,
    maximum: 1,
    description: 'Expression recognition confidence score (0 to 1)',
  })
  confidence: number;
}
