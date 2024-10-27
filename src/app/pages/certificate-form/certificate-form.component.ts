import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatStepperModule } from '@angular/material/stepper';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { CertificatesService } from '../../services/certificates.service';

@Component({
  selector: 'certificate-form',
  standalone: true,
  templateUrl: './certificate-form.component.html',
  styleUrl: './certificate-form.component.scss',
  imports: [MatButtonModule, MatIconModule, MatStepperModule],
})
export class CertificateFormComponent {
  certificatesService = inject(CertificatesService);

  pdfFile = signal<File | undefined>(undefined);
  workbookFile = signal<File | undefined>(undefined);

  invalidPdf = computed<boolean>(
    () =>
      !this.pdfFile() ||
      (!!this.pdfFile() && !this.certificatesService.pdfValid())
  );
  invalidWorkbook = computed<boolean>(
    () =>
      !this.workbookFile ||
      (!!this.workbookFile() && !this.certificatesService.workbookValid())
  );

  async generateCertificates(): Promise<void> {
    const zipBlob = await this.certificatesService.generateCertificates();
    if (!zipBlob) return;
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'arquivos.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async onSheetSelected(event: Event): Promise<void> {
    const file = fileFromEvent(event);
    if (!file) return;
    this.workbookFile.set(file);
    await this.certificatesService.loadWorkbook(file);
  }

  async onTemplateSelected(event: Event): Promise<void> {
    const file = fileFromEvent(event);
    if (!file) return;
    this.pdfFile.set(file);
    this.certificatesService.loadPdf(file);
  }
}

function fileFromEvent(event: Event): File | undefined {
  if (!event.target) return;
  if (!('files' in event.target)) return;
  const files = event.target.files as FileList;
  return files[0];
}
