import { ConfluencePageSummary, ConfluenceSpaceSummary, JiraDriverSettings } from "../models";
import { ConfluenceClient } from "./confluenceClient";

interface SpaceInfo {
  id: string;
  key?: string;
  name?: string;
}

export class ConfluenceExplorerService {
  private readonly rootPagesBySpaceId = new Map<string, ConfluencePageSummary[]>();
  private readonly childPagesByPageId = new Map<string, ConfluencePageSummary[]>();
  private readonly spacesById = new Map<string, ConfluenceSpaceSummary>();
  private readonly pagesById = new Map<string, ConfluencePageSummary>();

  public constructor(
    private readonly confluenceClient: ConfluenceClient,
    private readonly getSettings: () => JiraDriverSettings,
  ) {}

  public async refreshSpaces(): Promise<ConfluenceSpaceSummary[]> {
    const spaces = await this.confluenceClient.listSpaces();
    this.rootPagesBySpaceId.clear();
    this.childPagesByPageId.clear();
    this.spacesById.clear();
    this.pagesById.clear();

    for (const space of spaces) {
      this.spacesById.set(space.id, space);
    }

    return spaces;
  }

  public async getRootPages(space: ConfluenceSpaceSummary): Promise<ConfluencePageSummary[]> {
    const cached = this.rootPagesBySpaceId.get(space.id);
    if (cached) {
      return cached;
    }

    let pages = await this.confluenceClient.listRootPages(space.id);
    if (!pages.length && space.homepageId) {
      pages = [await this.confluenceClient.getPageSummary(space.homepageId)];
    }

    const decorated = this.decoratePages(pages, space);
    this.cachePages(decorated);
    this.rootPagesBySpaceId.set(space.id, decorated);
    return decorated;
  }

  public async getChildPages(parentPage: ConfluencePageSummary): Promise<ConfluencePageSummary[]> {
    const cached = this.childPagesByPageId.get(parentPage.id);
    if (cached) {
      return cached;
    }

    const pages = this.decoratePages(
      await this.confluenceClient.listPageChildren(parentPage),
      this.buildSpaceInfo(parentPage),
    );
    this.cachePages(pages);
    this.childPagesByPageId.set(parentPage.id, pages);
    return pages;
  }

  private buildSpaceInfo(page: ConfluencePageSummary): SpaceInfo {
    const knownSpace = this.spacesById.get(page.spaceId);
    return {
      id: page.spaceId,
      key: page.spaceKey ?? knownSpace?.key,
      name: page.spaceName ?? knownSpace?.name,
    };
  }

  private decoratePages(pages: ConfluencePageSummary[], space: SpaceInfo): ConfluencePageSummary[] {
    return pages.map((page) => ({
      ...page,
      spaceId: page.spaceId || space.id,
      spaceKey: page.spaceKey ?? space.key,
      spaceName: page.spaceName ?? space.name,
    }));
  }

  private cachePages(pages: ConfluencePageSummary[]): void {
    for (const page of pages) {
      this.pagesById.set(page.id, page);
    }
  }
}
