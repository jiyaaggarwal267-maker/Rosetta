import type { Metadata } from "next";
import { LegalPage, LegalTable } from "@/components/legal-page";
import { ADDRESS, CONTACT_EMAIL, GRIEVANCE_OFFICER, GRIEVANCE_RESPONSE, LEGAL_ENTITY, PRODUCT_NAME, SOURCE_URL } from "@/lib/legal";

export const metadata: Metadata = { title: "Contact and business details", description: "Who runs Rosetta and how to reach us." };

export default function ContactPage() {
  return (
    <LegalPage
      current="/contact"
      title="Contact and business details"
      dated={false}
      plain={
        <>
          <p>Write to us at {CONTACT_EMAIL} about anything. For complaints about your personal data, write to the Grievance Officer below.</p>
        </>
      }
    >
      <LegalTable
        caption="Business details"
        head={["Item", "Details"]}
        rows={[
          ["Product", PRODUCT_NAME],
          ["Run by", LEGAL_ENTITY],
          ["Registered address", ADDRESS],
          ["Email", <a key="e" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>],
          ["Grievance Officer", <span key="g">{GRIEVANCE_OFFICER.name}, <a href={`mailto:${GRIEVANCE_OFFICER.email}`}>{GRIEVANCE_OFFICER.email}</a></span>],
          ["Grievance response time", GRIEVANCE_RESPONSE],
          ["Source code", <a key="s" href={SOURCE_URL} target="_blank" rel="noreferrer">{SOURCE_URL.replace(/^https:\/\//, "")}<span className="sr-only"> (opens in a new tab)</span></a>],
        ]}
      />
      <h2 id="grievance">Raising a grievance</h2>
      <p>Email the Grievance Officer with your name, the email on your Rosetta account, your workspace, and what went wrong.</p>
    </LegalPage>
  );
}
