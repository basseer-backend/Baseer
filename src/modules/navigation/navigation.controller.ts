import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DestinationDto } from './dto/destination.dto';
import { CalculateRouteDto } from './dto/calculate-route.dto';
import { NavigationRouteDto } from './dto/navigation-route.dto';
import {
  ApiOkEnvelope,
  ApiErrorExamples,
} from '../../common/decorators/swagger.decorator';
import { AppErrorCode } from '../../common/constants/error-codes';
import { AppException } from '../../common/exceptions/app.exception';

const AVAILABLE_DESTINATIONS: DestinationDto[] = [
  { id: 'dept-affairs', name: 'مكتب شؤون الطلبة' },
  { id: 'lab-01', name: 'المعمل الرئيسي (Lab 1)' },
  { id: 'restroom', name: 'دورة المياه (حمامات)' },
  { id: 'dean-office', name: 'مكتب العميد' },
  { id: 'library', name: 'المكتبة المركزية' },
];

const QR_LOCATION_NAMES: Record<string, string> = {
  QR_ENTRANCE_01: 'المدخل الرئيسي - بوابة رقم 1',
  QR_HALLWAY_A: 'الممر الرئيسي - الدور الأول',
  QR_ELEVATOR_01: 'منطقة المصاعد المركزية',
  QR_STAIRS_EAST: 'السلالم الشرقية',
};

@ApiTags('Indoor Navigation')
@Controller('navigation')
export class NavigationController {
  @Get('destinations')
  @ApiOperation({
    summary: 'Get list of available indoor rooms and destinations',
  })
  @ApiOkEnvelope(DestinationDto, true)
  @ApiErrorExamples()
  getDestinations(): DestinationDto[] {
    return AVAILABLE_DESTINATIONS;
  }

  @Post('route')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Calculate step-by-step path from current QR code to target destination ID',
    description:
      'Returns voice-guided route instructions. Allowed QR codes: QR_ENTRANCE_01, QR_HALLWAY_A, QR_ELEVATOR_01, QR_STAIRS_EAST. Fake test triggers: currentQrCode="invalid" -> ERR_INVALID_QR_CODE, currentQrCode="notfound" -> ERR_QR_NOT_FOUND, destinationId not in destinations list -> ERR_DESTINATION_NOT_FOUND, destinationId="routeerror" -> ERR_ROUTE_CALCULATION_FAILED.',
  })
  @ApiOkEnvelope(NavigationRouteDto)
  @ApiErrorExamples(
    AppErrorCode.INVALID_QR_CODE,
    AppErrorCode.QR_NOT_FOUND,
    AppErrorCode.DESTINATION_NOT_FOUND,
    AppErrorCode.ROUTE_CALCULATION_FAILED,
    AppErrorCode.VALIDATION_FAILED,
  )
  calculateRoute(@Body() body: CalculateRouteDto): NavigationRouteDto {
    const rawQr = body.currentQrCode.trim();
    const qrLower = rawQr.toLowerCase();
    const dest = body.destinationId.trim().toLowerCase();

    // Fake QR Code error simulation
    if (qrLower === 'invalid') {
      throw new AppException(AppErrorCode.INVALID_QR_CODE);
    }
    if (qrLower === 'notfound') {
      throw new AppException(AppErrorCode.QR_NOT_FOUND);
    }

    // Must match a registered QR location name, checked safely via Object.hasOwn
    if (!Object.hasOwn(QR_LOCATION_NAMES, rawQr)) {
      throw new AppException(AppErrorCode.INVALID_QR_CODE);
    }

    const startLocation = QR_LOCATION_NAMES[rawQr];

    // Fake route calculation failure simulation
    if (dest === 'routeerror') {
      throw new AppException(AppErrorCode.ROUTE_CALCULATION_FAILED);
    }

    const matchedDest = AVAILABLE_DESTINATIONS.find(
      (d) => d.id.toLowerCase() === dest,
    );

    if (!matchedDest) {
      throw new AppException(AppErrorCode.DESTINATION_NOT_FOUND);
    }

    return {
      startLocation,
      targetDestination: matchedDest.name,
      destinationId: matchedDest.id,
      estimatedDistanceMeters: 30,
      totalSteps: 3,
      voiceInstructions: [
        'تحرك للأمام 10 خطوات مستقيماً',
        'استدر يميناً عند الممر الرئيسي',
        `وجهتك هي الباب الثاني على يسارك (${matchedDest.name})`,
      ],
    };
  }
}
