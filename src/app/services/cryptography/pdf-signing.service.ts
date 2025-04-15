import { Injectable } from '@angular/core';
import { ISelectionSuccessEvent } from '@peculiar/fortify-webcomponents';
import { PDFDocument } from 'pdf-lib';
import * as forge from 'node-forge';
import { Buffer } from 'buffer';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { findByteRange, removeTrailingNewLine, SUBFILTER_ETSI_CADES_DETACHED } from '@signpdf/utils';

// Adicionar Buffer para o contexto global do browser
window.Buffer = window.Buffer || Buffer;

@Injectable({
  providedIn: 'root',
})
export class PdfSigningService {
  async signPdf(
    certDetails: ISelectionSuccessEvent,
    pdfDoc: PDFDocument
  ): Promise<Blob> {
    const { pdfBuffer, byteRange, placeholderLength } = await prepareForSign({
      pdfDoc,
    });
    const signedPdfBuffer = await performSign(certDetails, pdfBuffer);
    const signedPdf = placeSignature({
      pdfBuffer,
      byteRange,
      placeholderLength,
      rawSignature: signedPdfBuffer,
    });
    return new Blob([signedPdf], { type: 'application/pdf' });
  }
}

export interface AddSignaturePlaceholderArgs {
  pdfDoc: PDFDocument;
  date?: Date;
  name?: string;
  contactInfo?: string;
  reason?: string;
  location?: string;
}

async function prepareForSign({
  pdfDoc,
  ...additionalOptions
}: AddSignaturePlaceholderArgs) {
  pdflibAddPlaceholder({
    pdfDoc,
    reason: additionalOptions.reason || '',
    contactInfo: additionalOptions.contactInfo || '',
    name: additionalOptions.name || '',
    location: additionalOptions.location || '',
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

async function performSign(
  certDetails: ISelectionSuccessEvent,
  pdfBuffer: Buffer
): Promise<Buffer> {
  const provider = await certDetails.socketProvider.getCrypto(
    certDetails.providerId
  );
  const certId = certDetails.certificateId;

  // Exportar certificado
  const cert = await provider.certStorage.getItem(certId);
  const certPem = await provider.certStorage.exportCert('pem', cert);
  const forgeCert = forge.pki.certificateFromPem(certPem);
  const cryptoKey = await provider.certStorage.findPrivateKey(cert);

  if (!cryptoKey) {
    throw new Error('Private key not found');
  }

  // Criar PKCS#7 signed data
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(pdfBuffer.toString('binary'));
  p7.addCertificate(forgeCert);

  // Assinar usando o provider
  const signatureAb = await provider.subtle.sign(
    cert.publicKey.algorithm,
    cryptoKey,
    pdfBuffer
  );
  const signatureRaw = Buffer.from(signatureAb).toString('binary');

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

  // Converter para DER e depois para Blob
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return Buffer.from(der, 'binary');
}

interface PlaceSignatureArgs {
  pdfBuffer: Buffer;
  byteRange: [number, number, number, number];
  placeholderLength: number;
  rawSignature: Buffer;
}

function placeSignature({
  pdfBuffer,
  byteRange,
  placeholderLength,
  rawSignature,
}: PlaceSignatureArgs) {
  // Check if the PDF has a good enough placeholder to fit the signature.
  // placeholderLength represents the length of the HEXified symbols but we're
  // checking the actual lengths.
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
