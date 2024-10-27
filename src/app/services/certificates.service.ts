import { computed, Injectable, signal } from '@angular/core';
import { BlobWriter, ZipWriter, Uint8ArrayReader } from '@zip.js/zip.js';
import { PDFDocument, PDFTextField } from 'pdf-lib';
import { read, utils } from 'xlsx';

type PdfFile = {
  name: string;
  content: Uint8Array;
};

@Injectable({
  providedIn: 'root',
})
export class CertificatesService {
  private pdfArrayBuffer: ArrayBuffer | undefined;
  private _names = signal<string[]>([]);

  private _pdfValid = signal(false);
  private _workbookValid = signal(false);

  names = computed(() => this._names());
  pdfValid = computed(() => this._pdfValid());
  workbookValid = computed(() => this._workbookValid());

  constructor() {}

  private async checkValidity(): Promise<void> {
    if (this.pdfArrayBuffer) {
      const pdf = await PDFDocument.load(this.pdfArrayBuffer);
      let nomeParticipante: PDFTextField | undefined;
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

  async generateCertificates(): Promise<Blob | undefined> {
    if (this._names.length === 0) throw new Error('Empty names list');
    const filledPdfs: PdfFile[] = await Promise.all(
      this._names().map(async (name, i) => {
        if (!this.pdfArrayBuffer) throw new Error('Missing PDF template');
        return {
          name: `${i + 1}-${name}.pdf`,
          content: await fillPdfWithName(name, this.pdfArrayBuffer),
        };
      })
    );
    return generateZip(filledPdfs);
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
    this._names.set(json.map((cell) => cell.nomeParticipante).filter(c => c));
    this.checkValidity();
  }
}

async function fillPdfWithName(
  name: string,
  pdfArrayBuffer: ArrayBuffer
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfArrayBuffer);
  const form = pdf.getForm();
  const nomeParticipante = form.getTextField('nomeParticipante');
  nomeParticipante.setText(name);
  return await pdf.save();
}

async function generateZip(files: PdfFile[]): Promise<Blob | undefined> {
  try {
    const blobWriter = new BlobWriter('application/zip');
    const zipWriter = new ZipWriter(blobWriter);

    for (const file of files) {
      let reader;
      reader = new Uint8ArrayReader(file.content);
      await zipWriter.add(file.name, reader);
    }

    return await zipWriter.close();
  } catch (error) {
    console.error('Error generating ZIP:', error);
    return undefined;
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
