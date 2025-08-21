import {
  Component,
  computed,
  inject,
  signal,
  OnInit,
  OnDestroy,
  effect,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatStepperModule } from '@angular/material/stepper';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CertificatesService } from '../../services/certificates.service';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ICertificate, IProvider } from '@peculiar/fortify-client-core';
import { DigitalCertificateComponent } from '../../../components/digital-certificate/digital-certificate.component';
import { Subscription } from 'rxjs';

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
    MatProgressBarModule,
    ReactiveFormsModule,
  ],
})
export class CertificateFormComponent implements OnInit, OnDestroy {
  certificatesService = inject(CertificatesService);
  private snackBar = inject(MatSnackBar);
  private subscriptions = new Subscription();

  placeAndDateControl = new FormControl<string>('', {
    nonNullable: true,
  });
  timeoutControl = new FormControl<number>(500, {
    nonNullable: true,
    validators: [Validators.required, Validators.min(100)],
  });
  certificateProviderControl = new FormControl<IProvider | undefined>(
    undefined,
    Validators.required
  );
  certificateControl = new FormControl<ICertificate | undefined>(
    undefined,
    Validators.required
  );

  form = new FormGroup({
    placeAndDateControl: this.placeAndDateControl,
    timeoutControl: this.timeoutControl,
    certificateProviderControl: this.certificateProviderControl,
    certificateControl: this.certificateControl,
  });

  pdfFile = signal<File | undefined>(undefined);
  workbookFile = signal<File | undefined>(undefined);

  // Computed properties para o progresso
  isProcessing = computed(() => this.certificatesService.isProcessing());
  progress = computed(() => this.certificatesService.progress());

  invalidPdf = computed<boolean>(
    () =>
      !this.pdfFile() ||
      (!!this.pdfFile() && !this.certificatesService.pdfValid())
  );

  invalidWorkbook = computed<boolean>(
    () =>
      !this.workbookFile() ||
      (!!this.workbookFile() && !this.certificatesService.workbookValid())
  );

  // Computed para verificar se o campo local e data é obrigatório
  isPlaceAndDateRequired = computed<boolean>(() =>
    this.certificatesService.hasLocalEDataField()
  );

  constructor() {
    // Effect para atualizar validações do campo local e data
    effect(() => {
      const hasField = this.certificatesService.hasLocalEDataField();
      if (hasField) {
        this.placeAndDateControl.addValidators(Validators.required);
      } else {
        this.placeAndDateControl.removeValidators(Validators.required);
      }
      this.placeAndDateControl.updateValueAndValidity();
    });
  }

  ngOnInit(): void {
    // Inscrever nos observables do worker
    this.subscriptions.add(
      this.certificatesService.result$.subscribe((result) => {
        this.downloadZip(result.zipBlob);
        this.snackBar.open('Certificados gerados com sucesso!', 'Fechar', {
          duration: 3000,
        });
      })
    );

    this.subscriptions.add(
      this.certificatesService.error$.subscribe((error) => {
        this.snackBar.open(`Erro: ${error}`, 'Fechar', {
          duration: 5000,
        });
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  generateCertificates(): void {
    try {
      this.certificatesService.generateCertificates(
        formatPlaceAndDate(this.placeAndDateControl.value),
        this.timeoutControl.value
      );
    } catch (error) {
      this.snackBar.open(
        `Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        'Fechar',
        {
          duration: 5000,
        }
      );
    }
  }

  private downloadZip(zipBlob: Blob): void {
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'certificados.zip';
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
  if (!inputString) return '';

  const trimmedString = inputString.trim();

  const firstLetter = trimmedString.charAt(0).toUpperCase();
  const restOfString = trimmedString.slice(1);
  let formattedString = firstLetter + restOfString;

  if (!formattedString.endsWith('.')) {
    formattedString += '.';
  }

  return formattedString;
}
