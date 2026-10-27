import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalTable } from "@/components/legal-page";

export const metadata: Metadata = { title: "What data we collect", description: "Every kind of data Rosetta keeps, why, where, and for how long." };

const DB = "Rosetta's database (Firestore)";
const UNTIL = "Until you delete your account, or the owner deletes the workspace";

export default function DataPage() {
  return (
    <LegalPage
      current="/data"
      title="What data we collect"
      plain={
        <>
          <p>This is the whole list: what Rosetta keeps, an example, why, where it lives, who else sees it, and for how long.</p>
          <p>
            The biggest thing to know: code changes are read from GitHub and sent to an AI provider to explain them. The full code isn&rsquo;t
            stored, only the explanation and a few lines behind each step.
          </p>
          <p>
            You can download all of it about you, or delete your account, from <Link href="/app/profile">your profile</Link>.
          </p>
        </>
      }
    >
      <h2 id="account">About you</h2>
      <LegalTable
        caption="Account data"
        head={["Data", "Example", "Why we need it", "Where", "Who else sees it", "How long"]}
        rows={[
          ["Name", "Priya Nair", "To show who wrote what", DB, "Your workspace", UNTIL],
          ["Work email", "priya@company.com", "To log in, and for invites, resets and notifications", DB + "; the email provider when we email you", "Leads in your workspace", UNTIL],
          ["Password", "Stored as an scrypt hash", "To check it's you", DB, "Nobody, not even us", "Until you change it or delete your account"],
          ["Role and reporting line", "Senior developer, reports to Neha", "To show the right version and the right people's work", DB, "Your workspace", UNTIL],
          ["Job title, team name", "Backend engineer, Payments", "To show on your profile", DB, "Your workspace", UNTIL],
          ["GitHub username", "priya-nair", "To match your commits and comments to you", DB, "Your workspace", UNTIL],
          ["Focus and language", "Timelines, Hinglish", "To write your personal note your way", DB + "; sent to the AI provider for personal notes", "Only you", UNTIL],
          ["Consent record", "Accepted terms version 2026-10-18 on a date; product emails off", "To show what you agreed to", DB, "Only you (and us, if asked)", UNTIL],
          ["Login token", "A signed string", "To keep you logged in", "Your browser only", "Nobody", "Until you log out; works for 30 days"],
          ["Password reset link", "Only a hash of it", "To reset a forgotten password", DB, "Nobody", "Deleted when used; expires after 1 hour"],
          ["Invite code", "K7Q2-PLMX", "To let you join", DB, "Whoever added you", "Until it's used or you're removed"],
        ]}
      />

      <h2 id="work">Your team&rsquo;s work</h2>
      <LegalTable
        caption="Workspace data"
        head={["Data", "Example", "Why we need it", "Where", "Who else sees it", "How long"]}
        rows={[
          ["Workspace", "Name, owner, watched repositories, webhook secret", "To run the workspace", DB, "Leads in the workspace (the webhook secret: only the workspace owner)", "Until the workspace is deleted"],
          ["Commit details", "Repository, commit ID, message, author, changed files", "To explain the change and link to it", DB + "; read from GitHub", "People whose role lets them see that change", "Until the change or workspace is deleted"],
          ["The diff (code change)", "The lines added and removed", "To write and check the explanation", "Read from GitHub, sent to the AI provider, not stored", "The AI provider", "Not kept by us"],
          ["Code behind each step", "Up to 6 lines per flowchart step", "So anyone can check a step against the code", DB, "People who can see that change", "Until the change is deleted"],
          ["Explanations and scores", "Six versions, a flowchart, a 92/100 score", "The point of Rosetta", DB, "People who can see that change", "Until the change is deleted"],
          ["Comments", "\"Health checks come next sprint\", plus each reader's version", "To pass engineers' notes to their leads", DB + "; sent to the AI provider to rewrite", "People who can see that change", UNTIL + " (then shown as \"Former member\")"],
          ["Questions, replies, reports", "\"Are you working on the release?\"", "To ask and answer across roles", DB + "; sent to the AI provider to rewrite; emailed", "The two people in the conversation", UNTIL + " (then shown as \"Former member\")"],
          ["Ask Why questions", "\"Will this delay the launch?\"", "To answer from the code", "Sent to the AI provider; stored only if sent on to an engineer", "The AI provider", "Not kept unless sent on"],
          ["Personal notes", "Two sentences written for you", "So you don't wait for them again", DB, "Only you", "Until you or the change is deleted"],
          ["Notifications", "\"Rahul replied: Checkout release\"", "The bell", DB, "Only you", "The latest are kept; older read ones are cleaned up"],
        ]}
      />

      <h2 id="technical">Technical</h2>
      <LegalTable
        caption="Technical data"
        head={["Data", "Example", "Why we need it", "Where", "Who else sees it", "How long"]}
        rows={[
          ["Request logs", "IP address, browser, page, time", "To run and secure the service", "Hosting provider", "The hosting provider", "[Hosting provider's period, to confirm]"],
          ["Login attempt counters", "IP address and email, attempt times", "To stop password guessing", "Server memory only", "Nobody", "15 to 60 minutes"],
          ["AI usage counts", "\"Explain: 4 today\"", "To stay inside free limits", DB, "Leads (as totals)", "Kept by day; no personal data"],
          ["Browser storage", "Theme, demo-played flag, storage choice", "Your settings", "Your browser only", "Nobody", "See the Cookie Policy"],
        ]}
      />
      <p>
        Who our providers are, and what each receives, is in the <Link href="/privacy#sharing">Privacy Policy</Link>. What&rsquo;s kept in your
        browser is in the <Link href="/cookies">Cookie Policy</Link>.
      </p>
    </LegalPage>
  );
}
