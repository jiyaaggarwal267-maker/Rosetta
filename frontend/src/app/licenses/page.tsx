import type { Metadata } from "next";
import { LegalPage, LegalTable } from "@/components/legal-page";
import packages from "@/lib/licenses.json";

export const metadata: Metadata = { title: "Credits and licences", description: "Fonts, icons and open-source software used by Rosetta." };

type Pkg = { name: string; version: string; license: string; app: string; kind: string; homepage?: string };

export default function LicensesPage() {
  const list = packages as Pkg[];
  return (
    <LegalPage
      current="/licenses"
      title="Credits and licences"
      dated={false}
      plain={
        <>
          <p>Rosetta is built with open-source software and open fonts. Everything here allows use in a product like this.</p>
          <p>We use no stock photos, no AI-generated images and no screenshots of other products. The logo and icons are drawn for Rosetta.</p>
        </>
      }
    >
      <h2 id="fonts">Fonts</h2>
      <LegalTable
        caption="Fonts"
        head={["Font", "Used for", "Licence"]}
        rows={[
          ["Bricolage Grotesque", "Headings", "SIL Open Font License 1.1"],
          ["Geist", "Body text", "SIL Open Font License 1.1"],
          ["Geist Mono", "Code", "SIL Open Font License 1.1"],
        ]}
      />
      <p>The fonts are bundled with the site when it&rsquo;s built (through Next.js), so your browser doesn&rsquo;t download them from Google.</p>

      <h2 id="images">Logo, icons and images</h2>
      <ul>
        <li>The Rosetta mark (◐), the favicon and the interface icons (sun, moon, check, close, link, bell, bin) are simple drawings made for Rosetta.</li>
        <li>
          The GitHub mark shown next to the word &ldquo;GitHub&rdquo; on links to GitHub is a trademark of GitHub, Inc., used only to point to GitHub,
          unchanged, as GitHub&rsquo;s logo guidelines allow. [Team to re-check GitHub&rsquo;s current logo guidelines before launch.]
        </li>
        <li>Flowcharts are drawn in your browser by Mermaid from Rosetta&rsquo;s own data.</li>
      </ul>

      <h2 id="software">Open-source software</h2>
      <p>Direct dependencies of the website and the API, with the licence each declares. Their own dependencies are covered by those licences.</p>
      <LegalTable
        caption="Open-source packages"
        head={["Package", "Version", "Licence", "Used in"]}
        rows={list.map((p) => [
          p.homepage ? (
            <a key={p.name} href={p.homepage.startsWith("http") ? p.homepage : `https://www.npmjs.com/package/${p.name}`} target="_blank" rel="noreferrer">
              {p.name}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            p.name
          ),
          p.version,
          p.license,
          `${p.app === "both" ? "Website and API" : p.app === "frontend" ? "Website" : "API"}${p.kind === "development" ? " (build only)" : ""}`,
        ])}
      />

      <h2 id="trademarks">Trademarks</h2>
      <p>
        GitHub is a trademark of GitHub, Inc. Gemini and Firebase are trademarks of Google LLC. Groq is a trademark of Groq, Inc. Rosetta isn&rsquo;t
        affiliated with or endorsed by any of them; we name them only to describe what Rosetta works with.
      </p>
    </LegalPage>
  );
}
