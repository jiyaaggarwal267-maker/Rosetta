import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { CONTACT_EMAIL, REFUND_WINDOW } from "@/lib/legal";

export const metadata: Metadata = { title: "Refund Policy", description: "Rosetta is free today. How refunds will work for paid plans." };

export default function RefundsPage() {
  return (
    <LegalPage
      current="/refunds"
      title="Refund Policy"
      plain={
        <>
          <p>Rosetta is free right now, so there&rsquo;s nothing to refund.</p>
          <p>
            If we start charging, you&rsquo;ll see the price before paying, you can cancel any time, and you keep access until the end of the period
            you paid for. The rules below will apply then.
          </p>
        </>
      }
    >
      <h2 id="today">Today</h2>
      <p>Rosetta has no paid plans. We don&rsquo;t take payment details and nothing is charged.</p>

      <h2 id="paid">When paid plans exist</h2>
      <ul>
        <li>
          <strong>Billing:</strong> monthly or yearly, as chosen when you subscribe. The price, and whether taxes such as GST are included, will be
          shown before you pay.
        </li>
        <li>
          <strong>Cancelling:</strong> any time from the workspace settings. You keep access until the end of the period you&rsquo;ve paid for, and
          you won&rsquo;t be charged again.
        </li>
        <li>
          <strong>Refunds:</strong> ask within {REFUND_WINDOW} of a charge for a full refund of that charge. [Team to decide whether yearly plans get a
          pro-rated refund after that.]
        </li>
        <li>
          <strong>How to ask:</strong> email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the account owner&rsquo;s email with the
          workspace name and the charge date.
        </li>
        <li>
          <strong>Timeline:</strong> we&rsquo;ll reply within [X working days], and approved refunds go back to the original payment method within [X
          working days], depending on your bank.
        </li>
        <li>
          <strong>Exceptions:</strong> [Team to decide, for example accounts closed for breaking the Terms.] Your rights under the Consumer Protection
          Act, 2019 always apply.
        </li>
      </ul>
    </LegalPage>
  );
}
