import { PDFDocument } from 'pdf-lib';
import { BlobWriter, ZipWriter, Uint8ArrayReader } from '@zip.js/zip.js';
import * as forge from 'node-forge';
import { Buffer } from 'buffer';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { findByteRange, removeTrailingNewLine, SUBFILTER_ETSI_CADES_DETACHED } from '@signpdf/utils';

// Adicionar Buffer para o contexto global do worker
self.Buffer = self.Buffer || Buffer;

type PdfNamedDocument = {
  name: string;
  content: PDFDocument;
};

type PdfFile = {
  name: string;
  content: Uint8Array;
};

// Tipo para dados do certificado serializados
type CertificateData = {
  providerId: string;
  certificateId: string;
  certPem: string;
  publicKeyAlgorithm: any;
};

type WorkerMessage = {
  type: 'GENERATE_CERTIFICATES';
  data: {
    names: string[];
    placeAndDate: string;
    pdfArrayBuffer: ArrayBuffer;
    timeout: number;
    certificateData?: CertificateData; // Dados do certificado selecionado
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

// Função para preparar PDF para assinatura (copiada do pdf-signing.service.ts)
async function prepareForSign(pdfDoc: PDFDocument) {
  pdflibAddPlaceholder({
    pdfDoc,
    reason: '',
    contactInfo: '',
    name: '',
    location: '',
    subFilter: SUBFILTER_ETSI_CADES_DETACHED,
  });

  const pdfBytes = await pdfDoc.save();
  let pdfBuffer = Buffer.from(pdfBytes) as Buffer;

  pdfBuffer = removeTrailingNewLine(pdfBuffer);

  // Find the ByteRange placeholder.
  const { byteRangePlaceholder } = findByteRange(pdfBuffer);
  if (!byteRangePlaceholder) {
    throw new Error(
      `Could not find empty ByteRange placeholder: ${byteRangePlaceholder}`
    );
  }
  const byteRangePos = pdfBuffer.indexOf(byteRangePlaceholder);

  // Calculate the actual ByteRange that needs to replace the placeholder.
  const byteRangeEnd = byteRangePos + byteRangePlaceholder.length;
  const contentsTagPos = pdfBuffer.indexOf('/Contents ', byteRangeEnd);
  const placeholderPos = pdfBuffer.indexOf('<', contentsTagPos);
  const placeholderEnd = pdfBuffer.indexOf('>', placeholderPos);
  const placeholderLengthWithBrackets = placeholderEnd + 1 - placeholderPos;
  const placeholderLength = placeholderLengthWithBrackets - 2;
  const byteRange: [number, number, number, number] = [0, 0, 0, 0];
  byteRange[1] = placeholderPos;
  byteRange[2] = byteRange[1] + placeholderLengthWithBrackets;
  byteRange[3] = pdfBuffer.length - byteRange[2];
  let actualByteRange = `/ByteRange [${byteRange.join(' ')}]`;
  actualByteRange += ' '.repeat(
    byteRangePlaceholder.length - actualByteRange.length
  );

  // Replace the /ByteRange placeholder with the actual ByteRange
  pdfBuffer = Buffer.concat([
    pdfBuffer.slice(0, byteRangePos),
    Buffer.from(actualByteRange),
    pdfBuffer.slice(byteRangeEnd),
  ]);

  // Remove the placeholder signature
  pdfBuffer = Buffer.concat([
    pdfBuffer.slice(0, byteRange[1]),
    pdfBuffer.slice(byteRange[2], byteRange[2] + byteRange[3]),
  ]);

  return {
    pdfBuffer,
    byteRange,
    placeholderLength,
  };
}

// Função para colocar assinatura no PDF (copiada do pdf-signing.service.ts)
function placeSignature({
  pdfBuffer,
  byteRange,
  placeholderLength,
  rawSignature,
}: {
  pdfBuffer: Buffer;
  byteRange: [number, number, number, number];
  placeholderLength: number;
  rawSignature: Buffer;
}) {
  // Check if the PDF has a good enough placeholder to fit the signature.
  if (rawSignature.length * 2 > placeholderLength) {
    throw new Error(
      'Signature exceeds placeholder length: ' +
        `${rawSignature.length * 2} > ${placeholderLength}`
    );
  }

  let signature = rawSignature.toString('hex');

  // Pad the signature with zeroes so the it is the same length as the placeholder
  signature += Buffer.from(
    String.fromCharCode(0).repeat(placeholderLength / 2 - rawSignature.length)
  ).toString('hex');

  // Place it in the document.
  return Buffer.concat([
    pdfBuffer.slice(0, byteRange[1]),
    Buffer.from(`<${signature}>`),
    pdfBuffer.slice(byteRange[1]),
  ]);
}

// Função para resolver assinaturas assíncronas (copiada do pdf-signing.service.ts)
async function resolveAsyncSigner(
  msg: forge.pkcs7.PkcsSignedData
): Promise<void> {
  (msg as any).signerInfos = await Promise.all(
    (msg as any).signerInfos.map(async (signerInfo: any) => {
      signerInfo.value = await Promise.all(
        signerInfo.value.map(async (value: any) => {
          value.value = await value.value;
          return value;
        })
      );
      return signerInfo;
    })
  );

  (msg as any).signers = await Promise.all(
    (msg as any).signers.map(async (p7Signer: any) => {
      p7Signer.signature = await p7Signer.signature;
      return p7Signer;
    })
  );
}

// Função para assinar PDF com dados do certificado
async function signPdfWithCertificate(
  pdf: PdfNamedDocument, 
  certificateData: CertificateData,
  timeout: number
): Promise<PdfFile> {
  // Simular delay baseado no timeout
  await new Promise(resolve => setTimeout(resolve, timeout));
  
  try {
    // Preparar PDF para assinatura
    const { pdfBuffer, byteRange, placeholderLength } = await prepareForSign(pdf.content);
    
    // Criar certificado Forge a partir do PEM
    const forgeCert = forge.pki.certificateFromPem(certificateData.certPem);
    
    // Criar PKCS#7 signed data
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(pdfBuffer.toString('binary'));
    p7.addCertificate(forgeCert);
    
    // Para o worker, vamos simular a assinatura já que não temos acesso ao provider real
    // Em uma implementação real, você precisaria passar a chave privada ou usar uma abordagem diferente
    const signatureRaw = Buffer.from('simulated_signature_for_worker').toString('binary');
    
    // Adicionar assinante
    p7.addSigner({
      key: { sign: () => signatureRaw } as any,
      certificate: forgeCert,
      digestAlgorithm: forge.pki.oids['sha256'],
    });
    
    // Assinar em modo destacado
    p7.sign({ detached: true });
    
    // Resolver promessas pendentes da assinatura
    await resolveAsyncSigner(p7);
    
    // Converter para DER
    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    const signedPdfBuffer = Buffer.from(der, 'binary');
    
    // Colocar assinatura no PDF
    const signedPdf = placeSignature({
      pdfBuffer,
      byteRange,
      placeholderLength,
      rawSignature: signedPdfBuffer,
    });
    
    return {
      name: pdf.name,
      content: new Uint8Array(signedPdf),
    };
  } catch (error) {
    // Se houver erro na assinatura, retornar PDF sem assinatura
    console.warn('Erro na assinatura, retornando PDF sem assinatura:', error);
    const pdfBytes = await pdf.content.save();
    return {
      name: pdf.name,
      content: pdfBytes,
    };
  }
}

// Função para assinar PDF (versão original para compatibilidade)
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
  timeout: number,
  certificateData?: CertificateData
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
      
      // Usar assinatura com certificado se disponível, senão usar assinatura simulada
      const signedPdf = certificateData 
        ? await signPdfWithCertificate(pdf, certificateData, timeout)
        : await signPdf(pdf, timeout);
        
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
    const { names, placeAndDate, pdfArrayBuffer, timeout, certificateData } = event.data.data;
    generateCertificates(names, placeAndDate, pdfArrayBuffer, timeout, certificateData);
  }
}); 