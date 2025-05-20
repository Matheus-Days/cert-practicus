import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, output } from '@angular/core';
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
    (selectionCancel)="onCancel()"
  />`,
})
export class DigitalCertificateComponent {

  http = inject(HttpClient);
  pdfSigningService = inject(PdfSigningService);

  selected = output<void>();
  cancel = output<void>();

  async onSelection(ev: Event): Promise<void> {
    const event = ev as CustomEvent<ISelectionSuccessEvent>;
    this.pdfSigningService.selectedCertificate = event.detail;
    this.selected.emit();
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
