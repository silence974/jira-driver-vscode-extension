import * as fs from "node:fs/promises";
import * as path from "node:path";

import { normalizeSiteUrl } from "./strings";

export interface AuthenticatedSiteProvider {
  getAuthorizationHeader(): Promise<string>;
  getSiteUrl(): Promise<string>;
}

export interface OutputLogger {
  appendLine(value: string): void;
}

export interface DownloadRemoteAssetOptions {
  url: string;
  destinationPath: string;
  authProvider: AuthenticatedSiteProvider;
  logger?: OutputLogger;
}

export interface DownloadRemoteAssetResult {
  sourceUrl: string;
  destinationPath: string;
  contentType?: string;
}

export async function downloadRemoteAsset(
  options: DownloadRemoteAssetOptions,
): Promise<DownloadRemoteAssetResult> {
  const siteUrl = await options.authProvider.getSiteUrl();
  const normalizedUrl = normalizeRemoteDownloadUrl(options.url, siteUrl);
  const headers = await buildDownloadHeaders(normalizedUrl, siteUrl, options.authProvider);
  const response = await fetch(normalizedUrl, {
    headers,
    redirect: "follow",
  });

  if (!response.ok) {
    const body = await response.text();
    options.logger?.appendLine(`Asset download failed ${response.status}: ${normalizedUrl} ${body}`);
    throw new Error(`Asset download failed: ${response.status} ${body}`);
  }

  await fs.mkdir(path.dirname(options.destinationPath), { recursive: true });
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(options.destinationPath, bytes);

  return {
    sourceUrl: normalizedUrl,
    destinationPath: options.destinationPath,
    contentType: response.headers.get("content-type") ?? undefined,
  };
}

async function buildDownloadHeaders(
  assetUrl: string,
  siteUrl: string,
  authProvider: AuthenticatedSiteProvider,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: "*/*",
  };

  if (shouldAttachAuthorization(assetUrl, siteUrl)) {
    headers.Authorization = await authProvider.getAuthorizationHeader();
  }

  return headers;
}

function shouldAttachAuthorization(assetUrl: string, siteUrl: string): boolean {
  try {
    return new URL(assetUrl).host === new URL(normalizeSiteUrl(siteUrl)).host;
  } catch {
    return false;
  }
}

function normalizeRemoteDownloadUrl(url: string, siteUrl: string): string {
  const parsedUrl = new URL(url, `${normalizeSiteUrl(siteUrl)}/`);

  if (/\/rest\/api\/(?:2|3)\/attachment\/content\/[^/]+$/i.test(parsedUrl.pathname)) {
    parsedUrl.searchParams.set("redirect", "false");
  }

  return parsedUrl.toString();
}
