import * as fs from "node:fs/promises";
import * as path from "node:path";

import {
  HandoffArtifacts,
  IssueScoringResult,
  JiraIssueDetail,
  WorkspaceContext,
} from "../models";
import { JIRA_DRIVER_FOLDER, JIRA_DRIVER_TASKS_FOLDER } from "../constants";
import { JiraAuthSessionProvider, OutputLogger } from "../jira/jiraClient";
import {
  extractMarkdownLinks,
  isImageLike,
  rewriteMarkdownLinks,
  sanitizeExportFileName,
  toPosixRelativePath,
} from "../utils/exportFiles";
import { downloadRemoteAsset } from "../utils/remoteAssets";
import { slugify } from "../utils/strings";
import {
  buildHandoffPrompt,
  buildHandoffReadme,
  buildTaskJson,
  HandoffLocalAttachment,
} from "./handoffTemplates";

export class HandoffService {
  public constructor(
    private readonly authProvider: JiraAuthSessionProvider,
    private readonly logger?: OutputLogger,
  ) {}

  public async prepare(
    issue: JiraIssueDetail,
    scoring: IssueScoringResult,
    workspaceContext: WorkspaceContext,
  ): Promise<HandoffArtifacts> {
    const branchName = `jira/${issue.key.toLowerCase()}-${slugify(issue.summary)}`;
    const folderPath = path.join(workspaceContext.workspaceRoot, JIRA_DRIVER_TASKS_FOLDER, issue.key);
    const readmePath = path.join(folderPath, "README.md");
    const promptPath = path.join(folderPath, "prompt.md");
    const taskPath = path.join(folderPath, "task.json");

    await fs.mkdir(folderPath, { recursive: true });
    await this.ensureGitExclude(workspaceContext.workspaceRoot);
    const localAttachments = await this.downloadImageAttachments(issue, folderPath);

    const readmeMarkdown = await this.localizeReadmeImages(
      buildHandoffReadme(issue, scoring, workspaceContext, branchName, localAttachments),
      folderPath,
      localAttachments,
    );
    const promptText = buildHandoffPrompt(
      issue,
      path.relative(workspaceContext.workspaceRoot, readmePath).replaceAll(path.sep, "/"),
      branchName,
    );

    const artifactsWithoutTask = {
      folderPath,
      readmePath,
      promptPath,
      branchName,
      readmeMarkdown,
      promptText,
      taskPath,
    };

    const taskJson = buildTaskJson(issue, scoring, workspaceContext, artifactsWithoutTask);

    await Promise.all([
      fs.writeFile(readmePath, readmeMarkdown, "utf8"),
      fs.writeFile(promptPath, promptText, "utf8"),
      fs.writeFile(taskPath, taskJson, "utf8"),
    ]);

    return {
      ...artifactsWithoutTask,
      taskJson,
    };
  }

  private async localizeReadmeImages(
    markdown: string,
    folderPath: string,
    localAttachments: HandoffLocalAttachment[],
  ): Promise<string> {
    const assetDir = path.join(folderPath, "assets");
    const rewrites = new Map<string, string>();
    const usedFileNames = new Set(
      localAttachments
        .map((attachment) => path.basename(attachment.relativePath))
        .filter(Boolean),
    );

    for (const link of extractMarkdownLinks(markdown)) {
      if (!link.isImage || rewrites.has(link.url) || isLocalAssetReference(link.url)) {
        continue;
      }

      const fileName = allocateUniqueFileName(fileNameFromUrl(link.url), usedFileNames);
      const absolutePath = path.join(assetDir, fileName);

      await downloadRemoteAsset({
        url: link.url,
        destinationPath: absolutePath,
        authProvider: this.authProvider,
        logger: this.logger,
      });

      rewrites.set(link.url, toPosixRelativePath(folderPath, absolutePath));
    }

    return rewriteMarkdownLinks(markdown, rewrites);
  }

  private async downloadImageAttachments(
    issue: JiraIssueDetail,
    folderPath: string,
  ): Promise<HandoffLocalAttachment[]> {
    const imageAttachments = issue.attachments.filter((attachment) => (
      Boolean(attachment.contentUrl) && isImageLike(attachment.contentUrl, attachment.filename, attachment.mimeType)
    ));

    if (!imageAttachments.length) {
      return [];
    }

    const assetDir = path.join(folderPath, "assets");
    const usedFileNames = new Set<string>();
    const localAttachments: HandoffLocalAttachment[] = [];

    for (const attachment of imageAttachments) {
      const fileName = allocateUniqueFileName(attachment.filename, usedFileNames);
      const absolutePath = path.join(assetDir, fileName);

      await downloadRemoteAsset({
        url: attachment.contentUrl!,
        destinationPath: absolutePath,
        authProvider: this.authProvider,
        logger: this.logger,
      });

      localAttachments.push({
        attachmentId: attachment.id,
        filename: attachment.filename,
        relativePath: toPosixRelativePath(folderPath, absolutePath),
        mimeType: attachment.mimeType,
        isImage: true,
      });
    }

    return localAttachments;
  }

  private async ensureGitExclude(workspaceRoot: string): Promise<void> {
    const excludePath = path.join(workspaceRoot, ".git", "info", "exclude");

    try {
      const current = await fs.readFile(excludePath, "utf8");
      if (current.includes(`${JIRA_DRIVER_FOLDER}/`)) {
        return;
      }

      await fs.writeFile(excludePath, `${current.trimEnd()}\n${JIRA_DRIVER_FOLDER}/\n`, "utf8");
    } catch {
      // Ignore missing Git repositories for now.
    }
  }
}

function allocateUniqueFileName(fileName: string, usedFileNames: Set<string>): string {
  const sanitized = sanitizeExportFileName(fileName, "attachment");
  const parsed = path.parse(sanitized);
  let candidate = sanitized;
  let index = 2;

  while (usedFileNames.has(candidate)) {
    candidate = `${parsed.name}_${index}${parsed.ext}`;
    index += 1;
  }

  usedFileNames.add(candidate);
  return candidate;
}

function fileNameFromUrl(value: string): string {
  try {
    const parsedUrl = new URL(value);
    return decodeURIComponent(path.posix.basename(parsedUrl.pathname)) || "image";
  } catch {
    return "image";
  }
}

function isLocalAssetReference(value: string): boolean {
  return !/^https?:\/\//i.test(value) && !value.startsWith("/");
}
