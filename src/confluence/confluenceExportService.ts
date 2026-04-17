import * as fs from "node:fs/promises";
import * as path from "node:path";

import { ConfluencePageDetail } from "../models";
import { JiraAuthSessionProvider, OutputLogger } from "../jira/jiraClient";
import {
  buildConfluenceExportLocation,
  buildRemoteAssetLookupKeys,
  extractMarkdownLinks,
  isImageLike,
  rewriteMarkdownLinks,
  sanitizeExportFileName,
  toPosixRelativePath,
} from "../utils/exportFiles";
import { downloadRemoteAsset } from "../utils/remoteAssets";
import { ConfluenceMarkdownExportService } from "./confluenceMarkdownExportService";

interface ExportedAsset {
  fileName: string;
  relativePath: string;
  absolutePath: string;
  sourceUrl: string;
  mimeType?: string;
  isImage: boolean;
}

export interface ConfluenceExportResult {
  markdownPath: string;
  attachmentCount: number;
  imageCount: number;
}

export class ConfluenceExportService {
  public constructor(
    private readonly authProvider: JiraAuthSessionProvider,
    private readonly markdownExportService: ConfluenceMarkdownExportService,
    private readonly logger?: OutputLogger,
  ) {}

  public async exportPage(
    page: ConfluencePageDetail,
    workspaceRoot: string,
    options: {
      downloadAttachments: boolean;
    },
  ): Promise<ConfluenceExportResult> {
    const location = buildConfluenceExportLocation(workspaceRoot, page);
    const markdownDirectory = path.dirname(location.markdownPath);
    const usedFileNames = new Set<string>();
    const assetLookup = new Map<string, ExportedAsset>();
    const attachmentAssets: ExportedAsset[] = [];
    let markdown = this.markdownExportService.buildMarkdown(page);

    if (options.downloadAttachments) {
      for (const attachment of page.attachments) {
        const exportedAsset = await this.tryDownloadNamedAsset(
          attachment.downloadUrl,
          attachment.title,
          attachment.mediaType,
          location.assetDir,
          markdownDirectory,
          usedFileNames,
        );
        if (!exportedAsset) {
          continue;
        }

        attachmentAssets.push(exportedAsset);
        this.registerAsset(assetLookup, exportedAsset, [
          attachment.downloadUrl,
          attachment.webUrl,
          attachment.title,
        ]);
      }
    }

    const rewrites = new Map<string, string>();

    for (const link of extractMarkdownLinks(markdown)) {
      if (!link.isImage && !options.downloadAttachments) {
        continue;
      }

      const existingAsset = this.findRegisteredAsset(assetLookup, link.url);
      if (existingAsset) {
        rewrites.set(link.url, existingAsset.relativePath);
        continue;
      }

      if (!link.isImage) {
        continue;
      }

      const exportedAsset = await this.tryDownloadNamedAsset(
        link.url,
        undefined,
        undefined,
        location.assetDir,
        markdownDirectory,
        usedFileNames,
      );
      if (!exportedAsset) {
        continue;
      }

      this.registerAsset(assetLookup, exportedAsset, [link.url]);
      rewrites.set(link.url, exportedAsset.relativePath);
    }

    markdown = rewriteMarkdownLinks(markdown, rewrites);

    if (options.downloadAttachments && attachmentAssets.length) {
      markdown = appendDownloadedAttachmentSection(markdown, attachmentAssets);
    }

    await fs.mkdir(path.dirname(location.markdownPath), { recursive: true });
    await fs.writeFile(location.markdownPath, markdown, "utf8");

    const uniqueAssets = [...new Map(
      [...assetLookup.values()].map((asset) => [asset.absolutePath, asset]),
    ).values()];
    return {
      markdownPath: location.markdownPath,
      attachmentCount: attachmentAssets.length,
      imageCount: uniqueAssets.filter((asset) => asset.isImage).length,
    };
  }

  private async tryDownloadNamedAsset(
    url: string,
    preferredFileName: string | undefined,
    mimeType: string | undefined,
    assetDirectory: string,
    markdownDirectory: string,
    usedFileNames: Set<string>,
  ): Promise<ExportedAsset | undefined> {
    try {
      return await this.downloadNamedAsset(
        url,
        preferredFileName,
        mimeType,
        assetDirectory,
        markdownDirectory,
        usedFileNames,
      );
    } catch (error) {
      this.logger?.appendLine(`Skipping Confluence asset after download failure: ${url} ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  private async downloadNamedAsset(
    url: string,
    preferredFileName: string | undefined,
    mimeType: string | undefined,
    assetDirectory: string,
    markdownDirectory: string,
    usedFileNames: Set<string>,
  ): Promise<ExportedAsset> {
    const fileName = this.allocateFileName(preferredFileName ?? url, mimeType, usedFileNames);
    const absolutePath = path.join(assetDirectory, fileName);
    await downloadRemoteAsset({
      url,
      destinationPath: absolutePath,
      authProvider: this.authProvider,
      logger: this.logger,
    });

    return {
      fileName,
      absolutePath,
      sourceUrl: url,
      mimeType,
      isImage: isImageLike(url, fileName, mimeType),
      relativePath: toPosixRelativePath(markdownDirectory, absolutePath),
    };
  }

  private allocateFileName(
    rawFileName: string,
    mimeType: string | undefined,
    usedFileNames: Set<string>,
  ): string {
    const fileName = withKnownExtension(sanitizeExportFileName(rawFileName), mimeType);
    const parsed = path.parse(fileName);
    let candidate = fileName;
    let index = 2;

    while (usedFileNames.has(candidate)) {
      candidate = `${parsed.name}_${index}${parsed.ext}`;
      index += 1;
    }

    usedFileNames.add(candidate);
    return candidate;
  }

  private registerAsset(
    assetLookup: Map<string, ExportedAsset>,
    asset: ExportedAsset,
    aliases: Array<string | undefined>,
  ): void {
    for (const alias of aliases) {
      for (const key of buildRemoteAssetLookupKeys(alias)) {
        assetLookup.set(key, asset);
      }
    }
  }

  private findRegisteredAsset(
    assetLookup: Map<string, ExportedAsset>,
    url: string,
  ): ExportedAsset | undefined {
    for (const key of buildRemoteAssetLookupKeys(url)) {
      const asset = assetLookup.get(key);
      if (asset) {
        return asset;
      }
    }

    return undefined;
  }
}

function appendDownloadedAttachmentSection(markdown: string, assets: ExportedAsset[]): string {
  const lines = [
    markdown.trimEnd(),
    "",
    "## Downloaded Attachments",
    "",
    ...assets.map((asset) => `- [${asset.fileName}](${asset.relativePath})`),
  ];

  const imageAssets = assets.filter((asset) => asset.isImage);
  if (imageAssets.length) {
    lines.push("", "## Attachment Previews", "");
    for (const asset of imageAssets) {
      lines.push(`![${asset.fileName}](${asset.relativePath})`, "");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

function withKnownExtension(fileName: string, mimeType: string | undefined): string {
  if (path.extname(fileName) || !mimeType) {
    return fileName;
  }

  const extension = mimeTypeToExtension(mimeType);
  return extension ? `${fileName}.${extension}` : fileName;
}

function mimeTypeToExtension(mimeType: string): string | undefined {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "application/pdf":
      return "pdf";
    default:
      return undefined;
  }
}
