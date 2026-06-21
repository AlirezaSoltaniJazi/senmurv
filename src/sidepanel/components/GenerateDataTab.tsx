import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { DEFAULT_LOCALE, LOCALE_LABELS, SUPPORTED_LOCALES } from '@/shared/constants';
import { DIAL_CODES, ensureFaker, generateTestData } from '@/shared/faker-data';
import type { GeneratedData, Locale } from '@/shared/types';
import { CopyButton } from './CopyButton';

const FIELDS: { key: keyof GeneratedData; label: string }[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
  { key: 'postalCode', label: 'Postal code' },
  { key: 'email', label: 'Email' },
  { key: 'dateOfBirth', label: 'Date of birth' },
];

export function GenerateDataTab(): ReactElement {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [phoneWithCode, setPhoneWithCode] = useState(true);
  const [data, setData] = useState<GeneratedData | null>(null);

  // First render: paint the shell instantly, then load the default locale's
  // faker chunk and fill in values (rather than blocking on it synchronously).
  useEffect(() => {
    let alive = true;
    void ensureFaker(DEFAULT_LOCALE).then(() => {
      if (alive) setData(generateTestData(DEFAULT_LOCALE, { phoneWithCode: true }));
    });
    return () => {
      alive = false;
    };
  }, []);

  function regenerate(nextLocale: Locale = locale, withCode: boolean = phoneWithCode): void {
    void ensureFaker(nextLocale).then(() =>
      setData(generateTestData(nextLocale, { phoneWithCode: withCode }))
    );
  }

  return (
    <div className="tab">
      <div className="row">
        <label className="field-label" htmlFor="locale-select">
          Locale
        </label>
        <select
          id="locale-select"
          value={locale}
          onChange={(e) => {
            setLocale(e.target.value as Locale);
            regenerate(e.target.value as Locale, phoneWithCode);
          }}
        >
          {SUPPORTED_LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_LABELS[l] ?? l}
            </option>
          ))}
        </select>
        <button type="button" className="primary" onClick={() => regenerate()}>
          Regenerate
        </button>
      </div>
      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={phoneWithCode}
          onChange={(e) => {
            setPhoneWithCode(e.target.checked);
            regenerate(locale, e.target.checked);
          }}
        />
        Phone with country code ({DIAL_CODES[locale]})
      </label>

      <ul className="data-list">
        {FIELDS.map((f) => {
          const value = data?.[f.key] ?? '';
          return (
            <li key={f.key} className="data-row">
              <span className="data-key">{f.label}</span>
              <span className="data-value">{value || '…'}</span>
              <CopyButton text={value} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
