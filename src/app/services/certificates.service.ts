import { computed, inject, Injectable, signal } from '@angular/core';
import { read, utils } from 'xlsx';
import { CertificateWorkerService, CertificateProgress, CertificateResult } from './certificate-worker.service';
import { ISelectionSuccessEvent } from '@peculiar/fortify-webcomponents';

@Injectable({
  providedIn: 'root',
})
export class CertificatesService {
  private certificateWorkerService = inject(CertificateWorkerService);

  private pdfArrayBuffer: ArrayBuffer | undefined;
  private _names = signal<string[]>([]);
  private _selectedCertificate = signal<ISelectionSuccessEvent | undefined>(undefined);

  private _pdfValid = signal(false);
  private _workbookValid = signal(false);

  names = computed(() => this._names());
  pdfValid = computed(() => this._pdfValid());
  workbookValid = computed(() => this._workbookValid());
  selectedCertificate = computed(() => this._selectedCertificate());

  // Expor observables do worker
  isProcessing = computed(() => this.certificateWorkerService.isProcessing());
  progress = computed(() => this.certificateWorkerService.progress());
  progress$ = this.certificateWorkerService.progress$;
  result$ = this.certificateWorkerService.result$;
  error$ = this.certificateWorkerService.error$;

  // Método para definir o certificado selecionado
  setSelectedCertificate(certificate: ISelectionSuccessEvent): void {
    this._selectedCertificate.set(certificate);
  }

  private async checkValidity(): Promise<void> {
    if (this.pdfArrayBuffer) {
      // Importação dinâmica para evitar problemas no worker
      const { PDFDocument } = await import('pdf-lib');
      const pdf = await PDFDocument.load(this.pdfArrayBuffer);
      let nomeParticipante: any;
      try {
        const form = pdf.getForm();
        nomeParticipante = form.getTextField('nomeParticipante');
      } catch {
        nomeParticipante = undefined;
      }
      this._pdfValid.set(!!nomeParticipante);
    } else {
      this._pdfValid.set(false);
    }
    this._workbookValid.set(this._names().length > 0);
  }

  generateCertificates(placeAndDate: string, timeout: number): void {
    if (this._names().length === 0) {
      throw new Error('Lista de nomes vazia');
    }
    if (!this.pdfArrayBuffer) {
      throw new Error('Template PDF não carregado');
    }

    this.certificateWorkerService.generateCertificates(
      this._names(),
      placeAndDate,
      this.pdfArrayBuffer,
      timeout,
      this._selectedCertificate()
    );
  }

  async loadPdf(file: File): Promise<void> {
    this.pdfArrayBuffer = await getArrayBuffer(file);
    this.checkValidity();
  }

  async loadWorkbook(file: File): Promise<void> {
    const arrayBuffer = await getArrayBuffer(file);
    const workbook = read(arrayBuffer);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    type Cell = { nomeParticipante: string };
    const json: Cell[] = utils.sheet_to_json(worksheet);
    const names = json
      .map((cell) => cell.nomeParticipante.toUpperCase())
      .filter((c) => c)
      .sort((a, b) => {
        return a > b ? 1 : -1;
      });
    this._names.set(names);
    this.checkValidity();
  }
}

async function getArrayBuffer(file: File) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const res = event.target?.result;
      if (res) resolve(res as ArrayBuffer);
      else reject(`Null value from converting ${file.name} to ArrayBuffer`);
    };
    reader.onerror = () => {
      reject('File could not be read!');
    };
    reader.readAsArrayBuffer(file);
  });
}
