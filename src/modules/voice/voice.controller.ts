import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { CreateVoiceDto } from './dto/create-voice.dto';
import { UpdateVoiceDto } from './dto/update-voice.dto';

@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post()
  create(@Body() createVoiceDto: CreateVoiceDto) {
    return this.voiceService.create(createVoiceDto);
  }

  @Get()
  findAll() {
    return this.voiceService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.voiceService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateVoiceDto: UpdateVoiceDto) {
    return this.voiceService.update(+id, updateVoiceDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.voiceService.remove(+id);
  }
}
