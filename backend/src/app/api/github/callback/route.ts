import { openState, sealState } from "@/lib/auth";
import { appConfigured, authorizeUrl, getInstallation, oauthConfigured } from "@/lib/github-app";
import { backTo, connectInstallation, failed, GithubFlowError, orgsForInstallation } from "@/lib/github-connect";
import { ApiError } from "@/lib/http";
import { clientIp, limit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const TEAM = "/app/team";
/** Without OAuth to prove who installed it, only an installation made or changed this recently is accepted. */
const FRESH_MS = 60 * 60_000;

/**
 * GET /api/github/callback?installation_id=&setup_action=install|update&state=
 * The GitHub App's Setup URL. GitHub sends the browser here after the owner
 * installs the App (or changes its repos, with "Redirect on update" on).
 *
 * The signed state says which workspace and owner started it. Then, so nobody
 * can attach another company's installation by typing its id, the owner logs
 * in on GitHub (one quick hop through /api/github/link/callback) and GitHub
 * confirms they can see this installation. Without the App's OAuth client,
 * only an installation made in the last hour is accepted instead.
 *
 * Ends at APP_URL/app/team?github=connected, or ?github=error&reason=<reason>.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  try {
    limit(`github-callback:${clientIp(req)}`, 30, 10 * 60_000);
  } catch {
    return backTo(TEAM, { github: "error", reason: "github" });
  }
  if (!appConfigured()) return failed(TEAM, new GithubFlowError("not_configured"));
  const installationId = params.get("installation_id") ?? "";
  if (!/^\d{1,20}$/.test(installationId)) return failed(TEAM, new GithubFlowError("installation"));

  const state = openState(params.get("state"), "install");
  if (!state) {
    // Repos changed from GitHub's settings page: GitHub sends no state then.
    // Nothing to save (the installation_repositories event does that), so just go back.
    if (params.get("setup_action") === "update" && (await orgsForInstallation(installationId).catch(() => [])).length) {
      return backTo(TEAM, { github: "connected" });
    }
    return failed(TEAM, new GithubFlowError("state"));
  }

  try {
    const orgId = String(state.o);
    const userId = String(state.u);
    if (oauthConfigured()) {
      const confirm = sealState("install-confirm", { o: orgId, u: userId, i: installationId }, 15 * 60_000);
      return new Response(null, { status: 302, headers: { Location: authorizeUrl(confirm), "Cache-Control": "no-store" } });
    }
    const installation = await getInstallation(installationId).catch((error) => {
      throw error instanceof ApiError ? error : new GithubFlowError("installation");
    });
    const touched = Math.max(Date.parse(installation.created_at ?? ""), Date.parse(installation.updated_at ?? "")) || 0;
    if (Date.now() - touched > FRESH_MS) throw new GithubFlowError("verify");
    await connectInstallation(orgId, userId, installationId);
    return backTo(TEAM, { github: "connected" });
  } catch (error) {
    return failed(TEAM, error);
  }
}
