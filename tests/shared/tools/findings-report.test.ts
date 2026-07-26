import { describe, expect, it } from 'vitest';
import {
  renderTabOrderReport,
  reportMimeType,
  tabOrderFilename,
} from '@/shared/tools/findings-report';
import type { TabOrderScan } from '@/shared/types';

const scan: TabOrderScan = {
  stops: [
    {
      index: 1,
      tag: 'button',
      name: 'Save',
      tabindex: 0,
      role: 'button',
      inShadow: false,
      issues: [],
    },
    {
      index: 2,
      tag: 'input',
      name: '',
      tabindex: 3,
      role: 'textbox',
      inShadow: false,
      issues: ['positive-tabindex', 'no-accessible-name'],
    },
  ],
  warnings: ['Top frame only.'],
};

describe('renderTabOrderReport', () => {
  it('renders a readable txt list with issues', () => {
    const txt = renderTabOrderReport(scan, 'txt');
    expect(txt).toContain('1. <button> “Save”');
    expect(txt).toContain('2. <input> [tabindex 3]  — positive tabindex, no accessible name');
    expect(txt).toContain('Top frame only.');
  });

  it('renders CSV with a header row and neutralises formula injection', () => {
    const injected: TabOrderScan = {
      stops: [
        {
          index: 1,
          tag: 'button',
          name: '=SUM(A1)',
          tabindex: 0,
          role: '',
          inShadow: false,
          issues: [],
        },
      ],
      warnings: [],
    };
    const csv = renderTabOrderReport(injected, 'csv');
    expect(csv.split('\r\n')[0]).toBe('Order,Tag,Name,Role,Tabindex,Issues');
    expect(csv).toContain("'=SUM(A1)"); // formula neutralised
  });

  it('renders JSON tagged for the app', () => {
    const json = JSON.parse(renderTabOrderReport(scan, 'json')) as {
      type: string;
      stops: unknown[];
    };
    expect(json.type).toBe('tab-order');
    expect(json.stops).toHaveLength(2);
  });

  it('names the file and mime type per format', () => {
    expect(tabOrderFilename('csv')).toBe('senmurv-tab-order.csv');
    expect(reportMimeType('json')).toBe('application/json');
    expect(reportMimeType('txt')).toBe('text/plain');
  });
});
