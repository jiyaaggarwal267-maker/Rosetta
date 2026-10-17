import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalTable } from "@/components/legal-page";
import { ADDRESS, CONTACT_EMAIL, GRIEVANCE_OFFICER, GRIEVANCE_RESPONSE, LEGAL_ENTITY, PRODUCT_NAME } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy", description: "What Rosetta collects, why, who else sees it, and your rights." };

export default function PrivacyPage() {
  return (
    <LegalPage
      current="/privacy"
      title="Privacy Policy"
      plain={
        <>
          <p>
            Rosetta keeps your account details and what your team writes in it, so it can explain code changes to each person in their own
            words.
          </p>
          <p>
            To write those explanations, the code change and your questions are sent to an AI provider (Google Gemini, or Groq as a backup).
            On the free tier we use today, Google may use that content to improve its products, so don&rsquo;t connect code you can&rsquo;t share.
          </p>
          <p>We don&rsquo;t sell your data, show ads, or use tracking cookies. You can download your data or delete your account from your profile.</p>
        </>
      }
    >
      <h2 id="who">Who we are</h2>
      <p>
        {PRODUCT_NAME} is run by {LEGAL_ENTITY}, {ADDRESS}. Contact us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. For
        complaints about your personal data, write to our Grievance Officer (see <a href="#grievance">below</a>).
      </p>
      <p>
        For your account details, we decide how they are used (under India&rsquo;s Digital Personal Data Protection Act, 2023, we are the{" "}
        <strong>Data Fiduciary</strong>). For what a company puts into its workspace, such as its code and its employees&rsquo; comments, the
        company that created the workspace decides what goes in, and we process it on its behalf. [Lawyer to confirm the roles for workspace
        content.]
      </p>

      <h2 id="what">What we collect</h2>
      <p>
        The full list, with examples and how long each is kept, is on <Link href="/data">What data we collect</Link>. In short:
      </p>
      <ul>
        <li>
          <strong>Account details:</strong> name, work email, role, job title, team name, GitHub username, what you care about (focus), language,
          who you report to, and when you accepted these terms.
        </li>
        <li>
          <strong>Your password,</strong> stored only as an scrypt hash. We can&rsquo;t read it.
        </li>
        <li>
          <strong>Workspace details:</strong> its name, owner, the repositories it watches, and a secret for GitHub webhooks.
        </li>
        <li>
          <strong>Code changes:</strong> for each commit we explain, the repository, commit ID, message, author name and GitHub username, and the
          list of changed files. We read the full diff from GitHub to explain it, but we don&rsquo;t store it. We do keep the explanation we wrote,
          and up to six lines of code behind each step of its flowchart, so readers can check it.
        </li>
        <li>
          <strong>What people write:</strong> comments, questions, replies and mistake reports, plus the versions Rosetta rewrites for each reader.
        </li>
        <li>
          <strong>Ask Why questions:</strong> sent to the AI provider to answer. They&rsquo;re only stored if you send them on to an engineer as a
          question.
        </li>
        <li>
          <strong>Technical data:</strong> your login token in your browser, request logs kept by our hosting provider (including IP addresses),
          and short-lived counters in memory that limit repeated login attempts.
        </li>
      </ul>

      <h2 id="why">Why we use it</h2>
      <LegalTable
        caption="Purpose of each kind of data"
        head={["Data", "Why", "Basis"]}
        rows={[
          ["Account details", "To create your account, show you the right version of each change, and let your team find you", "Your consent at signup, and providing the service you asked for"],
          ["Password hash", "To check it's you when you log in", "Providing the service"],
          ["Code changes", "To explain them at six reading levels and show the code behind each step", "Consent of the workspace that connected the repository"],
          ["Comments, questions, replies", "To pass them between people, rewritten for each reader", "Providing the service"],
          ["Email address", "To send invites, password resets, questions, replies and the weekly report", "Providing the service"],
          ["Email address (product updates)", "Only if you ticked \"Email me product updates\"", "Your separate, optional consent"],
          ["Request logs, rate-limit counters", "To keep the service running and stop password guessing", "Legitimate use for security, as allowed by law"],
        ]}
      />
      <p>We don&rsquo;t sell personal data, use it for advertising, or build profiles of you outside your workspace.</p>

      <h2 id="ai">AI processing of your code and questions</h2>
      <p>
        Rosetta uses AI models to write explanations, check them, answer Ask Why questions, rewrite comments and messages for each reader, and write
        your personal note on each change. To do that, we send the model the commit message, file names and diff (trimmed to the most changed
        files), the explanation, your question or message, and, for personal notes, your name, title, role, focus and language.
      </p>
      <ul>
        <li>
          <strong>Google Gemini API.</strong> We currently use Google&rsquo;s unpaid tier. Under Google&rsquo;s Gemini API terms, Google uses content
          submitted to unpaid services and the responses to provide, improve and develop its products, and human reviewers may read it. Google
          asks that sensitive, confidential or personal information not be sent to unpaid services. Until we move to a paid tier, please connect
          only repositories whose code you&rsquo;re comfortable sharing on those terms.
        </li>
        <li>
          <strong>Groq.</strong> Used as a backup and for smaller tasks. Groq says it does not keep inference data by default, but may log inputs and
          outputs for up to 30 days to fix reliability problems or investigate abuse. [Team to confirm in Groq&rsquo;s Services Agreement whether
          API data is used for training, and whether Zero Data Retention is turned on for our account.]
        </li>
        <li>
          <strong>OpenRouter</strong> can replace Groq if the team configures it. [Team to confirm its terms if it&rsquo;s ever used.]
        </li>
      </ul>
      <p>
        AI explanations can be wrong. Each one is checked against the code and shows a score, and the engineer who made the change reviews it, but
        please don&rsquo;t rely on an explanation alone for important decisions.
      </p>

      <h2 id="sharing">Who else sees your data</h2>
      <p>
        Inside your workspace, people see what their role allows: engineers see their own changes, managers see their team&rsquo;s, the CMO sees
        everyone&rsquo;s, and clients see reviewed changes of their team. Outside it, these service providers process data for us:
      </p>
      <LegalTable
        caption="Service providers"
        head={["Provider", "What they receive", "Why"]}
        rows={[
          ["GitHub, Inc.", "Our requests for repository, commit and comment data (repository names, commit IDs); GitHub sends us push and comment events from watched repositories. Rosetta doesn't post anything to GitHub.", "Reading the changes we explain"],
          ["Google (Gemini API)", "Diffs, commit messages, file names, explanations, questions, comments and messages, and reader details for personal notes", "Writing explanations and answers"],
          ["Groq (or OpenRouter, if configured)", "The same as Gemini, when used", "Backup, checking explanations, smaller tasks"],
          ["Google (Firebase / Firestore)", "Everything Rosetta stores, listed on the data page", "Our database. Region: [Firestore region to confirm]"],
          ["Email provider (Gmail SMTP by default)", "Recipient name and email, and the email's content", "Invites, password resets, questions, replies, reports and the weekly report"],
          ["Hosting provider ([Vercel or Firebase Hosting, to confirm])", "Request logs, including IP address, browser and page requested", "Serving the website and API"],
        ]}
      />
      <p>We may also share data if the law requires it, for example a valid order from a court or government authority.</p>

      <h2 id="transfers">International transfers</h2>
      <p>
        Some providers above process data outside India, including in the United States. Where we have users in the European Economic Area, the UK
        or Switzerland, Google&rsquo;s terms require a paid Gemini tier, which we&rsquo;ll use before serving them. [Lawyer to confirm transfer
        safeguards and any countries restricted under the DPDP Act.]
      </p>

      <h2 id="retention">How long we keep it</h2>
      <ul>
        <li>Account details and what you wrote: until you delete your account, or the owner deletes the workspace.</li>
        <li>Password reset links: deleted when used; unused ones stop working after 1 hour.</li>
        <li>Login tokens: in your browser until you log out; each token stops working after 30 days.</li>
        <li>Notifications: the latest are kept; older ones you&rsquo;ve read are cleaned up as new ones arrive.</li>
        <li>Login-attempt counters: in memory for 15 to 60 minutes, never written to the database.</li>
        <li>Hosting logs: as kept by the hosting provider. [Confirm the period.]</li>
      </ul>
      <p>Rosetta doesn&rsquo;t yet delete old workspace data on a schedule. [Team to decide a retention period for inactive workspaces.]</p>

      <h2 id="security">How we protect it</h2>
      <ul>
        <li>Passwords are stored as scrypt hashes, never in plain text.</li>
        <li>Login tokens are signed, so they can&rsquo;t be forged, and expire after 30 days.</li>
        <li>API keys for GitHub, the AI providers, the database and email live only on our server, never in your browser.</li>
        <li>Repeated wrong passwords are rate-limited; GitHub webhooks are checked against a secret signature.</li>
        <li>Each person only receives the changes and messages their role allows.</li>
        <li>The site is served over HTTPS in production, with a Content Security Policy that blocks scripts from other sites.</li>
      </ul>
      <p>No system is perfectly secure. If something goes wrong, see <a href="#breach">data breaches</a>.</p>

      <h2 id="rights">Your rights</h2>
      <ul>
        <li>
          <strong>See your data:</strong> download it any time from <Link href="/app/profile">your profile</Link> (Download my data).
        </li>
        <li>
          <strong>Correct it:</strong> edit your profile. Your role and email are set by whoever added you, so ask them, or us.
        </li>
        <li>
          <strong>Delete it:</strong> delete your account from your profile. Here is exactly what happens:
          <ul>
            <li>Your account, password hash, pending invite, notifications, reset links and personal notes are deleted.</li>
            <li>
              Your comments and question messages stay for your team, so conversations still make sense, but they show &ldquo;Former member&rdquo;
              instead of your name. Changes you made stay too, with the author shown as &ldquo;Former member&rdquo;.
            </li>
            <li>People who reported to you now report to your manager, or to the workspace owner.</li>
            <li>
              If you own the workspace, you first hand it to another CMO or manager, or delete the whole workspace: that removes every member&rsquo;s
              account and all of the workspace&rsquo;s data.
            </li>
          </ul>
        </li>
        <li>
          <strong>Withdraw consent:</strong> turn off product update emails in your profile, or delete your account. Withdrawing doesn&rsquo;t affect
          what we did before.
        </li>
        <li>
          <strong>Nominate someone</strong> to use these rights for you if you die or can&rsquo;t act yourself: email us.
        </li>
        <li>
          <strong>Complain:</strong> to our Grievance Officer, and then, if you&rsquo;re not satisfied, to the Data Protection Board of India.
        </li>
      </ul>

      <h3>If you&rsquo;re in the EU or UK</h3>
      <p>
        You also have the right to object to processing, to restrict it, to get your data in a portable format (the download above is JSON), and to
        complain to your local data protection authority. [Lawyer to confirm whether we need an EU or UK representative.]
      </p>
      <h3>Elsewhere</h3>
      <p>Wherever you are, you can use the rights above. If your local law gives you more, write to us and we&rsquo;ll honour them where we can.</p>

      <h2 id="children">Children</h2>
      <p>
        Rosetta is for people at work and isn&rsquo;t meant for anyone under 18. We don&rsquo;t knowingly collect data from children. If you think a
        child has an account, tell us and we&rsquo;ll delete it.
      </p>

      <h2 id="breach">Data breaches</h2>
      <p>
        If personal data is exposed, we&rsquo;ll tell the people affected and the Data Protection Board of India, as the DPDP Act and its Rules
        require, and the relevant authority elsewhere where the law requires it. [Lawyer to confirm the notice deadlines under the current Rules.]
      </p>

      <h2 id="grievance">Grievance Officer</h2>
      <p>
        {GRIEVANCE_OFFICER.name}, <a href={`mailto:${GRIEVANCE_OFFICER.email}`}>{GRIEVANCE_OFFICER.email}</a>. {GRIEVANCE_RESPONSE}.
      </p>

      <h2 id="changes">Changes to this policy</h2>
      <p>
        When we change this policy, we update the date and version at the top. If the change matters, we&rsquo;ll tell you in the app or by email
        before it applies.
      </p>
    </LegalPage>
  );
}
