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
import { DEFAULT_PAGE_SIZE } from '../../../shared/presentation/http/pagination-query.dto';
import { validateImageFile } from '../../../shared/presentation/http/validate-image-file';
import type {
  MaterialInventorySummaryView,
  MaterialPriceHistoryView,
  MaterialView,
  StockEntryInput,
  StockEntryResultView,
  UpdateMaterialInput,
} from '../application/dto/materials.dto';
import type {
  RecordStockAdjustmentInput,
  StockAdjustmentHistoryPageView,
  StockAdjustmentResultView,
  StockLossDatasetView,
  StockLossPageView,
} from '../application/dto/stock-adjustments.dto';
import { MaterialInventoryService } from '../application/services/material-inventory.service';
import { MaterialLossesService } from '../application/services/material-losses.service';
import { MaterialsService } from '../application/services/materials.service';
import { StockAdjustmentHistoryService } from '../application/services/stock-adjustment-history.service';
import { StockAdjustmentsService } from '../application/services/stock-adjustments.service';
import { ChangeConsumptionUnitDto } from './dto/consumption-unit.dto';
import { CreateMaterialDto } from './dto/create-material.dto';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
import { InventorySummaryQueryDto } from './dto/inventory-summary-query.dto';
import { ListLossesQueryDto } from './dto/list-losses-query.dto';
import { ListStockAdjustmentsQueryDto } from './dto/list-stock-adjustments-query.dto';
import { LossesDatasetQueryDto } from './dto/losses-dataset-query.dto';
import { SearchMaterialsQueryDto } from './dto/search-materials-query.dto';
import { StockEntryDto } from './dto/stock-entry.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

@Controller('materials')
export class MaterialsController {
  constructor(
    private readonly materialsService: MaterialsService,
    private readonly materialInventory: MaterialInventoryService,
    private readonly stockAdjustments: StockAdjustmentsService,
    private readonly stockAdjustmentHistory: StockAdjustmentHistoryService,
    private readonly materialLosses: MaterialLossesService,
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

  /**
   * Total of the stock: how many Materials, how many are below their minimum
   * and what the stock is worth. The one finished figure of this module — an
   * exception, justified on `MaterialInventorySummaryPort`. Declared before
   * `:id` so the literal path is matched first.
   */
  @Get('inventory-summary')
  getInventorySummary(
    @Query() query: InventorySummaryQueryDto,
  ): Promise<MaterialInventorySummaryView> {
    return this.materialInventory.getSummary(query.includeDiscontinued === 'true');
  }

  /** Paginated loss history. Totals come from `losses/dataset`, not from the pages. Declared before `:id`. */
  @Get('losses')
  listLosses(@Query() query: ListLossesQueryDto): Promise<StockLossPageView> {
    return this.materialLosses.list({
      ...(query.from !== undefined ? { from: new Date(query.from) } : {}),
      ...(query.to !== undefined ? { to: new Date(query.to) } : {}),
      ...(query.materialId !== undefined ? { materialId: query.materialId } : {}),
      ...(query.reason !== undefined ? { reason: query.reason } : {}),
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      offset: query.offset ?? 0,
    });
  }

  /** Losses by month, reason and material; the panel folds the cells. Declared before `:id`. */
  @Get('losses/dataset')
  getLossesDataset(@Query() query: LossesDatasetQueryDto): Promise<StockLossDatasetView> {
    return this.materialLosses.getDataset({ from: new Date(query.from), to: new Date(query.to) });
  }

  /**
   * Detail of one `Material`. Declared after the collection route and before
   * the more specific `:id/...` ones; those carry a second segment, so
   * nothing here shadows them.
   *
   * Answers for a discontinued Material too — a screen reached by a link to
   * one has to be able to render it (§9).
   */
  @Get(':id')
  findById(@Param('id') id: string): Promise<MaterialView> {
    return this.materialsService.findById(id);
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

  /** The Material's manual stock changes, newest first, reversals included. */
  @Get(':id/stock-adjustments')
  listStockAdjustments(
    @Param('id') id: string,
    @Query() query: ListStockAdjustmentsQueryDto,
  ): Promise<StockAdjustmentHistoryPageView> {
    return this.stockAdjustmentHistory.list({
      materialId: id,
      ...(query.kind !== undefined ? { kind: query.kind } : {}),
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      offset: query.offset ?? 0,
    });
  }

  /** Records a loss with its reason, or reverses an earlier entry. Entries and counts stay on `stock-entries`. */
  @Post(':id/stock-adjustments')
  @HttpCode(HttpStatus.CREATED)
  recordStockAdjustment(
    @Param('id') id: string,
    @Body() dto: CreateStockAdjustmentDto,
  ): Promise<StockAdjustmentResultView> {
    if (dto.kind === 'MANUAL_LOSS') {
      if (dto.reversedAdjustmentId !== undefined) {
        throw new BadRequestException('reversedAdjustmentId is only allowed for REVERSAL entries.');
      }

      const input: RecordStockAdjustmentInput = {
        kind: 'MANUAL_LOSS',
        quantity: dto.quantity as number,
        reason: dto.reason as NonNullable<CreateStockAdjustmentDto['reason']>,
        ...(dto.observation !== undefined ? { observation: dto.observation } : {}),
      };

      return this.stockAdjustments.record(id, input);
    }

    if (dto.quantity !== undefined || dto.reason !== undefined) {
      throw new BadRequestException(
        'quantity and reason are only allowed for MANUAL_LOSS entries.',
      );
    }

    return this.stockAdjustments.record(id, {
      kind: 'REVERSAL',
      reversedAdjustmentId: dto.reversedAdjustmentId as string,
      ...(dto.observation !== undefined ? { observation: dto.observation } : {}),
    });
  }

  @Post(':id/stock-entries')
  @HttpCode(HttpStatus.OK)
  registerStockEntry(
    @Param('id') id: string,
    @Body() dto: StockEntryDto,
  ): Promise<StockEntryResultView> {
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
