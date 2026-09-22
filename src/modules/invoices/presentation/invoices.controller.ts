import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';

import type { ImportedInvoiceView, PendingInvoiceView } from '../application/dto/invoices.dto';
import { InvoiceImportFacade } from '../application/facades/invoice-import.facade';
import { InvoiceClassificationService } from '../application/services/invoice-classification.service';
import { PendingInvoicesService } from '../application/services/pending-invoices.service';
import { ClassifyInvoiceDto } from './dto/classify-invoice.dto';
import { ImportInvoiceDto } from './dto/import-invoice.dto';
import { ListPendingInvoicesQueryDto } from './dto/list-pending-invoices-query.dto';

/**
 * The controller knows the facade and nothing else about importing.
 *
 * Behind `importFromUrl` sit the provider factory, the scraper, a progressive
 * retry, the deduplication against the access key, the frozen raw extraction
 * and the creation of the `Purchase`. None of that is chained here: a
 * controller that orchestrated those steps would be a second place where the
 * order of them matters.
 */
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly imports: InvoiceImportFacade,
    private readonly pendingInvoices: PendingInvoicesService,
    private readonly classification: InvoiceClassificationService,
  ) {}

  /** Captures a scanned QR Code URL and imports the note behind it. */
  @Post('imports')
  @HttpCode(HttpStatus.CREATED)
  import(@Body() dto: ImportInvoiceDto): Promise<ImportedInvoiceView> {
    return this.imports.importFromUrl(dto.url);
  }

  /**
   * The capture queue. Scanning happens at the till, on a phone; finishing
   * the import happens from this list, on whatever device, whenever the
   * portal is answering.
   */
  @Get('pending')
  listPending(@Query() query: ListPendingInvoicesQueryDto): Promise<PendingInvoiceView[]> {
    return this.pendingInvoices.list(query.status);
  }

  /** Picks one queued capture back up — typically one parked as `UNSTABLE`. */
  @Post('pending/:id/reprocess')
  @HttpCode(HttpStatus.OK)
  reprocess(@Param('id') id: string): Promise<ImportedInvoiceView> {
    return this.imports.reprocess(id);
  }

  /**
   * What the user decides about an imported note: which lines are a company
   * expense, which become stock and with what package contents, and how the
   * note's discount is attributed.
   */
  @Post('purchases/:purchaseId/classification')
  @HttpCode(HttpStatus.OK)
  classify(
    @Param('purchaseId') purchaseId: string,
    @Body() dto: ClassifyInvoiceDto,
  ): Promise<ImportedInvoiceView> {
    return this.classification.classify({
      purchaseId,
      items: dto.items.map((item) => ({
        itemId: item.itemId,
        isCompanyExpense: item.isCompanyExpense,
        isStockMaterial: item.isStockMaterial,
        ...(item.materialId !== undefined ? { materialId: item.materialId } : {}),
        ...(item.newMaterial !== undefined ? { newMaterial: item.newMaterial } : {}),
        ...(item.packageQuantity !== undefined ? { packageQuantity: item.packageQuantity } : {}),
      })),
      ...(dto.discountAllocationMode !== undefined
        ? { discountAllocationMode: dto.discountAllocationMode }
        : {}),
      ...(dto.manualAllocation !== undefined ? { manualAllocation: dto.manualAllocation } : {}),
    });
  }
}
