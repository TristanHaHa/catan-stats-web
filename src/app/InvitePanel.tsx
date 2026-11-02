import { useState } from 'react';
import { Icon } from './Icon';

export function InvitePanel({ code }: { code: string }) {
  const [feedback, setFeedback] = useState('');
  const invite = `${location.origin}${location.pathname}?room=${code}`;
  const [canShare] = useState(() => typeof navigator.share === 'function');
  async function copy() {
    try {
      await navigator.clipboard.writeText(invite);
      setFeedback('Invite link copied. Paste it into your group chat.');
    } catch {
      setFeedback('Select the invite link below, then copy and send it to your friends.');
      const input = document.getElementById('invite-url') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }
  }
  return (
    <section className="invitation-strip" aria-labelledby="invite-title">
      <div className="invitation-copy">
        <span className="eyebrow">BRING YOUR FRIENDS TO THE TABLE</span>
        <h2 id="invite-title">Share this lobby</h2>
        <p>
          Send the invite link to your group chat. Friends open it on their own devices, enter a
          name, and join. No account needed.
        </p>
        <div className="room-code-label">
          Room code <strong className="room-code">{code}</strong>
        </div>
      </div>
      <div className="invite-actions">
        <button className="primary" onClick={() => void copy()}>
          <Icon name="link" />
          Copy invite link
        </button>
        {canShare && (
          <button
            onClick={() =>
              void navigator
                .share({
                  title: 'Join my Catan lobby',
                  text: 'Join our game in The Settler’s Ledger.',
                  url: invite,
                })
                .catch((error: unknown) => {
                  if (!(error instanceof Error) || error.name !== 'AbortError')
                    setFeedback('Sharing is unavailable. Use Copy invite link instead.');
                })
            }
          >
            <Icon name="share" />
            Share invite…
          </button>
        )}
        <label htmlFor="invite-url">
          Invite link
          <input id="invite-url" readOnly value={invite} onFocus={(e) => e.target.select()} />
        </label>
        <p className="invite-feedback" role="status" aria-live="polite">
          {feedback}
        </p>
      </div>
    </section>
  );
}
