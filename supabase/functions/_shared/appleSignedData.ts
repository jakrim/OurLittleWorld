import {
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from 'npm:@apple/app-store-server-library@3.1.0';
import { Buffer } from 'node:buffer';

const APPLE_ROOT_CERTIFICATE_URLS = [
  'https://www.apple.com/appleca/AppleIncRootCertificate.cer',
  'https://www.apple.com/certificateauthority/AppleRootCA-G2.cer',
  'https://www.apple.com/certificateauthority/AppleRootCA-G3.cer',
] as const;

let rootCertificatesPromise: Promise<Buffer[]> | null = null;

export async function verifyAppleNotification(signedPayload: string, {
  bundleId,
  appAppleId,
}: {
  bundleId: string;
  appAppleId: number;
}) {
  if (!signedPayload) throw new Error('Missing signedPayload.');
  const roots = await loadAppleRootCertificates();
  const production = new SignedDataVerifier(
    roots,
    true,
    Environment.PRODUCTION,
    bundleId,
    appAppleId,
  );
  const sandbox = new SignedDataVerifier(
    roots,
    true,
    Environment.SANDBOX,
    bundleId,
  );

  let environment: Environment.PRODUCTION | Environment.SANDBOX;
  let notification: ResponseBodyV2DecodedPayload;
  try {
    notification = await production.verifyAndDecodeNotification(signedPayload);
    environment = Environment.PRODUCTION;
  } catch (productionError) {
    try {
      notification = await sandbox.verifyAndDecodeNotification(signedPayload);
      environment = Environment.SANDBOX;
    } catch (sandboxError) {
      throw new AggregateError(
        [productionError, sandboxError],
        'App Store notification signature or app identity was invalid.',
      );
    }
  }

  const signedTransaction = notification.data?.signedTransactionInfo;
  let transaction: JWSTransactionDecodedPayload = {};
  if (signedTransaction) {
    transaction = environment === Environment.PRODUCTION
      ? await production.verifyAndDecodeTransaction(signedTransaction)
      : await sandbox.verifyAndDecodeTransaction(signedTransaction);
  }

  return { environment, notification, transaction };
}

async function loadAppleRootCertificates() {
  if (!rootCertificatesPromise) {
    rootCertificatesPromise = Promise.all(APPLE_ROOT_CERTIFICATE_URLS.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Apple trust anchor could not be loaded (${response.status}).`);
      return Buffer.from(await response.arrayBuffer());
    }));
  }
  return rootCertificatesPromise;
}
