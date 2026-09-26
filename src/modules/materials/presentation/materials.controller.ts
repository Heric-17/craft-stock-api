import {
  BadRequestException,
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
  MaterialPriceHistoryView,
  MaterialView,
  StockEntryInput,
  UpdateMaterialInput,
} from '../application/dto/materials.dto';
import { MaterialsService } from '../application/services/materials.service';
import { ChangeConsumptionUnitDto } from './dto/consumption-unit.dto';
import { CreateMaterialDto } from './dto/create-material.dto';
import { SearchMaterialsQueryDto } from './dto/search-materials-query.dto';
import { StockEntryDto } from './dto/stock-entry.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

@Controller('materials')
export class MaterialsController {
  constructor(
    private readonly materialsService: MaterialsService,
    private readonly env: EnvService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateMaterialDto): Promise<MaterialView> {
    return this.materialsService.create({
      name: dto.name,
      description: dto.description ?? null,
      packageCost: dto.packageCost,
      packageQuantity: dto.packageQuantity,
      consumptionUnit: dto.consumptionUnit,
      stockQuantity: dto.stockQuantity,
      minimumStockAlert: dto.minimumStockAlert,
    });
  }

  @Get()
  list(@Query() query: SearchMaterialsQueryDto): Promise<MaterialView[]> {
    const includeDiscontinued = query.includeDiscontinued === 'true';

    if (query.name !== undefined) {
      return this.materialsService.search(query.name, includeDiscontinued);
    }

    return this.materialsService.list(includeDiscontinued);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMaterialDto): Promise<MaterialView> {
    const input: UpdateMaterialInput = {};

    if (dto.name !== undefined) input.name = dto.name;
    if (dto.description !== undefined) input.description = dto.description;
    if (dto.packageCost !== undefined) input.packageCost = dto.packageCost;
    if (dto.packageQuantity !== undefined) input.packageQuantity = dto.packageQuantity;
    if (dto.minimumStockAlert !== undefined) input.minimumStockAlert = dto.minimumStockAlert;

    return this.materialsService.update(id, input);
  }

  /**
   * Its own route rather than a field of `PATCH /materials/:id`: the unit is
   * what every quantity recorded against this Material means, so it is
   * refused (422) once there is stock on hand or a `BillOfMaterials` line
   * consuming it.
   */
  @Patch(':id/consumption-unit')
  changeConsumptionUnit(
    @Param('id') id: string,
    @Body() dto: ChangeConsumptionUnitDto,
  ): Promise<MaterialView> {
    return this.materialsService.changeConsumptionUnit(id, dto.consumptionUnit);
  }

  @Post(':id/stock-entries')
  @HttpCode(HttpStatus.OK)
  registerStockEntry(@Param('id') id: string, @Body() dto: StockEntryDto): Promise<MaterialView> {
    if (dto.source === 'MANUAL' && dto.invoicePackageCost !== undefined) {
      throw new BadRequestException('invoicePackageCost is only allowed for INVOICE_SYNC entries.');
    }

    const input: StockEntryInput = {
      source: dto.source,
      ...(dto.relativeIncrement !== undefined ? { relativeIncrement: dto.relativeIncrement } : {}),
      ...(dto.absoluteQuantity !== undefined ? { absoluteQuantity: dto.absoluteQuantity } : {}),
      ...(dto.invoicePackageCost !== undefined
        ? { invoicePackageCost: dto.invoicePackageCost }
        : {}),
    };

    return this.materialsService.registerStockEntry(id, input);
  }

  @Get(':id/price-history')
  getPriceHistory(@Param('id') id: string): Promise<MaterialPriceHistoryView[]> {
    return this.materialsService.getPriceHistory(id);
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
  ): Promise<MaterialView> {
    const validated = validateImageFile(file, this.env);

    return this.materialsService.setImage(id, {
      buffer: validated.buffer,
      mimeType: validated.mimetype,
    });
  }

  @Delete(':id/image')
  @HttpCode(HttpStatus.OK)
  removeImage(@Param('id') id: string): Promise<MaterialView> {
    return this.materialsService.removeImage(id);
  }

  /**
   * Physical delete — allowed only when nothing references this Material.
   * Otherwise the service throws `EntityInUseError` (422); discontinue it
   * instead.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.materialsService.delete(id);
  }

  @Post(':id/discontinue')
  @HttpCode(HttpStatus.OK)
  discontinue(@Param('id') id: string): Promise<MaterialView> {
    return this.materialsService.discontinue(id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(@Param('id') id: string): Promise<MaterialView> {
    return this.materialsService.reactivate(id);
  }
}
