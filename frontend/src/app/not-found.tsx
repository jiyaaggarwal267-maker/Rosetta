import Link from "next/link";
import { buttonStyles } from "@/components/button";
import { Nav } from "@/components/nav";

export default function NotFound() {
  return (
    <>
      <Nav />
      <main id="main" tabIndex={-1} className="mx-auto grid max-w-(--w-app) justify-items-start gap-6 px-(--gutter) py-24">
        <h1 className="t-title text-fg-1">Nothing here.</h1>
        <p className="t-body text-fg-2">This page doesn&rsquo;t exist. Paste a commit link to get started.</p>
        <Link href="/" className={buttonStyles({ variant: "primary" })}>
          Explain a commit
        </Link>
      </main>
    </>
  );
}
