import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { DEFAULT_LOCALE, LOCALE_LABELS, SUPPORTED_LOCALES } from '@/shared/constants';
import {
  DIAL_CODES,
  ensureFaker,
  generateTestData,
  RANDOM_NUMBER_LENGTH_DEFAULT,
  RANDOM_NUMBER_LENGTH_MAX,
} from '@/shared/faker-data';
import type { GeneratedData, Locale } from '@/shared/types';
import { CopyButton } from './CopyButton';
import { IconActionButton } from './IconActionButton';

const FIELDS: { key: keyof GeneratedData; label: string }[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'postalCode', label: 'Postal code' },
  { key: 'region', label: 'Region / County' },
  { key: 'email', label: 'Email' },
  { key: 'dateOfBirth', label: 'Date of birth' },
  { key: 'uuid', label: 'UUID' },
  { key: 'randomNumber', label: 'Random number' },
];

export function GenerateDataTab(): ReactElement {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [phoneWithCode, setPhoneWithCode] = useState(true);
  const [randomNumberLength, setRandomNumberLength] = useState(RANDOM_NUMBER_LENGTH_DEFAULT);
  const [data, setData] = useState<GeneratedData | null>(null);

  // First render: paint the shell instantly, then load the default locale's
  // faker chunk and fill in values (rather than blocking on it synchronously).
  useEffect(() => {
    let alive = true;
    void ensureFaker(DEFAULT_LOCALE).then(() => {
      if (alive) {
        setData(
          generateTestData(DEFAULT_LOCALE, {
            phoneWithCode: true,
            randomNumberLength: RANDOM_NUMBER_LENGTH_DEFAULT,
          })
        );
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  function regenerate(
    nextLocale: Locale = locale,
    withCode: boolean = phoneWithCode,
    numberLength: number = randomNumberLength
  ): void {
    void ensureFaker(nextLocale).then(() =>
      setData(
        generateTestData(nextLocale, { phoneWithCode: withCode, randomNumberLength: numberLength })
      )
    );
  }

  function changeRandomNumberLength(raw: string): void {
    const n = Math.min(RANDOM_NUMBER_LENGTH_MAX, Math.max(1, Math.floor(Number(raw)) || 1));
    setRandomNumberLength(n);
    regenerate(locale, phoneWithCode, n);
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
        <IconActionButton
          icon="↻"
          label="Regenerate"
          className="primary"
          onClick={() => regenerate()}
        />
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
      <label className="checkbox-inline">
        Random number length
        <input
          type="number"
          className="name-input genarg-num"
          min={1}
          max={RANDOM_NUMBER_LENGTH_MAX}
          value={randomNumberLength}
          onChange={(e) => changeRandomNumberLength(e.target.value)}
        />
      </label>

      <ul className="data-list">
        {FIELDS.map((f) => {
          const value = data?.[f.key] ?? '';
          return (
            <li key={f.key} className="data-row">
              <span className="data-key">{f.label}</span>
              <span className="data-value">{value || '…'}</span>
              <div className="copy-group">
                <CopyButton text={value} />
                {f.key === 'phone' && data && (
                  <CopyButton text={data.phoneAlt} label={phoneWithCode ? 'No code' : '+Code'} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
