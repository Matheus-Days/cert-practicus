import { Injectable, signal, computed } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export interface CertificateProgress {
  current: number;
  total: number;
  name: string;
  percentage: number;
}

export interface CertificateResult {
  zipBlob: Blob;
}

@Injectable({
  providedIn: 'root',
})
export class CertificateWorkerService {
  private worker: Worker | null = null;
  private progressSubject = new Subject<CertificateProgress>();
  private resultSubject = new Subject<CertificateResult>();
  private errorSubject = new Subject<string>();

  private _isProcessing = signal(false);
  private _progress = signal<CertificateProgress | null>(null);

  isProcessing = computed(() => this._isProcessing());
  progress = computed(() => this._progress());

  progress$ = this.progressSubject.asObservable();
  result$ = this.resultSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker(): void {
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(
        new URL('../workers/certificate-generator.worker', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (event) => {
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (error) => {
        this.handleWorkerError(error);
      };
    } else {
      console.error('Web Workers não são suportados neste navegador');
    }
  }

  private handleWorkerMessage(data: any): void {
    switch (data.type) {
      case 'PROGRESS':
        const progress: CertificateProgress = {
          current: data.data.current,
          total: data.data.total,
          name: data.data.name,
          percentage: Math.round((data.data.current / data.data.total) * 100),
        };
        this._progress.set(progress);
        this.progressSubject.next(progress);
        break;

      case 'COMPLETE':
        this._isProcessing.set(false);
        this._progress.set(null);
        this.resultSubject.next({ zipBlob: data.data.zipBlob });
        break;

      case 'ERROR':
        this._isProcessing.set(false);
        this._progress.set(null);
        this.errorSubject.next(data.data.message);
        break;
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    this._isProcessing.set(false);
    this._progress.set(null);
    this.errorSubject.next(`Erro no worker: ${error.message}`);
  }

  generateCertificates(
    names: string[],
    placeAndDate: string,
    pdfArrayBuffer: ArrayBuffer,
    timeout: number
  ): void {
    if (!this.worker) {
      this.errorSubject.next('Worker não está disponível');
      return;
    }

    this._isProcessing.set(true);
    this._progress.set(null);

    this.worker.postMessage({
      type: 'GENERATE_CERTIFICATES',
      data: {
        names,
        placeAndDate,
        pdfArrayBuffer,
        timeout,
      },
    });
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this._isProcessing.set(false);
      this._progress.set(null);
    }
  }

  ngOnDestroy(): void {
    this.terminate();
  }
} 