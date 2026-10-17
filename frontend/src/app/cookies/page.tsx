import type { Metadata } from "next";
import { LegalPage, LegalTable } from "@/components/legal-page";
import { StorageSettingsButton } from "@/components/consent-banner";

export const metadata: Metadata = { title: "Cookie Policy", description: "The browser storage Rosetta uses, and why." };

export default function CookiesPage() {
  return (
    <LegalPage
      current="/cookies"
      title="Cookie Policy"
      plain={
        <>
          <p>Rosetta sets no cookies at all.</p>
          <p>
            It keeps four small things in your browser&rsquo;s own storage: your login, your light or dark choice, whether you&rsquo;ve watched the
            homepage demo, and your storage choice itself. All of them are needed for the site to work the way you set it.
          </p>
          <p>There are no analytics, ads or tracking. If that ever changes, we&rsquo;ll ask first.</p>
        </>
      }
    >
      <h2 id="cookies">Cookies</h2>
      <p>
        Rosetta doesn&rsquo;t set cookies. You log in with a token kept in your browser&rsquo;s local storage, which is sent only to Rosetta&rsquo;s
        own server. Our hosting provider may use its own strictly necessary mechanisms to deliver the site securely. [Confirm with the hosting
        provider.]
      </p>

      <h2 id="storage">What we keep in your browser</h2>
      <LegalTable
        caption="Browser storage keys"
        head={["Name", "Where", "What it does", "How long", "Needed?"]}
        rows={[
          [<code key="t">rosetta:token</code>, "Local storage", "Keeps you logged in. A signed token, no password", "Until you log out; it stops working after 30 days", "Essential"],
          [<code key="h">theme</code>, "Local storage", "Remembers light, dark or system theme (set by the next-themes library)", "Until you clear it", "Essential (a setting you chose)"],
          [<code key="d">rosetta:demo-played</code>, "Session storage", "Stops the homepage demo replaying in the same tab", "Until you close the tab", "Essential (functional)"],
          [<code key="c">rosetta:consent</code>, "Local storage", "Remembers your storage choice and which policy version you saw", "Until you clear it, or the policy changes", "Essential"],
        ]}
      />

      <h2 id="third-party">Other sites your browser talks to</h2>
      <p>
        Only Rosetta&rsquo;s own website and its API. Fonts are bundled with the site, not loaded from Google. There are no analytics, advertising,
        social media or video embeds. Links to GitHub open only when you click them, and then GitHub&rsquo;s own policies apply.
      </p>

      <h2 id="clear">How to clear it</h2>
      <ul>
        <li>Log out to remove your login token.</li>
        <li>
          Clear site data for this website in your browser&rsquo;s settings (for example, in Chrome: the lock icon in the address bar, then Site
          settings, then Clear data). This logs you out and resets your theme.
        </li>
      </ul>

      <h2 id="choices">Your choices</h2>
      <p>
        Everything above is essential, so it runs either way. Optional categories exist in the settings for the future and are off unless you turn
        them on.
      </p>
      <StorageSettingsButton />

      <h2 id="future">If we add analytics</h2>
      <p>
        If we ever add analytics or embeds, they&rsquo;ll be listed here first, stay off until you say yes in the storage settings, and the banner
        will ask you again.
      </p>
    </LegalPage>
  );
}
