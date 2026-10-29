import { openState } from "@/lib/auth";
import { exchangeCode, githubUser, oauthConfigured, userCanSeeInstallation } from "@/lib/github-app";
import { backTo, connectInstallation, failed, GithubFlowError, linkAccount } from "@/lib/github-connect";
import { kickJobs } from "@/lib/qstash";
import { clientIp, limit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const PROFILE = "/app/profile";
const TEAM = "/app/team";

/**
 * GET /api/github/link/callback?code=&state=
 * The GitHub App's Callback URL (user login). Two uses, told apart by the state:
 *  - "link": someone linked their GitHub account. Saves the username and id as
 *    verified, then APP_URL/app/profile?github=linked.
 *  - "install-confirm": the owner just installed the App; GitHub confirms they
 *    can see that installation, then it's saved: APP_URL/app/team?github=connected.
 * Failures end at the same page with ?github=error&reason=<reason>.
 * The user's GitHub token is used for these one or two reads and never stored.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const link = openState(params.get("state"), "link");
  const install = link ? null : openState(params.get("state"), "install-confirm");
  const page = install ? TEAM : PROFILE;
  try {
    limit(`github-link-callback:${clientIp(req)}`, 30, 10 * 60_000);
  } catch {
    return backTo(page, { github: "error", reason: "github" });
  }
  if (!link && !install) return failed(page, new GithubFlowError("state"));
  if (!oauthConfigured()) return failed(page, new GithubFlowError("not_configured"));
  // They pressed Cancel on GitHub's page.
  if (params.get("error")) return failed(page, new GithubFlowError("denied"));
  const code = params.get("code") ?? "";
  if (!code || code.length > 200) return failed(page, new GithubFlowError("state"));

  try {
    const token = await exchangeCode(code);
    if (install) {
      const installationId = String(install.i);
      if (!(await userCanSeeInstallation(token, installationId))) throw new GithubFlowError("verify");
      await connectInstallation(String(install.o), String(install.u), installationId);
      return backTo(TEAM, { github: "connected" });
    }
    const gh = await githubUser(token);
    const { user, requeued } = await linkAccount(String(link!.u), { login: gh.login, id: gh.id });
    if (requeued) await kickJobs(user.orgId, new URL(req.url).origin);
    return backTo(PROFILE, { github: "linked" });
  } catch (error) {
    return failed(page, error);
  }
}
