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

import type { SaleView, SalesDatasetView, ShoppingListView } from '../application/dto/sales.dto';
import { SalesAnalyticsService } from '../application/services/sales-analytics.service';
import { SalesService } from '../application/services/sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateSaleItemDto } from './dto/create-sale-item.dto';
import { ListSalesQueryDto } from './dto/list-sales-query.dto';
import { SalesAnalyticsQueryDto } from './dto/sales-analytics-query.dto';
import { ShoppingListDto } from './dto/shopping-list.dto';
import { UpdateItemQuantityDto } from './dto/update-item-quantity.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { UpdateProductionStatusDto } from './dto/update-production-status.dto';
import { UpdateSaleDetailsDto } from './dto/update-sale-details.dto';

@Controller('sales')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly salesAnalytics: SalesAnalyticsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSaleDto): Promise<SaleView> {
    return this.salesService.create({
      customerName: dto.customerName,
      customerContact: dto.customerContact ?? null,
      paymentMethod: dto.paymentMethod,
      items: dto.items.map((item) => ({
        compositeProductId: item.compositeProductId,
        materialId: item.materialId,
        quantity: item.quantity,
        marginPercent: item.marginPercent,
      })),
    });
  }

  @Get()
  list(@Query() query: ListSalesQueryDto): Promise<SaleView[]> {
    return this.salesService.list({
      paymentStatus: query.paymentStatus,
      productionStatus: query.productionStatus,
    });
  }

  /**
   * The sales dataset, cut by month, by `paymentStatus` and by
   * `productionStatus`, plus the sales still open whatever their date.
   *
   * A dataset and not a set of finished figures: sales this month, the change
   * against the last, orders in production and the amount to receive are
   * folds over these cells, done by the panel. Declared before `:id` so the
   * literal path is matched first.
   */
  @Get('analytics')
  getAnalytics(@Query() query: SalesAnalyticsQueryDto): Promise<SalesDatasetView> {
    return this.salesAnalytics.getSalesDataset({
      from: new Date(query.from),
      to: new Date(query.to),
    });
  }

  @Post('shopping-list')
  @HttpCode(HttpStatus.OK)
  getShoppingList(@Body() dto: ShoppingListDto): Promise<ShoppingListView> {
    return this.salesService.getShoppingList(dto.saleIds);
  }

  @Get(':id')
  findById(@Param('id') id: string): Promise<SaleView> {
    return this.salesService.findById(id);
  }

  @Patch(':id')
  updateDetails(@Param('id') id: string, @Body() dto: UpdateSaleDetailsDto): Promise<SaleView> {
    return this.salesService.updateDetails(id, {
      customerName: dto.customerName,
      customerContact: dto.customerContact,
      paymentMethod: dto.paymentMethod,
    });
  }

  @Post(':id/items')
  @HttpCode(HttpStatus.CREATED)
  addItem(@Param('id') id: string, @Body() dto: CreateSaleItemDto): Promise<SaleView> {
    return this.salesService.addItem(id, {
      compositeProductId: dto.compositeProductId,
      materialId: dto.materialId,
      quantity: dto.quantity,
      marginPercent: dto.marginPercent,
    });
  }

  @Patch(':id/items/:itemId')
  updateItemQuantity(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateItemQuantityDto,
  ): Promise<SaleView> {
    return this.salesService.updateItemQuantity(id, itemId, dto.quantity);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string): Promise<SaleView> {
    return this.salesService.removeItem(id, itemId);
  }

  @Patch(':id/payment-status')
  updatePaymentStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
  ): Promise<SaleView> {
    return this.salesService.updatePaymentStatus(id, dto.paymentStatus);
  }

  @Patch(':id/production-status')
  updateProductionStatus(
    @Param('id') id: string,
    @Body() dto: UpdateProductionStatusDto,
  ): Promise<SaleView> {
    return this.salesService.updateProductionStatus(id, dto.productionStatus);
  }
}
