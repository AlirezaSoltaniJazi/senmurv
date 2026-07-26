import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { decodeJwt, describeClaim, isDateClaim, jwtTimeStatus } from '@/shared/tools/jwt';
import type { DecodedJwt } from '@/shared/tools/jwt';
import { CopyButton } from '@/sidepanel/components/CopyButton';

/** Human duration for a signed second-count, e.g. 3661 → "1h 1m". */
function humanizeSeconds(total: number): string {
  const abs = Math.abs(total);
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const mins = Math.floor((abs % 3600) / 60);
  const secs = abs % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  if (!days && !hours) parts.push(`${secs}s`);
  return parts.join(' ');
}

/** Render one claim value for the table (dates get their ISO form appended). */
function renderValue(name: string, value: unknown): string {
  if (isDateClaim(name) && typeof value === 'number') {
    return `${value} · ${new Date(value * 1000).toISOString()}`;
  }
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

function ClaimTable({ claims }: { claims: Record<string, unknown> }): ReactElement {
  const entries = Object.entries(claims);
  if (entries.length === 0) return <p className="hint dim">No claims.</p>;
  return (
    <div className="data-list">
      {entries.map(([key, value]) => {
        const desc = describeClaim(key);
        return (
          <div className="data-row" key={key}>
            <span className="data-key">
              {key}
              {desc !== null && <span className="dim"> · {desc}</span>}
            </span>
            <span className="data-value">{renderValue(key, value)}</span>
            <CopyButton text={renderValue(key, value)} />
          </div>
        );
      })}
    </div>
  );
}

function StatusBadges({
  payload,
  nowSec,
}: {
  payload: Record<string, unknown>;
  nowSec: number;
}): ReactElement | null {
  const status = jwtTimeStatus(payload, nowSec);
  const badges: ReactElement[] = [];
  if (status.notYetValid === true && status.validInSec !== null) {
    badges.push(
      <span className="badge conflict" key="nbf">
        Not valid for {humanizeSeconds(status.validInSec)}
      </span>
    );
  }
  if (status.expired === true && status.expiresInSec !== null) {
    badges.push(
      <span className="badge fail" key="exp">
        Expired {humanizeSeconds(status.expiresInSec)} ago
      </span>
    );
  } else if (status.expired === false && status.expiresInSec !== null) {
    badges.push(
      <span className="badge pass" key="exp">
        Expires in {humanizeSeconds(status.expiresInSec)}
      </span>
    );
  }
  if (status.expired === null && status.notYetValid === null) {
    badges.push(
      <span className="badge dim" key="none">
        No exp / nbf claim
      </span>
    );
  }
  if (badges.length === 0) return null;
  return <div className="swatch-row">{badges}</div>;
}

function Decoded({ jwt, nowSec }: { jwt: DecodedJwt; nowSec: number }): ReactElement {
  return (
    <>
      <StatusBadges payload={jwt.payload} nowSec={nowSec} />

      <h3 className="section-title">Header</h3>
      <ClaimTable claims={jwt.header} />

      <h3 className="section-title">Payload</h3>
      <ClaimTable claims={jwt.payload} />

      <h3 className="section-title">Signature</h3>
      <p className="hint">
        Displayed, not verified — verifying needs the signing key (a server’s job).
      </p>
      <div className="snippet-row">
        <div className="snippet-head">
          <span className="snippet-fw">signature</span>
          <CopyButton text={jwt.signature} />
        </div>
        <code className="snippet-code">{jwt.signature || '(none)'}</code>
      </div>
    </>
  );
}

export function JwtTool(): ReactElement {
  const [input, setInput] = useState('');
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  const result = useMemo(() => (input.trim() === '' ? null : decodeJwt(input)), [input]);

  // Tick once a second so the exp/nbf countdowns stay live while a token is shown.
  useEffect(() => {
    if (result === null || !result.ok) return undefined;
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [result]);

  return (
    <>
      <p className="hint">
        Paste a JWT to decode its header and claims and see how long it is valid. The token never
        leaves your browser — nothing is sent anywhere.
      </p>
      <textarea
        className="name-input"
        style={{ width: '100%', minHeight: '80px', fontFamily: 'monospace', resize: 'vertical' }}
        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
      />
      {result !== null &&
        (result.ok ? (
          <Decoded jwt={result.value} nowSec={nowSec} />
        ) : (
          <p className="error">{result.error}</p>
        ))}
    </>
  );
}
