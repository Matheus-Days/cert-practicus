import { PDFDocument } from 'pdf-lib';
import { BlobWriter, ZipWriter, Uint8ArrayReader } from '@zip.js/zip.js';

type PdfNamedDocument = {
  name: string;
  content: PDFDocument;
};

type PdfFile = {
  name: string;
  content: Uint8Array;
};

type WorkerMessage = {
  type: 'GENERATE_CERTIFICATES';
  data: {
    names: string[];
    placeAndDate: string;
    pdfArrayBuffer: ArrayBuffer;
    timeout: number;
  };
};

type ProgressMessage = {
  type: 'PROGRESS';
  data: {
    current: number;
    total: number;
    name: string;
  };
};

type CompleteMessage = {
  type: 'COMPLETE';
  data: {
    zipBlob: Blob;
  };
};

type ErrorMessage = {
  type: 'ERROR';
  data: {
    message: string;
  };
};

// Função para preencher PDF com dados
async function fillPdfWithData(
  name: string,
  placeAndDate: string,
  pdfArrayBuffer: ArrayBuffer
): Promise<PDFDocument> {
  const pdf = await PDFDocument.load(pdfArrayBuffer);
  const form = pdf.getForm();
  const nomeParticipante = form.getTextField('nomeParticipante');
  nomeParticipante.setText(name);
  const localEData = form.getTextField('localEData');
  localEData.setText(placeAndDate);
  form.flatten();
  return pdf;
}

// Função para gerar ZIP
async function generateZip(files: PdfFile[]): Promise<Blob> {
  const blobWriter = new BlobWriter('application/zip');
  const zipWriter = new ZipWriter(blobWriter);

  for (const file of files) {
    const reader = new Uint8ArrayReader(file.content);
    await zipWriter.add(file.name, reader);
  }

  return await zipWriter.close();
}

// Função para assinar PDF (simulada - você precisará implementar a lógica real)
async function signPdf(pdf: PdfNamedDocument, timeout: number): Promise<PdfFile> {
  // Simular um delay baseado no timeout configurado
  await new Promise(resolve => setTimeout(resolve, timeout));
  
  // Por enquanto, vamos apenas converter o PDF para Uint8Array
  // Em uma implementação real, aqui você chamaria o serviço de assinatura
  const pdfBytes = await pdf.content.save();
  return {
    name: pdf.name,
    content: pdfBytes,
  };
}

// Função principal para gerar certificados
async function generateCertificates(
  names: string[],
  placeAndDate: string,
  pdfArrayBuffer: ArrayBuffer,
  timeout: number
): Promise<void> {
  try {
    const total = names.length;
    const filledPdfs: PdfNamedDocument[] = [];
    const signedPdfs: PdfFile[] = [];

    // Primeira etapa: preencher PDFs
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const filledPdf = await fillPdfWithData(name, placeAndDate, pdfArrayBuffer);
      filledPdfs.push({
        name: `${i + 1}-${name}.pdf`,
        content: filledPdf,
      });

      // Enviar progresso
      postMessage({
        type: 'PROGRESS',
        data: {
          current: i + 1,
          total: total * 2, // Total considerando preenchimento + assinatura
          name: `Gerando: ${name} (${i + 1}/${total})`,
        },
      } as ProgressMessage);
    }

    // Segunda etapa: assinar PDFs
    for (let i = 0; i < filledPdfs.length; i++) {
      const pdf = filledPdfs[i];
      const signedPdf = await signPdf(pdf, timeout);
      signedPdfs.push(signedPdf);

      // Enviar progresso - contagem independente para assinatura
      postMessage({
        type: 'PROGRESS',
        data: {
          current: total + i + 1, // Mantém a contagem total para a barra de progresso
          total: total * 2,
          name: `Assinando: ${pdf.name} (${i + 1}/${total})`,
        },
      } as ProgressMessage);
    }

    // Terceira etapa: gerar ZIP
    const zipBlob = await generateZip(signedPdfs);

    // Enviar resultado final
    postMessage({
      type: 'COMPLETE',
      data: {
        zipBlob,
      },
    } as CompleteMessage);
  } catch (error) {
    postMessage({
      type: 'ERROR',
      data: {
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      },
    } as ErrorMessage);
  }
}

// Listener para mensagens do contexto principal
addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  if (event.data.type === 'GENERATE_CERTIFICATES') {
    const { names, placeAndDate, pdfArrayBuffer, timeout } = event.data.data;
    generateCertificates(names, placeAndDate, pdfArrayBuffer, timeout);
  }
}); 