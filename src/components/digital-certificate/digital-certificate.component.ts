import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { ISelectionSuccessEvent } from '@peculiar/fortify-webcomponents';
import { HttpClient } from '@angular/common/http';
import { PDFDocument } from 'pdf-lib';
import { firstValueFrom } from 'rxjs';
import { PdfSigningService } from '../../app/services/cryptography/pdf-signing.service';

@Component({
  standalone: true,
  selector: 'digital-certificate-component',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<peculiar-fortify-certificates
    language="pt"
    (selectionSuccess)="onSelection($event)"
  />`,
})
export class DigitalCertificateComponent {

  http = inject(HttpClient);
  pdfSigningService = inject(PdfSigningService);

  async onSelection(ev: Event): Promise<void> {
    try {
      const event = ev as CustomEvent<ISelectionSuccessEvent>;
      
      // Obtém o PDF
      const pdfBytes = await firstValueFrom(
        this.http.get('exemplo.pdf', { responseType: 'arraybuffer' })
      );
      
      const pdfDoc = await PDFDocument.load(pdfBytes);

      // Assina o PDF
      const signedPdfBlob = await this.pdfSigningService.signPdf(event.detail, pdfDoc);
      
      // Aqui você pode fazer o que precisar com o PDF assinado
      // Por exemplo, fazer download:
      const url = URL.createObjectURL(signedPdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'documento-assinado.pdf';
      a.click();
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Erro no processo de assinatura:', error);
    }
  }
}
