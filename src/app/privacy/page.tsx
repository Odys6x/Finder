import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <div className="card space-y-3 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold tracking-tight">Privacy</h1>
      <p>We designed SchoolPath to need as little personal data as possible (PDPA).</p>
      <ul className="list-disc space-y-1.5 pl-5">
        <li>We never ask for your child&apos;s name, NRIC or primary school name.</li>
        <li>
          Your profile (score, posting group, postal code, preferences), shortlist and chat history are stored only in your
          browser. You can delete them anytime from the Profile page.
        </li>
        <li>
          When you view matches or ask the AI, your profile is sent with that request to compute results and is not stored
          on our servers.
        </li>
        <li>
          Postal codes and place names are looked up via OneMap to work out distances and MRT/bus travel times. To keep the
          app fast, travel times are cached against your home location rounded to about 100 m, with nothing that
          identifies you.
        </li>
        <li>
          Routes to a school are shown by Google Maps. Your home location is sent to Google only when you tap
          &quot;Show route&quot; or &quot;Open in Google Maps&quot;.
        </li>
        <li>
          AI questions are processed by our AI provider to generate answers. Please don&apos;t include personal details in
          questions.
        </li>
        <li>
          If you buy a pass, payment is handled by Stripe. We store a pass record (code, type, expiry) and a random cookie to
          recognise this browser — not your card details.
        </li>
        <li>A random anonymous cookie counts free AI questions. It contains no personal information.</li>
      </ul>
    </div>
  );
}
