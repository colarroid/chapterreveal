import Link from "next/link";
import { Clause, ContactEmail, Fill, LegalPage } from "@/components/legal";
import { APP_NAME, LEGAL } from "@/lib/brand";

export const metadata = {
  title: "Terms of Use",
  description: "The terms for using ReedArk, the scripture and song lyrics projection service for churches.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      intro={
        <p>
          These terms are the agreement between you and <Fill value={LEGAL.operator} /> (“we”, “us”) for using {APP_NAME}. By creating an account or using the
          service you agree to them. If you use {APP_NAME} for a church, you confirm you&apos;re allowed to accept these terms for it.
        </p>
      }
    >
      <Clause n={1} title="What the service does">
        <p>
          {APP_NAME} is an online tool for churches. During a service it listens to the sermon or the singing through a microphone or sound desk, recognises Bible
          references and song lyrics, and shows them on a projector, a livestream or another screen. It also keeps a history of services, a song library and
          display settings for each church.
        </p>
        <p>
          {APP_NAME} needs an internet connection. It only listens after someone presses Start service or Start worship, and stops when the service ends or
          after a period of silence the church chooses.
        </p>
      </Clause>

      <Clause n={2} title="Accounts and churches">
        <ul>
          <li>You need an account to use the console. Give accurate details and keep your password to yourself.</li>
          <li>
            Each account belongs to one church. Church admins can invite and remove members, change the church&apos;s settings and decide what the church
            shows on screen. They&apos;re responsible for who they let in.
          </li>
          <li>You&apos;re responsible for what happens under your account. Tell us straight away if you think someone else has used it.</li>
          <li>You must be at least 16, or have a parent&apos;s or guardian&apos;s permission.</li>
        </ul>
      </Clause>

      <Clause n={3} title="Your church's content">
        <p>
          Your church owns what it adds: songs and lyrics it enters, backgrounds it uploads, playlists, settings and its service history. You give us permission
          to store, process and display that content only to run the service for your church.
        </p>
        <p>
          You confirm you have the right to use what you add. In particular, <b>projecting copyrighted song lyrics usually needs a licence</b> (for example a
          CCLI church licence), and uploaded pictures and videos must be yours or licensed for this use. Your church is responsible for holding those
          licences.
        </p>
        <p>We may remove content that breaks these terms or the law, and we&apos;ll tell the church when we do.</p>
      </Clause>

      <Clause n={4} title="Bible translations and the shared song library">
        <p>
          The Bible translations built into {APP_NAME} are in the public domain. Any other translation is offered only where we have permission to provide it,
          and may come with its own conditions, such as a credit line shown on screen.
        </p>
        <p>
          The shared song library is provided as a convenience and may change. Showing those songs in public worship is still covered by your church&apos;s
          own licence.
        </p>
      </Clause>

      <Clause n={5} title="Acceptable use">
        <p>Please don&apos;t:</p>
        <ul>
          <li>use {APP_NAME} for anything unlawful, or to show hateful, abusive or sexually explicit material;</li>
          <li>record or transcribe people without the notice your local law requires (see the Privacy Policy);</li>
          <li>try to get into another church&apos;s data, or around the limits of your plan;</li>
          <li>overload, attack, copy or resell the service, or use it to build a competing product;</li>
          <li>share the output link of your church with people who shouldn&apos;t see it, or with automated tools that scrape it.</li>
        </ul>
      </Clause>

      <Clause n={6} title="Plans and payment">
        <p>
          {APP_NAME} has a Free plan and paid plans. What each includes (for example how many backgrounds you can upload) is shown in the app and may change; we
          won&apos;t remove something you&apos;ve already paid for during the period you paid for it. Prices, billing and refunds will be shown before you pay.
        </p>
      </Clause>

      <Clause n={7} title="Availability and changes">
        <p>
          We work to keep {APP_NAME} running and fast, but it&apos;s provided “as is” and we can&apos;t promise it will never be interrupted: it depends on your
          internet connection and on the services we use. We may improve, change or stop parts of it; if we stop the service altogether we&apos;ll give at least
          30 days&apos; notice and a way to get your church&apos;s data out.
        </p>
      </Clause>

      <Clause n={8} title="Liability">
        <p>
          As far as the law allows, we aren&apos;t liable for indirect or consequential losses, or for anything shown on screen during a service, including a
          wrong verse or lyric. Our total liability to you is limited to what your church paid us in the 12 months before the claim. Nothing in these terms
          limits liability that can&apos;t be limited by law.
        </p>
      </Clause>

      <Clause n={9} title="Ending your account">
        <p>
          You can stop using {APP_NAME} at any time; a church admin can ask us to close the church&apos;s account and delete its data (see the Privacy Policy).
          We may suspend or close an account that seriously or repeatedly breaks these terms.
        </p>
      </Clause>

      <Clause n={10} title="Changes to these terms">
        <p>
          If we change these terms in a way that matters, we&apos;ll tell church admins before the change takes effect. Continuing to use {APP_NAME} after that
          means you accept the new terms.
        </p>
      </Clause>

      <Clause n={11} title="Law and contact">
        <p>
          These terms are governed by the laws of <Fill value={LEGAL.governingLaw} />. Questions about them: <ContactEmail />. How we handle personal data is
          explained in the <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </Clause>
    </LegalPage>
  );
}
