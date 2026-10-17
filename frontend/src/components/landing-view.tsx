"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { SAMPLES } from "@/lib/mock/samples";
import { ROLES } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { cn, firstName } from "@/lib/utils";
import { AccountNav } from "./account-nav";
import { buttonStyles } from "./button";
import { CheckIcon, GitHubIcon } from "./icons";
import { HowItWorks as FlowWalkthrough } from "./flowchart";
import { InkTexture } from "./ink-texture";
import { MiniDemo } from "./mini-demo";
import { Nav } from "./nav";
import { SiteFooter } from "./site-footer";
import { ThemeToggle } from "./theme-toggle";

const DEMO = SAMPLES[0].card.explanation;

/** Home: what Rosetta is, who it's for, and the way in. */
export function LandingView() {
  // Arriving here right after deleting an account.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("deleted") !== "1") return;
    toast("Your account is deleted.");
    window.history.replaceState(null, "", "/");
  }, []);

  return (
    <>
      <Nav>
        <AccountNav />
        <ThemeToggle />
      </Nav>
      <main id="main" tabIndex={-1}>
        <Hero />
        <Gap />
        <Readers />
        <SeeItWork />
        <HowItWorks />
        <AskWhy />
        <Promises />
        <Pricing />
        <Closing />
      </main>
      <SiteFooter />
    </>
  );
}

/* ------------------------------------------------------------------ */

function Ctas({ align = "start" }: { align?: "start" | "center" }) {
  const { user, status } = useSession();
  return (
    <div className={cn("flex flex-wrap items-center gap-3", align === "center" && "justify-center")}>
      {user ? (
        <Link href="/app" className={cn(buttonStyles({ variant: "primary" }), "h-12 px-6")}>
          Open Rosetta
        </Link>
      ) : (
        <>
          <Link href="/signup" className={cn(buttonStyles({ variant: "primary" }), "h-12 px-6")}>
            Create a workspace
          </Link>
          <Link
            href="/login"
            className={cn(buttonStyles({ variant: "secondary" }), "h-12 px-6", status === "loading" && "invisible")}
          >
            Log in
          </Link>
        </>
      )}
    </div>
  );
}

function Section({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("mx-auto max-w-(--w-app) px-(--gutter) py-24 md:py-32", className)}>
      {children}
    </section>
  );
}

function SectionHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="max-w-[40rem]">
      <h2 className="t-title text-balance text-fg-1">{title}</h2>
      {children && <p className="mt-4 t-body text-pretty text-fg-2">{children}</p>}
    </div>
  );
}

/* ---------- 1. Hero: the slider is the picture ---------- */

function Hero() {
  const { user } = useSession();
  return (
    <section className="relative isolate overflow-hidden">
      <InkTexture className="pointer-events-none absolute inset-0 -z-10 size-full" />
      <div className="mx-auto grid max-w-(--w-app) items-center gap-12 px-(--gutter) pt-16 pb-24 md:pt-24 lg:min-h-[calc(100svh-var(--nav-h))] lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-16">
        <div>
          <h1 className="t-display text-balance text-fg-1">
            {user ? `Every commit, explained for ${firstName(user.name)}.` : "Every commit, explained for whoever's reading."}
          </h1>
          <p className="mt-6 max-w-[34rem] t-body text-pretty text-fg-2 md:text-[1.125rem]">
            Your engineers push code. Rosetta explains every change and sends it up the chain: the manager reads
            it as a manager, the CMO as a CMO. Questions go straight back to the engineer who wrote it.
          </p>
          <div className="mt-10">
            <Ctas />
          </div>
          <p className="mt-4 t-small text-fg-3">
            Got an invite from your manager?{" "}
            <Link href="/join" className="font-medium text-fg-1 underline underline-offset-4">
              Join your team
            </Link>
          </p>
        </div>
        <MiniDemo />
      </div>
    </section>
  );
}

/* ---------- 2. The gap ---------- */

function Gap() {
  return (
    <Section>
      <SectionHead title="Code is a language only half the room speaks.">
        Engineers ship work every day that the people who plan, pay for and sell it can&rsquo;t read. So they ask
        vague questions, wait for answers, and decide without knowing what changed or how risky it is.
      </SectionHead>

      <div className="mt-12 grid items-stretch gap-4 card:grid-cols-[1fr_auto_1fr]">
        <figure className="rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
          <figcaption className="t-small text-fg-3">What the diff says</figcaption>
          <pre className="mt-4 overflow-x-auto t-code text-fg-2">
            <code>
              <span className="text-fg-3">src/balancer.js</span>
              {"\n"}
              <span className="text-fg-3">-   return servers[0];</span>
              {"\n"}
              <span className="text-fg-1">+ function pickNextServer() {"{"}</span>
              {"\n"}
              <span className="text-fg-1">+   current = (current + 1) % servers.length;</span>
              {"\n"}
              <span className="text-fg-1">+   return servers[current];</span>
              {"\n"}
              <span className="text-fg-1">+ {"}"}</span>
            </code>
          </pre>
        </figure>

        <div aria-hidden className="flex items-center justify-center text-fg-3">
          <svg width="40" height="24" viewBox="0 0 40 24" fill="none" className="max-card:rotate-90">
            <path d="M2 12h34m0 0-7-7m7 7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <figure className="flex flex-col rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
          <figcaption className="t-small text-fg-3">What your manager reads</figcaption>
          <p className="mt-4 t-summary text-pretty text-fg-1">{DEMO.levels.manager.summary}</p>
          <p className="relative mt-4 pl-4 t-body text-fg-2 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:rounded-full before:bg-steel">
            {DEMO.levels.manager.analogy}
          </p>
        </figure>
      </div>
    </Section>
  );
}

/* ---------- 3. Six readers ---------- */

function Readers() {
  return (
    <Section id="readers">
      <SectionHead title="Six roles, six different views.">
        Your role decides what you see and how it&rsquo;s written. An engineer gets function names; their manager gets
        impact and risk; the CMO gets customers and campaigns. Same commit, nobody reads the wrong version.
      </SectionHead>

      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map((role) => (
          <li key={role.key} className="flex flex-col rounded-md bg-surface-1 p-6 shadow-elev-1">
            <h3 className="t-heading text-fg-1">{role.label}</h3>
            <p className="mt-1 t-small text-fg-3">{role.description}</p>
            <p className="mt-6 border-t-0 t-body text-pretty text-fg-2">
              <span className="sr-only">Example: </span>
              {DEMO.levels[role.key].summary}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-6 t-small text-fg-3">Each example explains the same commit: a round-robin load balancer.</p>
    </Section>
  );
}

/* ---------- 3b. A real explanation, with its worked example ---------- */

function SeeItWork() {
  return (
    <Section>
      <SectionHead title="Not three boxes. The actual mechanism.">
        Every change comes with a before-and-after flowchart of how it really works, and a worked example. Step
        through it and watch each request take its path. This is the round-robin commit, as a manager reads it.
      </SectionHead>
      <div className="mt-12">
        <FlowWalkthrough explanation={DEMO} level={DEMO.levels.manager} />
      </div>
    </Section>
  );
}

/* ---------- 4. How it works, drawn with the real UI ---------- */

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: ReactNode }) {
  return (
    <li className="flex flex-col">
      <div aria-hidden className="flex h-44 items-center justify-center rounded-md bg-surface-1 p-6 shadow-elev-1">
        {children}
      </div>
      <p className="mt-6 t-micro text-fg-3">Step {n}</p>
      <h3 className="mt-1 t-heading text-fg-1">{title}</h3>
      <p className="mt-2 t-body text-pretty text-fg-2">{body}</p>
    </li>
  );
}

function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHead title="Nobody pastes links, nobody chases updates." />
      <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-6">
        <Step n={1} title="An engineer pushes code" body="Rosetta watches your repositories. A push by anyone on your team is picked up on its own, through a webhook or a regular check.">
          <div className="glass flex h-12 w-full items-center gap-1 rounded-md p-1">
            <span className="min-w-0 flex-1 truncate px-3 font-mono text-[0.8125rem] text-fg-2">github.com/…/commit/a3f9c2e</span>
            <span className="grid h-10 place-items-center rounded-[12px] bg-(--btn-primary-bg) px-3 t-micro font-semibold text-(--btn-primary-fg)">
              Explain
            </span>
          </div>
        </Step>
        <Step n={2} title="Rosetta explains it" body="It reads the diff and writes six versions, a detailed before-and-after flowchart, and a worked example you can step through.">
          <ul className="grid w-full gap-2 t-small text-fg-1">
            {SAMPLES[0].findings.map((line) => (
              <li key={line} className="flex items-center gap-2">
                <CheckIcon size={14} className="shrink-0 text-steel" />
                <span className="truncate">{line.replace(/`/g, "")}</span>
              </li>
            ))}
          </ul>
        </Step>
        <Step n={3} title="It reaches the right people" body="The engineer checks their explanation. Their manager and the CMO see it in their own feed, at their own level, and can ask why.">
          <div className="grid w-full justify-items-start gap-3">
            <span className="inline-flex h-6 items-center rounded-xs bg-surface-2 px-2 t-micro text-fg-2">
              Reviewed by Arjun
            </span>
            <span className="grid h-10 place-items-center rounded-sm bg-(--btn-primary-bg) px-4 t-small font-medium text-(--btn-primary-fg)">
              In Neha&rsquo;s team feed
            </span>
          </div>
        </Step>
      </ol>
    </Section>
  );
}

/* ---------- 5. Ask why ---------- */

function AskWhy() {
  return (
    <Section>
      <div className="grid items-center gap-12 card:grid-cols-2">
        <SectionHead title="Questions go back to the person who knows.">
          Select any step in the flowchart and ask why. If the code holds the answer, Rosetta gives it at your
          level. If it doesn&rsquo;t, your question goes to the engineer with a technical version attached, and
          their reply comes back rewritten for you. Managers can also check in with anyone directly.
        </SectionHead>

        <div className="rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8">
          <p className="t-small text-fg-3">Asking about</p>
          <p className="mt-1 t-heading text-fg-1">Takes turns</p>
          <div className="mt-6 grid gap-4">
            <p className="justify-self-end rounded-md rounded-br-xs bg-surface-2 px-4 py-2.5 t-body text-fg-1">
              Will this delay the launch?
            </p>
            <p className="flex items-center gap-2 t-small text-fg-2">
              <GitHubIcon size={14} />
              Sent to Arjun, with a technical version
            </p>
            <div className="rounded-md rounded-bl-xs px-4 py-3 shadow-ring-strong">
              <p className="t-small text-fg-3">Arjun replied</p>
              <p className="mt-1 t-body text-fg-1">
                This won&rsquo;t delay the launch. Arjun tested it under heavy traffic and it&rsquo;s ready for this
                week&rsquo;s release.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ---------- 6. Promises ---------- */

const PROMISES = [
  { title: "The engineer stays in control", body: "Every card is a draft until the person who wrote the code approves it." },
  {
    title: "Your full code isn't kept",
    body: "Diffs are read from GitHub and sent to the AI to explain. Rosetta saves the explanation and a few lines behind each step, not the diff.",
  },
  {
    title: "Every explanation is checked",
    body: "A second model and plain code rules score each one against the real diff, and every box links to the lines behind it.",
  },
];

function Promises() {
  return (
    <Section className="py-16 md:py-16">
      <ul className="grid gap-8 rounded-md p-6 shadow-ring sm:p-8 md:grid-cols-3">
        {PROMISES.map((p) => (
          <li key={p.title}>
            <h3 className="t-body font-semibold text-fg-1">{p.title}</h3>
            <p className="mt-1 t-small text-fg-2">{p.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------- 7. Pricing ---------- */

function Pricing() {
  return (
    <Section id="pricing" className="py-16 md:py-20">
      <div className="grid gap-6 rounded-md bg-surface-1 p-6 shadow-elev-1 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
        <div className="max-w-[40rem]">
          <h2 className="t-heading text-fg-1">Free while Rosetta is in early access</h2>
          <p className="mt-2 t-body text-fg-2">
            There are no paid plans yet, and nothing asks for payment details. When paid plans arrive, they&rsquo;ll be for the people who write code;
            everyone who reads stays free. Prices, taxes and the refund policy will be shown before anyone pays.
          </p>
        </div>
        <Link href="/refunds" className={cn(buttonStyles({ variant: "secondary" }), "justify-self-start")}>
          Refund Policy
        </Link>
      </div>
    </Section>
  );
}

/* ---------- 8. Closing ---------- */

function Closing() {
  const { user } = useSession();
  return (
    <Section className="text-center">
      <h2 className="mx-auto max-w-[36rem] t-title text-balance text-fg-1">
        {user ? "Your team's latest changes are waiting." : "Set up your workspace in two minutes."}
      </h2>
      <p className="mx-auto mt-4 max-w-[30rem] t-body text-fg-2">
        Create it as a CMO or manager, add your people, connect a repository. Or start with a sample team.
      </p>
      <div className="mt-10">
        <Ctas align="center" />
      </div>
    </Section>
  );
}

