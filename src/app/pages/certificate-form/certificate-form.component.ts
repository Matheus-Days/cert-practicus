import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatStepperModule } from '@angular/material/stepper';
import { CertificatesService } from '../../services/certificates.service';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ICertificate, IProvider } from '@peculiar/fortify-client-core';
import { DigitalCertificateComponent } from '../../../components/digital-certificate/digital-certificate.component';

@Component({
  selector: 'certificate-form',
  standalone: true,
  templateUrl: './certificate-form.component.html',
  styleUrl: './certificate-form.component.scss',
  imports: [
    DigitalCertificateComponent,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatStepperModule,
    ReactiveFormsModule,
  ],
})
export class CertificateFormComponent {
  certificatesService = inject(CertificatesService);

  placeAndDateControl = new FormControl<string>('', {
    nonNullable: true,
    validators: Validators.required,
  });
  certificateProviderControl = new FormControl<IProvider | undefined>(undefined, Validators.required);
  certificateControl = new FormControl<ICertificate | undefined>(undefined, Validators.required);

  form = new FormGroup({
    placeAndDateControl: this.placeAndDateControl,
    certificateProviderControl: this.certificateProviderControl,
    certificateControl: this.certificateControl,
  });

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
    const zipBlob = await this.certificatesService.generateCertificates(
      formatPlaceAndDate(this.placeAndDateControl.value)
    );
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

function formatPlaceAndDate(inputString?: string): string {
  if (!inputString) return "";

  const trimmedString = inputString.trim();

  const firstLetter = trimmedString.charAt(0).toUpperCase();
  const restOfString = trimmedString.slice(1);
  let formattedString = firstLetter + restOfString;

  if (!formattedString.endsWith(".")) {
    formattedString += ".";
  }

  return formattedString;
}
