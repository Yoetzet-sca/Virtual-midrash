import type { AppData } from '../types';
import { IBack } from '../icons';

// Plain-language privacy and terms. Everything here describes what the app actually does; change the code, change this page.
export function Privacy({ data }: { data: AppData }) {
  const email = data.links.officeEmail;
  return (
    <div className="page legal">
      <div className="head"><button className="round line" onClick={() => history.back()} aria-label="Back"><IBack size={22} /></button><h1>Privacy &amp; terms</h1></div>
      <p className="muted small">Virtual Midrash is a project of the Sephardic Community Alliance. Last updated November 2026.</p>

      <h2 className="sub">The short version</h2>
      <p>There is no account and no sign-in. We don’t ask for your name, email or phone number, and we don’t know who you are. What you pick and what you listen to is kept on your own phone.</p>

      <h2 className="sub">What stays on your phone</h2>
      <p>The topics you chose, the teachers you follow or hide, the classes you liked or saved, your place in each class, your playback speed, and the community code if you entered one. This is stored in your browser on this device only. It is never sent to the SCA. You can erase it at any time from <a href="#/saved">Your classes</a> › Reset everything, or by clearing this site’s data in your browser.</p>
      <p>Anything you type in the search box is matched on your phone and is not sent anywhere.</p>

      <h2 className="sub">What the SCA can see</h2>
      <p>We count how the app is used, without identifying anyone: which screens are opened, which teachers and topics are listened to, roughly how many minutes are listened, and how long the app stays open. This runs through GoatCounter, a privacy-focused counting service. It sets no cookies and builds no profile of you. We use the numbers to decide what to improve and to report to our supporters.</p>

      <h2 className="sub">Other services the app reaches</h2>
      <ul>
        <li><b>Audio</b> plays directly from where each teacher publishes it (SoundCloud or a podcast host) or from the SCA’s own archive storage. Those services receive an ordinary request for the file, as any player would send.</li>
        <li><b>Videos</b> play in YouTube’s player, in its privacy-enhanced mode. YouTube may set cookies once you press play. Their privacy policy applies to the video.</li>
        <li><b>Donations</b> are handled by Give Lively. What you enter in the donation form goes to Give Lively, not to this app. Their privacy policy applies.</li>
        <li><b>Sponsoring a class or making a pledge</b> opens an email in your own mail app. Nothing is sent until you send it.</li>
        <li><b>“Text for address”</b> opens your own texting app. Nothing is sent until you send it.</li>
        <li><b>Fonts</b> are loaded from Google Fonts.</li>
      </ul>

      <h2 className="sub">AI summaries</h2>
      <p>Some classes show a short description marked “AI summary”, and can be found by asking a question. These are produced by software from the public recording: the recording is transcribed and summarized using services from Groq and Google. Nothing about you is involved. A summary is a guide to what a class covers. It can contain mistakes, it is not the teacher’s own wording, and it is not a halakhic ruling. For the teaching itself, listen to the class.</p>

      <h2 className="sub">Community resources</h2>
      <p>The people and organizations listed under Resources are listed by the SCA with contact details meant to be shared with the community. To be added, changed or removed, write to <a href={'mailto:' + email}>{email}</a>.</p>

      <h2 className="sub">Terms of use</h2>
      <ul>
        <li>The classes belong to the teachers who gave them and to the SCA. They are offered free for personal learning and for sharing with others by link. Please don’t republish or sell them.</li>
        <li>The live class schedule is provided for convenience and can change. Confirm with the host if in doubt.</li>
        <li>Classes express the views of their teachers. For a question of practice, ask your rabbi.</li>
        <li>The app is provided as is. We work to keep it accurate and available but can’t promise it always will be.</li>
      </ul>

      <h2 className="sub">Questions</h2>
      <p>Write to <a href={'mailto:' + email}>{email}</a>. If this page changes in a way that matters, the date at the top will change with it.</p>
    </div>
  );
}
