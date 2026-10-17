import { HttpsProxyAgent } from "https-proxy-agent";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { neon } from "@neondatabase/serverless";

import { IDOLS100X_ADDRESS, IDOLS100X_CHAIN_ID } from "./idols100x.ts";
export const MEDIA_COLLECTION_SCOPE = `${IDOLS100X_CHAIN_ID}:${IDOLS100X_ADDRESS.toLowerCase()}`;
export const MEDIA_OBJECT_PREFIX = `aim100x/${MEDIA_COLLECTION_SCOPE}/idol-media`;
export const MEDIA_BUCKET_NAME = "aim100x";

export function mediaStorageConfigured(): boolean {
  return [
    databaseUrl(),
    process.env.R2_ACCOUNT_ID,
    process.env.R2_ACCESS_KEY_ID,
    process.env.R2_SECRET_ACCESS_KEY,
  ].every(Boolean);
}

function databaseUrl() {
  return (
    process.env.AIM100X_DATABASE_URL ||
    process.env.idols100x_DATABASE_URL ||
    process.env.DATABASE_URL
  );
}

export function mediaSql() {
  const url = databaseUrl();
  if (!url) throw new Error("AIM100X_DATABASE_URL is required for the media library");
  return neon(url);
}

export async function initializeMediaSchema() {
  const sql = mediaSql();
  await sql`CREATE TABLE IF NOT EXISTS aim_idol_media (
    collection_scope text NOT NULL,
    id uuid NOT NULL,
    token_id bigint NOT NULL CHECK (token_id > 0),
    scene text NOT NULL,
    tags text NOT NULL DEFAULT '',
    prompt text NOT NULL DEFAULT '',
    type text NOT NULL DEFAULT 'photo',
    content_rating text NOT NULL DEFAULT '' CHECK (content_rating IN ('', 'SFW', 'NSFW')),
    image_key text NOT NULL,
    thumbnail_key text,
    mime text NOT NULL,
    image_sha256 text NOT NULL,
    thumbnail_sha256 text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz,
    PRIMARY KEY(collection_scope,id)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS aim_idol_media_token_scene ON aim_idol_media (collection_scope, token_id, scene) WHERE archived_at IS NULL`;
}

function s3() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY)
    throw new Error("R2 credentials are required");
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  return new S3Client({
    ...(proxy
      ? { requestHandler: { httpsAgent: new HttpsProxyAgent(proxy), requestTimeout: 30_000 } }
      : {}),
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
}

export async function putMediaObject(key: string, bytes: Buffer, mime: string) {
  await s3().send(
    new PutObjectCommand({ Bucket: MEDIA_BUCKET_NAME, Key: key, Body: bytes, ContentType: mime }),
  );
}

export async function deleteMediaObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: MEDIA_BUCKET_NAME, Key: key }));
}

export async function readMediaObject(key: string): Promise<Buffer> {
  const object = await s3().send(new GetObjectCommand({ Bucket: MEDIA_BUCKET_NAME, Key: key }));
  if (!object.Body) throw new Error("Media object has no body");
  return Buffer.from(await object.Body.transformToByteArray());
}

export async function mediaObjectExists(key: string) {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: MEDIA_BUCKET_NAME, Key: key }));
    return true;
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
      return false;
    throw error;
  }
}

// Internal only: signed links are never sent to browsers or stored in Neon.
export async function signedMediaUrl(key: string) {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: MEDIA_BUCKET_NAME, Key: key }), {
    expiresIn: 60,
  });
}
