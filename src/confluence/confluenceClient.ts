import {
  ConfluencePageBreadcrumb,
  ConfluencePageDetail,
  ConfluencePageSummary,
  ConfluenceSpaceSummary,
} from "../models";
import { JiraAuthSessionProvider, OutputLogger } from "../jira/jiraClient";
import { escapeHtml, normalizeSiteUrl } from "../utils/strings";

interface ConfluenceApiLinks {
  base?: string;
  context?: string;
  next?: string;
  webui?: string;
}

interface ConfluenceV2SpaceResponse {
  results?: ConfluenceV2SpaceApiModel[];
  _links?: ConfluenceApiLinks;
}

interface ConfluenceV2PageResponse {
  results?: ConfluenceV2PageApiModel[];
  _links?: ConfluenceApiLinks;
}

interface ConfluenceV2SpaceApiModel {
  id: string;
  key?: string;
  name?: string;
  homepageId?: string;
  _links?: ConfluenceApiLinks;
}

interface ConfluenceV2PageApiModel {
  id: string;
  title?: string;
  status?: string;
  spaceId?: string;
  parentId?: string;
  position?: number;
  childPosition?: number;
  createdAt?: string;
  version?: {
    createdAt?: string;
    authorId?: string;
  };
  _links?: ConfluenceApiLinks;
}

interface ConfluenceContentSearchResponse {
  results?: ConfluenceContentApiModel[];
  _links?: ConfluenceApiLinks;
}

interface ConfluenceContentApiModel {
  id: string;
  title?: string;
  type?: string;
  status?: string;
  excerpt?: string;
  space?: {
    id?: number | string;
    key?: string;
    name?: string;
    _links?: ConfluenceApiLinks;
  };
  version?: {
    number?: number;
    when?: string;
    by?: {
      displayName?: string;
    };
  };
  body?: {
    export_view?: {
      value?: string;
    };
    view?: {
      value?: string;
    };
    storage?: {
      value?: string;
    };
  };
  ancestors?: Array<{
    id?: string;
    title?: string;
    _links?: ConfluenceApiLinks;
  }>;
  _links?: ConfluenceApiLinks;
}

const DEFAULT_SPACE_LIMIT = 50;
const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_SEARCH_LIMIT = 25;

export class ConfluenceClient {
  public constructor(
    private readonly authProvider: JiraAuthSessionProvider,
    private readonly logger?: OutputLogger,
  ) {}

  public async listSpaces(
    spaceKeys: string[] = [],
    maxResults = DEFAULT_SPACE_LIMIT,
  ): Promise<ConfluenceSpaceSummary[]> {
    const siteUrl = await this.authProvider.getSiteUrl();
    const params = new URLSearchParams({
      limit: String(Math.max(1, maxResults)),
    });

    for (const spaceKey of spaceKeys) {
      params.append("keys", spaceKey);
    }

    const response = await this.requestV2<ConfluenceV2SpaceResponse>(`/spaces?${params.toString()}`);
    const baseUrl = response._links?.base ?? siteUrl;

    return (response.results ?? [])
      .map((space) => mapSpaceSummary(space, baseUrl))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  public async listRootPages(
    spaceId: string,
    maxResults = DEFAULT_PAGE_LIMIT,
  ): Promise<ConfluencePageSummary[]> {
    const siteUrl = await this.authProvider.getSiteUrl();
    const params = new URLSearchParams({
      depth: "root",
      limit: String(Math.max(1, maxResults)),
    });
    params.append("status", "current");

    const response = await this.requestV2<ConfluenceV2PageResponse>(
      `/spaces/${encodeURIComponent(spaceId)}/pages?${params.toString()}`,
    );
    const baseUrl = response._links?.base ?? siteUrl;

    return (response.results ?? [])
      .sort(compareV2PageOrder)
      .map((page) => mapV2PageSummary(page, baseUrl));
  }

  public async listPageChildren(
    pageId: string,
    maxResults = DEFAULT_PAGE_LIMIT,
  ): Promise<ConfluencePageSummary[]> {
    const siteUrl = await this.authProvider.getSiteUrl();
    const params = new URLSearchParams({
      limit: String(Math.max(1, maxResults)),
    });

    const response = await this.requestV2<ConfluenceV2PageResponse>(
      `/pages/${encodeURIComponent(pageId)}/children?${params.toString()}`,
    );
    const baseUrl = response._links?.base ?? siteUrl;

    return (response.results ?? [])
      .sort(compareV2PageOrder)
      .map((page) => mapV2PageSummary(page, baseUrl));
  }

  public async getPageSummary(pageId: string): Promise<ConfluencePageSummary> {
    const siteUrl = await this.authProvider.getSiteUrl();
    const params = new URLSearchParams({
      expand: "space,version",
    });

    const response = await this.requestV1<ConfluenceContentApiModel>(
      `/content/${encodeURIComponent(pageId)}?${params.toString()}`,
    );

    return mapContentSummary(response, response._links?.base ?? siteUrl);
  }

  public async getPage(pageId: string): Promise<ConfluencePageDetail> {
    const siteUrl = await this.authProvider.getSiteUrl();
    const params = new URLSearchParams({
      expand: "body.export_view,body.view,body.storage,space,version,ancestors",
    });

    const response = await this.requestV1<ConfluenceContentApiModel>(
      `/content/${encodeURIComponent(pageId)}?${params.toString()}`,
    );

    return mapContentDetail(response, response._links?.base ?? siteUrl);
  }

  public async searchPages(
    query: string,
    spaceKeys: string[] = [],
    maxResults = DEFAULT_SEARCH_LIMIT,
  ): Promise<ConfluencePageSummary[]> {
    const siteUrl = await this.authProvider.getSiteUrl();
    const params = new URLSearchParams({
      cql: buildSearchCql(query, spaceKeys),
      limit: String(Math.max(1, maxResults)),
      expand: "space,version",
    });

    const response = await this.requestV1<ConfluenceContentSearchResponse>(
      `/content/search?${params.toString()}`,
    );
    const baseUrl = response._links?.base ?? siteUrl;

    return (response.results ?? [])
      .filter((result) => !result.type || result.type === "page")
      .map((result) => mapContentSummary(result, baseUrl))
      .sort((left, right) => right.updated.localeCompare(left.updated));
  }

  private async requestV2<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.request<T>("/wiki/api/v2", path, init);
  }

  private async requestV1<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.request<T>("/wiki/rest/api", path, init);
  }

  private async request<T = unknown>(
    apiBasePath: string,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const authorization = await this.authProvider.getAuthorizationHeader();
    const siteUrl = await this.authProvider.getSiteUrl();
    const response = await fetch(`${siteUrl}${apiBasePath}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: authorization,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger?.appendLine(`Confluence request failed ${response.status}: ${body}`);
      throw new Error(`Confluence request failed: ${response.status} ${body}`);
    }

    return (await response.json()) as T;
  }
}

function mapSpaceSummary(space: ConfluenceV2SpaceApiModel, baseUrl: string): ConfluenceSpaceSummary {
  return {
    id: String(space.id ?? ""),
    key: space.key ?? "SPACE",
    name: space.name ?? space.key ?? "Untitled space",
    homepageId: space.homepageId ? String(space.homepageId) : undefined,
    url: resolveConfluenceUrl(
      baseUrl,
      space._links?.webui,
      `/wiki/spaces/${encodeURIComponent(space.key ?? "")}`,
    ),
  };
}

function mapV2PageSummary(page: ConfluenceV2PageApiModel, baseUrl: string): ConfluencePageSummary {
  return {
    id: String(page.id ?? ""),
    title: page.title ?? `Page ${page.id}`,
    spaceId: String(page.spaceId ?? ""),
    status: page.status ?? "current",
    updated: page.version?.createdAt ?? page.createdAt ?? "",
    url: resolveConfluenceUrl(
      baseUrl,
      page._links?.webui,
      `/wiki/pages/viewpage.action?pageId=${encodeURIComponent(String(page.id ?? ""))}`,
    ),
    parentId: page.parentId ? String(page.parentId) : undefined,
    hasChildren: true,
  };
}

function mapContentSummary(page: ConfluenceContentApiModel, baseUrl: string): ConfluencePageSummary {
  return {
    id: String(page.id ?? ""),
    title: page.title ?? `Page ${page.id}`,
    spaceId: String(page.space?.id ?? ""),
    spaceKey: page.space?.key,
    spaceName: page.space?.name,
    status: page.status ?? "current",
    updated: page.version?.when ?? "",
    url: resolveConfluenceUrl(
      page._links?.base ?? baseUrl,
      page._links?.webui,
      `/wiki/pages/viewpage.action?pageId=${encodeURIComponent(String(page.id ?? ""))}`,
    ),
    excerpt: toPlainText(page.excerpt),
  };
}

function mapContentDetail(page: ConfluenceContentApiModel, baseUrl: string): ConfluencePageDetail {
  const summary = mapContentSummary(page, baseUrl);
  const bodyExportHtml = page.body?.export_view?.value?.trim();
  const bodyHtml = page.body?.view?.value?.trim()
    || renderStorageFallback(page.body?.storage?.value)
    || `<p class="muted">No Confluence body is available for this page.</p>`;

  return {
    ...summary,
    bodyHtml,
    bodyExportHtml,
    bodyText: toPlainText(bodyExportHtml || bodyHtml),
    versionNumber: page.version?.number,
    updatedByDisplayName: page.version?.by?.displayName,
    ancestors: (page.ancestors ?? []).map((ancestor) => mapAncestor(ancestor, page._links?.base ?? baseUrl)),
  };
}

function mapAncestor(
  ancestor: NonNullable<ConfluenceContentApiModel["ancestors"]>[number],
  baseUrl: string,
): ConfluencePageBreadcrumb {
  return {
    id: String(ancestor.id ?? ""),
    title: ancestor.title ?? `Page ${ancestor.id ?? ""}`,
    url: resolveConfluenceUrl(
      baseUrl,
      ancestor._links?.webui,
      `/wiki/pages/viewpage.action?pageId=${encodeURIComponent(String(ancestor.id ?? ""))}`,
    ),
  };
}

function compareV2PageOrder(left: ConfluenceV2PageApiModel, right: ConfluenceV2PageApiModel): number {
  const leftOrder = left.childPosition ?? left.position ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.childPosition ?? right.position ?? Number.MAX_SAFE_INTEGER;
  return leftOrder - rightOrder || (left.title ?? "").localeCompare(right.title ?? "");
}

function resolveConfluenceUrl(baseUrl: string, webUiPath: string | undefined, fallbackPath: string): string {
  const normalizedBaseUrl = normalizeSiteUrl(baseUrl);

  try {
    return new URL(webUiPath || fallbackPath, `${normalizedBaseUrl}/`).toString();
  } catch {
    return `${normalizedBaseUrl}${fallbackPath}`;
  }
}

function buildSearchCql(query: string, spaceKeys: string[]): string {
  const safeQuery = escapeCqlValue(query.trim());
  const clauses = [
    `type = page`,
    `(title ~ "${safeQuery}" OR text ~ "${safeQuery}")`,
  ];

  if (spaceKeys.length) {
    const encodedSpaceKeys = spaceKeys.map((spaceKey) => `"${escapeCqlValue(spaceKey)}"`).join(", ");
    clauses.push(`space in (${encodedSpaceKeys})`);
  }

  return `${clauses.join(" AND ")} ORDER BY lastmodified DESC`;
}

function escapeCqlValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function renderStorageFallback(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  return `<pre>${escapeHtml(toPlainText(value))}</pre>`;
}

function toPlainText(value: string | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", "\"")
    .replace(/\s+/g, " ")
    .trim();
}
