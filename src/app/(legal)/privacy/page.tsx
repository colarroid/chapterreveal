import Link from "next/link";
import { Clause, ContactEmail, Fill, LegalPage } from "@/components/legal";
import { APP_NAME, LEGAL } from "@/lib/brand";

export const metadata = {
  title: "Privacy Policy",
  description: "How ReedArk handles personal data, service audio and church content.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This explains what personal data {APP_NAME} collects, why, who it&apos;s shared with, and the choices you have. It&apos;s run by{" "}
          <Fill value={LEGAL.operator} />. We don&apos;t sell personal data, show adverts, or use advertising or analytics trackers.
        </p>
      }
    >
      <Clause n={1} title="What we collect">
        <ul>
          <li>
            <b>Your account:</b> your name, email address, phone number and password (stored only in scrambled, hashed form by our sign-in provider).
          </li>
          <li>
            <b>Your church:</b> its name, country, region and street address, its members and their roles, and its settings.
          </li>
          <li>
            <b>Services:</b> when each service started and ended, a written transcript of what was said or sung while {APP_NAME} was listening, and which Bible
            verses and song slides were shown.
          </li>
          <li>
            <b>Your church&apos;s content:</b> songs and lyrics it adds, playlists, display settings, and pictures or videos it uploads as backgrounds.
          </li>
          <li>
            <b>Technical data:</b> the sign-in cookie that keeps you logged in, and the basic logs our hosting keeps to run the service securely (such as IP
            addresses and error reports).
          </li>
        </ul>
      </Clause>

      <Clause n={2} title="Sound from the microphone">
        <p>
          {APP_NAME} only listens after someone presses <b>Start service</b> or <b>Start worship</b>, and stops when the service is ended or after the
          church&apos;s chosen period of silence. While it listens, the sound is streamed to our speech-recognition provider to be turned into text.{" "}
          <b>We don&apos;t keep recordings of the audio</b>: we keep the written transcript only.
        </p>
        <p>
          Sermons and worship can include people other than the preacher. Churches should let their congregation know that services are transcribed, as
          they would for a recording or livestream, and shouldn&apos;t start listening during private conversations such as counselling.
        </p>
      </Clause>

      <Clause n={3} title="Why we use it">
        <ul>
          <li>To run the service: sign you in, recognise verses and lyrics, put them on screen, and keep your church&apos;s history and settings.</li>
          <li>To send emails you need, such as confirming your email address or resetting your password.</li>
          <li>To keep {APP_NAME} secure, fix problems and prevent abuse.</li>
          <li>To manage plans and, when paid plans start, billing.</li>
        </ul>
        <p>
          We rely on our agreement with you (providing the service you asked for), our legitimate interest in running and protecting it, and, where the law
          requires it, your consent.
        </p>
      </Clause>

      <Clause n={4} title="Who we share it with">
        <p>We use a small number of providers to run {APP_NAME}. They may only use the data to provide their service to us:</p>
        <ul>
          <li>
            <b>Supabase</b>: our database and sign-in. Data is stored in Frankfurt, Germany.
          </li>
          <li>
            <b>Deepgram</b>: speech recognition. Receives the audio while {APP_NAME} is listening and returns text. We&apos;ve opted out of it using your audio
            to train its models.
          </li>
          <li>
            <b>Cloudinary</b>: stores and delivers the background pictures and videos churches upload.
          </li>
          <li>
            <b>Resend</b>: sends our emails.
          </li>
          <li>
            <b>Our hosting provider</b>: serves the website and app.
          </li>
        </ul>
        <p>
          Some of these providers are outside your country (for example in the European Union and the United States). Where data leaves your country we rely
          on the safeguards the law requires, such as the providers&apos; data-protection agreements.
        </p>
        <p>We may also disclose data if the law requires it, or to protect people or the service from harm.</p>
      </Clause>

      <Clause n={5} title="Who in your church can see what">
        <ul>
          <li>Members of your church&apos;s media team can see its services, transcripts, songs and settings. Church admins can also see members&apos; names, emails and phone numbers.</li>
          <li>Other churches can&apos;t see your church&apos;s data. Songs your church adds stay private to it.</li>
          <li>
            Anyone with your church&apos;s <b>output link</b> can see what&apos;s on the screen (the same as the congregation sees). Keep it private, and
            replace it in Settings if it&apos;s shared by mistake.
          </li>
          <li>The people who run {APP_NAME} can access data when needed to support you, keep the service running, or meet a legal obligation.</li>
        </ul>
      </Clause>

      <Clause n={6} title="How long we keep it">
        <p>
          We keep your account and your church&apos;s data while the account is open. When a church closes its account, we delete its data within 30 days,
          except where the law requires us to keep something longer (for example billing records). Backups are overwritten on a rolling basis after that.
        </p>
      </Clause>

      <Clause n={7} title="Cookies and storage on your device">
        <p>
          We use one essential cookie to keep you signed in. {APP_NAME} also saves a few preferences in your browser, such as your theme, chosen translation,
          microphone and playlist, and keeps transcript lines there briefly if the internet drops, until they can be saved. We don&apos;t use advertising or
          tracking cookies, so there&apos;s nothing to opt out of.
        </p>
      </Clause>

      <Clause n={8} title="Your rights">
        <p>
          Depending on where you live (for example under the Nigeria Data Protection Act 2023, or the UK or EU GDPR), you can ask to see the personal data we
          hold about you, correct it, delete it, receive a copy, or object to how we use it. You can change your own details in Settings at any time. For
          anything else, email <ContactEmail />; we&apos;ll answer within 30 days. You can also complain to your data protection authority, such as the Nigeria
          Data Protection Commission.
        </p>
      </Clause>

      <Clause n={9} title="Security">
        <p>
          Data is encrypted in transit, each church&apos;s data is kept apart by access rules enforced in the database, and secret keys stay on our servers. No
          system is perfectly secure, so please use a strong password and tell us about anything that looks wrong.
        </p>
      </Clause>

      <Clause n={10} title="Children">
        <p>{APP_NAME} is for church teams, not children. Accounts aren&apos;t for anyone under 16.</p>
      </Clause>

      <Clause n={11} title="Changes and contact">
        <p>
          If we change this policy in a way that matters, we&apos;ll tell church admins before it takes effect. Questions or requests: <ContactEmail />. See
          also our <Link href="/terms">Terms of Use</Link>.
        </p>
      </Clause>
    </LegalPage>
  );
}
