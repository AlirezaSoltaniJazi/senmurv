import { useState } from 'react';
import type { ReactElement } from 'react';
import { DEFAULT_LOCALE, LOCALE_LABELS, SUPPORTED_LOCALES } from '@/shared/constants';
import { generateTestData } from '@/shared/faker-data';
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
  const [data, setData] = useState<GeneratedData>(() => generateTestData(DEFAULT_LOCALE));

  function onLocaleChange(next: Locale): void {
    setLocale(next);
    setData(generateTestData(next));
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
          onChange={(e) => onLocaleChange(e.target.value as Locale)}
        >
          {SUPPORTED_LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_LABELS[l] ?? l}
            </option>
          ))}
        </select>
        <button type="button" className="primary" onClick={() => setData(generateTestData(locale))}>
          Regenerate
        </button>
      </div>

      <ul className="data-list">
        {FIELDS.map((f) => (
          <li key={f.key} className="data-row">
            <span className="data-key">{f.label}</span>
            <span className="data-value">{data[f.key]}</span>
            <CopyButton text={data[f.key]} />
          </li>
        ))}
      </ul>
    </div>
  );
}
