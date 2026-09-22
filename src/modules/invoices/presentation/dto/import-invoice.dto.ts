import { IsUrl } from 'class-validator';

export class ImportInvoiceDto {
  /**
   * The URL printed in the receipt's QR Code. It is not the note: it points
   * at the state portal's public consultation page, which is what gets read.
   */
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  url!: string;
}
