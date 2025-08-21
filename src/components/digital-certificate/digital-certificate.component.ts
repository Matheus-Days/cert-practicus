import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, output, OnInit } from '@angular/core';
import { ISelectionSuccessEvent } from '@peculiar/fortify-webcomponents';
import { HttpClient } from '@angular/common/http';
import { PdfSigningService } from '../../app/services/cryptography/pdf-signing.service';
import { CertificatesService } from '../../app/services/certificates.service';

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
export class DigitalCertificateComponent implements OnInit {

  http = inject(HttpClient);
  pdfSigningService = inject(PdfSigningService);
  certificatesService = inject(CertificatesService);

  selected = output<void>();
  cancel = output<void>();

  private static scriptLoaded = false;
  private static cssLoaded = false;

  async ngOnInit(): Promise<void> {
    await this.loadFortifyResources();
  }

  private async loadFortifyResources(): Promise<void> {
    // Carregar CSS se ainda não foi carregado
    if (!DigitalCertificateComponent.cssLoaded) {
      await this.loadCSS();
      DigitalCertificateComponent.cssLoaded = true;
    }

    // Carregar script se ainda não foi carregado
    if (!DigitalCertificateComponent.scriptLoaded) {
      await this.loadScript();
      DigitalCertificateComponent.scriptLoaded = true;
    }
  }

  private loadCSS(): Promise<void> {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/@peculiar/fortify-webcomponents/dist/peculiar/peculiar.css';
      link.onload = () => resolve();
      link.onerror = () => reject(new Error('Falha ao carregar CSS do Fortify'));
      document.head.appendChild(link);
    });
  }

  private loadScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://cdn.jsdelivr.net/npm/@peculiar/fortify-webcomponents/dist/peculiar/peculiar.esm.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar script do Fortify'));
      document.head.appendChild(script);
    });
  }

  async onSelection(ev: Event): Promise<void> {
    const event = ev as CustomEvent<ISelectionSuccessEvent>;
    this.pdfSigningService.selectedCertificate = event.detail;
    this.certificatesService.setSelectedCertificate(event.detail);
    this.selected.emit();
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
