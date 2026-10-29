export type ParsedLink =
  | { owner: string; repo: string; kind: "commit"; sha: string }
  | { owner: string; repo: string; kind: "pull"; number: number };

const LINK =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/(commit|pull)\/([0-9a-f]{7,40}|\d+)(?:[/?#].*)?$/i;

/**
 * Names GitHub allows: an owner of up to 39 letters, digits, `_` or `-`, and a
 * repo of up to 100 letters, digits, `.`, `_` or `-` that isn't `.` or `..`.
 */
const OWNER = /^[\w-]{1,39}$/;
const REPO = /^[\w.-]{1,100}$/;

export const isRepoName = (fullName: string) => {
  const [owner, repo, ...rest] = fullName.split("/");
  return !rest.length && OWNER.test(owner ?? "") && REPO.test(repo ?? "") && repo !== "." && repo !== "..";
};

/** Accepts commit and pull request links (FR-1.1). */
export function parseGitHubLink(input: string): ParsedLink | null {
  const match = input.trim().match(LINK);
  if (!match) return null;
  const [, owner, repo, kind, id] = match;
  if (!isRepoName(`${owner}/${repo}`)) return null;
  if (kind.toLowerCase() === "commit") {
    if (!/^[0-9a-f]{7,40}$/i.test(id)) return null;
    return { owner, repo, kind: "commit", sha: id.toLowerCase() };
  }
  if (!/^\d+$/.test(id)) return null;
  return { owner, repo, kind: "pull", number: Number(id) };
}

export function describeLink(link: ParsedLink) {
  const ref = link.kind === "commit" ? link.sha.slice(0, 7) : `#${link.number}`;
  return { repo: `${link.owner}/${link.repo}`, ref };
}

export const EXAMPLE_LINK = "github.com/owner/repo/commit/a3f9c2e";
