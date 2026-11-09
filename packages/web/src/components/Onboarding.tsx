import { useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';

// A public mainnet trader with settled Predict history, so anyone can meet a real ghost without a wallet.
const SAMPLE = '0x7c9250467b7d7cc0aa2a9e76d06e9e8af313afa22285f1a3c314d749617b486e';

/** First visit: meet your ghost. Connect a wallet, or paste any Sui address to meet its ghost read-only. */
export function Onboarding({ onViewAs }: { onViewAs: (address: string) => string }) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  return (
    <section className="onboard">
      <div className="ob-art" aria-hidden>
        <img className="ob-you" src="/art/v2/eidolon2-duel-you.webp" alt="" />
        <span className="ob-thread" />
        <img className="ob-ghost" src="/art/v2/eidolon2-duel-ghost.webp" alt="" />
      </div>
      <h1>Meet the trader who knows you best.</h1>
      <p className="ob-sub">Eidolon builds a ghost from your past trades. It bets against you every round, even when you’re away.</p>
      <div className="ob-actions">
        <ConnectButton />
        <form
          className="ob-paste"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(onViewAs(value));
          }}
        >
          <input className="num" aria-label="Paste a Sui address" placeholder="or paste an address 0x…" value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} autoComplete="off" />
          <button aria-label="Meet this address’s ghost">→</button>
        </form>
      </div>
      {err && <p className="notice notice-error">{err}</p>}
      <button className="link-btn ob-sample" onClick={() => onViewAs(SAMPLE)}>
        No wallet? Meet a real mainnet trader’s ghost →
      </button>
      <ol className="ob-steps">
        <li>
          <span className="num">01</span> We read your trade history
        </li>
        <li>
          <span className="num">02</span> Your ghost is born
        </li>
        <li>
          <span className="num">03</span> Call Higher or Lower
        </li>
      </ol>
      <p className="ob-foot">Sui mainnet · USDC · DeepBook Predict · Walrus Memory</p>
    </section>
  );
}
