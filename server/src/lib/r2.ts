import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";

let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;
  const e = env();
  client = new S3Client({
    region: "auto",
    endpoint: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY },
    // R2 does not support the newer default checksum headers on presigned PUTs.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

export async function presignPut(key: string, contentType: string, seconds = 15 * 60): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: env().R2_BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(s3(), cmd, { expiresIn: seconds });
}

export async function presignGet(
  key: string,
  fileName: string,
  contentType: string,
  download: boolean,
  seconds = 10 * 60,
): Promise<string> {
  const safe = fileName.replace(/["\\\r\n]/g, "_");
  const cmd = new GetObjectCommand({
    Bucket: env().R2_BUCKET,
    Key: key,
    ResponseContentType: contentType,
    ResponseContentDisposition: `${download ? "attachment" : "inline"}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  });
  return getSignedUrl(s3(), cmd, { expiresIn: seconds });
}

/** Size in bytes, or null when the object does not exist. */
export async function headObject(key: string): Promise<number | null> {
  try {
    const out = await s3().send(new HeadObjectCommand({ Bucket: env().R2_BUCKET, Key: key }));
    return out.ContentLength ?? 0;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw err;
  }
}

export async function putObject(key: string, body: string | Uint8Array, contentType: string): Promise<void> {
  await s3().send(new PutObjectCommand({ Bucket: env().R2_BUCKET, Key: key, Body: body, ContentType: contentType }));
}

export async function getObjectText(key: string): Promise<string> {
  const out = await s3().send(new GetObjectCommand({ Bucket: env().R2_BUCKET, Key: key }));
  return (await out.Body?.transformToString()) ?? "";
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: env().R2_BUCKET, Key: key }));
}

export async function setBucketCors(origins: string[]): Promise<void> {
  await s3().send(
    new PutBucketCorsCommand({
      Bucket: env().R2_BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            AllowedMethods: ["PUT", "GET", "HEAD"],
            AllowedHeaders: ["content-type"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
}
