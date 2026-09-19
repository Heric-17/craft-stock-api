import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import type {
  MaterialPriceHistoryView,
  MaterialView,
  StockEntryInput,
  UpdateMaterialInput,
} from '../application/dto/materials.dto';
import { MaterialsService } from '../application/services/materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { SearchMaterialsQueryDto } from './dto/search-materials-query.dto';
import { StockEntryDto } from './dto/stock-entry.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateMaterialDto): Promise<MaterialView> {
    return this.materialsService.create({
      name: dto.name,
      description: dto.description ?? null,
      imageUrl: dto.imageUrl ?? null,
      packageCost: dto.packageCost,
      packageQuantity: dto.packageQuantity,
      stockQuantity: dto.stockQuantity,
      minimumStockAlert: dto.minimumStockAlert,
    });
  }

  @Get()
  list(@Query() query: SearchMaterialsQueryDto): Promise<MaterialView[]> {
    if (query.name !== undefined) {
      return this.materialsService.search(query.name);
    }

    return this.materialsService.list();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMaterialDto): Promise<MaterialView> {
    const input: UpdateMaterialInput = {};

    if (dto.name !== undefined) input.name = dto.name;
    if (dto.description !== undefined) input.description = dto.description;
    if (dto.imageUrl !== undefined) input.imageUrl = dto.imageUrl;
    if (dto.packageCost !== undefined) input.packageCost = dto.packageCost;
    if (dto.packageQuantity !== undefined) input.packageQuantity = dto.packageQuantity;
    if (dto.minimumStockAlert !== undefined) input.minimumStockAlert = dto.minimumStockAlert;

    return this.materialsService.update(id, input);
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
}
