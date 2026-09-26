import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { EnvService } from '../../../config/env.service';
import { validateImageFile } from '../../../shared/presentation/http/validate-image-file';
import type {
  CompositeProductView,
  UpdateCompositeProductInput,
} from '../application/dto/composite-products.dto';
import { CompositeProductsService } from '../application/services/composite-products.service';
import { CreateCompositeProductDto } from './dto/create-composite-product.dto';
import { ListCompositeProductsQueryDto } from './dto/list-composite-products-query.dto';
import { UpdateCompositeProductDto } from './dto/update-composite-product.dto';

@Controller('composite-products')
export class CompositeProductsController {
  constructor(
    private readonly compositeProductsService: CompositeProductsService,
    private readonly env: EnvService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCompositeProductDto): Promise<CompositeProductView> {
    return this.compositeProductsService.create({
      name: dto.name,
      description: dto.description ?? null,
      fixedOperationalCost: dto.fixedOperationalCost,
      profitMargin: dto.profitMargin,
      manualPrice: dto.manualPrice ?? null,
      billOfMaterials: dto.billOfMaterials.map((item) => ({
        materialId: item.materialId,
        quantity: item.quantity,
      })),
    });
  }

  @Get()
  list(@Query() query: ListCompositeProductsQueryDto): Promise<CompositeProductView[]> {
    return this.compositeProductsService.list(query.includeDiscontinued === 'true');
  }

  @Get(':id')
  findById(@Param('id') id: string): Promise<CompositeProductView> {
    return this.compositeProductsService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompositeProductDto,
  ): Promise<CompositeProductView> {
    const input: UpdateCompositeProductInput = {};

    if (dto.name !== undefined) input.name = dto.name;
    if (dto.description !== undefined) input.description = dto.description;
    if (dto.fixedOperationalCost !== undefined)
      input.fixedOperationalCost = dto.fixedOperationalCost;
    if (dto.profitMargin !== undefined) input.profitMargin = dto.profitMargin;
    if (dto.manualPrice !== undefined) input.manualPrice = dto.manualPrice;
    if (dto.billOfMaterials !== undefined) {
      input.billOfMaterials = dto.billOfMaterials.map((item) => ({
        materialId: item.materialId,
        quantity: item.quantity,
      }));
    }

    return this.compositeProductsService.update(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.compositeProductsService.delete(id);
  }

  @Post(':id/discontinue')
  @HttpCode(HttpStatus.OK)
  discontinue(@Param('id') id: string): Promise<CompositeProductView> {
    return this.compositeProductsService.discontinue(id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(@Param('id') id: string): Promise<CompositeProductView> {
    return this.compositeProductsService.reactivate(id);
  }

  /**
   * Multipart upload, field name `file`. Validated for MIME type and size
   * before it ever reaches `StorageProvider`; stores the relative key
   * `StorageProviderFactory`'s chosen provider returns, never a
   * host-qualified URL.
   */
  @Post(':id/image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<CompositeProductView> {
    const validated = validateImageFile(file, this.env);

    return this.compositeProductsService.setImage(id, {
      buffer: validated.buffer,
      mimeType: validated.mimetype,
    });
  }

  @Delete(':id/image')
  @HttpCode(HttpStatus.OK)
  removeImage(@Param('id') id: string): Promise<CompositeProductView> {
    return this.compositeProductsService.removeImage(id);
  }
}
