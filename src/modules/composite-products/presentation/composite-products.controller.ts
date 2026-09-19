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
} from '@nestjs/common';

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
  constructor(private readonly compositeProductsService: CompositeProductsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCompositeProductDto): Promise<CompositeProductView> {
    return this.compositeProductsService.create({
      name: dto.name,
      description: dto.description ?? null,
      imageUrl: dto.imageUrl ?? null,
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
    if (dto.imageUrl !== undefined) input.imageUrl = dto.imageUrl;
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

  /**
   * Physical delete — allowed only when no `SaleItem` references this
   * CompositeProduct. Otherwise the service throws `EntityInUseError` (422);
   * discontinue it instead. See CLAUDE.md section 9.
   */
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
}
