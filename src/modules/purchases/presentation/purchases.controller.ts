import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import type {
  PurchaseDetailView,
  PurchasePageView,
  PurchaseView,
  SpendingDatasetView,
} from '../application/dto/purchases.dto';
import { PurchaseAnalyticsService } from '../application/services/purchase-analytics.service';
import { PurchaseEditingService } from '../application/services/purchase-editing.service';
import { PurchasesService } from '../application/services/purchases.service';
import { DEFAULT_PURCHASE_PAGE_SIZE, ListPurchasesQueryDto } from './dto/list-purchases-query.dto';
import {
  ChangePurchaseItemDto,
  PurchaseItemDto,
  SetDiscountAllocationDto,
} from './dto/purchase-item.dto';
import { RegisterManualPurchaseDto } from './dto/register-manual-purchase.dto';
import { SpendingQueryDto } from './dto/spending-query.dto';

@Controller('purchases')
export class PurchasesController {
  constructor(
    private readonly purchases: PurchasesService,
    private readonly editing: PurchaseEditingService,
    private readonly purchaseAnalytics: PurchaseAnalyticsService,
  ) {}

  /**
   * The purchase history, paginated.
   *
   * Paging is the documented answer to a long list, and the reason it is not
   * the answer to the panel: it resolves a list, never an aggregation. The
   * totals of a period cannot be folded out of one page of rows.
   */
  @Get()
  list(@Query() query: ListPurchasesQueryDto): Promise<PurchasePageView> {
    return this.purchases.list({
      ...(query.from !== undefined ? { from: new Date(query.from) } : {}),
      ...(query.to !== undefined ? { to: new Date(query.to) } : {}),
      ...(query.establishmentId !== undefined ? { establishmentId: query.establishmentId } : {}),
      limit: query.limit ?? DEFAULT_PURCHASE_PAGE_SIZE,
      offset: query.offset ?? 0,
    });
  }

  /**
   * The spending dataset, bucketed by period and by establishment.
   *
   * Deliberately a dataset and not a set of finished figures: the period
   * total, the average ticket, the ranking of shops and the month-on-month
   * curve are all folds over these buckets, and the panel does them itself.
   * Declared before `:id` so the literal path is matched first.
   */
  @Get('spending')
  getSpending(@Query() query: SpendingQueryDto): Promise<SpendingDatasetView> {
    return this.purchaseAnalytics.getSpending({
      from: new Date(query.from),
      to: new Date(query.to),
      granularity: query.granularity,
      ...(query.establishmentId !== undefined ? { establishmentId: query.establishmentId } : {}),
    });
  }

  /** The purchase with its lines and the captured note, exactly as captured. */
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseDetailView> {
    return this.purchases.getById(id);
  }

  /** A purchase with no note behind it, typed in by the user. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  registerManual(@Body() dto: RegisterManualPurchaseDto): Promise<PurchaseView> {
    return this.purchases.registerManualPurchase({
      purchaseDate: new Date(dto.purchaseDate),
      ...(dto.establishment !== undefined
        ? { establishment: { name: dto.establishment.name, cnpj: dto.establishment.cnpj ?? null } }
        : {}),
      ...(dto.discountTotal !== undefined ? { discountTotal: dto.discountTotal } : {}),
      ...(dto.discountAllocationMode !== undefined
        ? { discountAllocationMode: dto.discountAllocationMode }
        : {}),
      lines: dto.lines.map((line) => ({
        ...(line.code !== undefined ? { code: line.code } : {}),
        ...(line.unit !== undefined ? { unit: line.unit } : {}),
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        grossValue: line.grossValue,
        isCompanyExpense: line.isCompanyExpense,
        materialId: line.materialId ?? null,
      })),
    });
  }

  /**
   * Adds a line. Under `MANUAL` this leaves the purchase in pending
   * attribution: nothing can work out how much of the discount belongs to a
   * line that was not there when the user distributed it.
   */
  @Post(':id/items')
  @HttpCode(HttpStatus.CREATED)
  addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseItemDto,
  ): Promise<PurchaseDetailView> {
    return this.editing.addItem(id, {
      ...(dto.code !== undefined ? { code: dto.code } : {}),
      ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
      description: dto.description,
      quantity: dto.quantity,
      unitPrice: dto.unitPrice,
      grossValue: dto.grossValue,
      isCompanyExpense: dto.isCompanyExpense,
      materialId: dto.materialId ?? null,
    });
  }

  /**
   * Corrects a line's quantity or value. Under `MANUAL` this leaves the
   * attribution pending too, for a reason of its own: the per-line ceiling
   * moved, and the discount the line is holding may now exceed what it is
   * worth.
   */
  @Patch(':id/items/:itemId')
  changeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: ChangePurchaseItemDto,
  ): Promise<PurchaseDetailView> {
    return this.editing.changeItem(id, itemId, {
      ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
      ...(dto.unitPrice !== undefined ? { unitPrice: dto.unitPrice } : {}),
      ...(dto.grossValue !== undefined ? { grossValue: dto.grossValue } : {}),
    });
  }

  /**
   * Removes a line. Answers with the purchase rather than no content,
   * because the totals and the attribution have just moved and the client
   * needs to see where they landed.
   */
  @Delete(':id/items/:itemId')
  @HttpCode(HttpStatus.OK)
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<PurchaseDetailView> {
    return this.editing.removeItem(id, itemId);
  }

  /** Sets how the discount is attributed — and the way out of a pending `MANUAL`. */
  @Patch(':id/discount-allocation')
  setDiscountAllocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDiscountAllocationDto,
  ): Promise<PurchaseDetailView> {
    return this.editing.setDiscountAllocation(id, {
      mode: dto.mode,
      ...(dto.manualAllocation !== undefined
        ? {
            manualAllocation: dto.manualAllocation.map((entry) => ({
              itemId: entry.itemId,
              allocatedDiscount: entry.allocatedDiscount,
            })),
          }
        : {}),
    });
  }

  /**
   * Closes the edit. Refused (422) while a manual attribution is pending: a
   * purchase carrying only part of its discount is one whose every derived
   * figure is wrong and looks right.
   */
  @Post(':id/complete-edit')
  @HttpCode(HttpStatus.OK)
  completeEdit(@Param('id', ParseUUIDPipe) id: string): Promise<PurchaseDetailView> {
    return this.editing.completeEdit(id);
  }
}
