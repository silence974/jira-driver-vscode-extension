import * as fs from "node:fs/promises";
import * as path from "node:path";

import {
  HandoffArtifacts,
  IssueScoringResult,
  JiraIssueDetail,
  WorkspaceContext,
} from "../models";
import { JIRA_DRIVER_FOLDER, JIRA_DRIVER_TASKS_FOLDER } from "../constants";
import { slugify } from "../utils/strings";
import {
  buildHandoffPrompt,
  buildHandoffReadme,
  buildTaskJson,
} from "./handoffTemplates";

export class HandoffService {
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

    const readmeMarkdown = buildHandoffReadme(issue, scoring, workspaceContext, branchName);
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
