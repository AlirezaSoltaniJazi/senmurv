import { describe, expect, it } from 'vitest';
import {
  applyChecklistImport,
  applyNoteImport,
  applyProfileImport,
  applyQueryParamSetImport,
  checklistImportConflicts,
  noteImportConflicts,
  parseAccountsImport,
  parseChecklistsImport,
  parseNotesImport,
  parseProfilesImport,
  parseQueryParamSetsImport,
  profileImportConflicts,
  queryParamSetImportConflicts,
  serializeAccountsExport,
  serializeChecklists,
  serializeNotes,
  serializeProfiles,
  serializeQueryParamSets,
} from '@/shared/data-io';
import type { ImportedAccount } from '@/shared/data-io';
import type { Checklist, Note, ValueProfile } from '@/shared/types';
import type { QueryParamSet } from '@/shared/tools/query-params';

const sampleProfile: ValueProfile = {
  id: 'prof_1',
  name: 'Locale',
  target: 'local',
  key: 'localeKey',
  values: ['en_GB', 'fr_FR'],
  enabled: true,
  createdAt: 1,
  updatedAt: 2,
};

const sampleSet: QueryParamSet = {
  id: 'qps_1',
  name: 'Account record',
  base: 'https://org.crm4.dynamics.com/main.aspx',
  params: [
    { name: 'etn', value: 'account' },
    { name: 'pagetype', value: 'entityrecord' },
  ],
  hash: '',
  createdAt: 1,
  updatedAt: 2,
};

const sampleNote: Note = {
  id: 'note_1',
  title: 'Standup',
  body: 'Discuss the release plan.',
  createdAt: 1,
  updatedAt: 2,
};

const sampleChecklist: Checklist = {
  id: 'chk_1',
  title: 'Release v1.0',
  subtasks: [{ id: 'sub_1', title: 'Write tests', done: false }],
  done: false,
  deadline: null,
  createdAt: 1,
  updatedAt: 2,
};

describe('data-io: value profiles', () => {
  it('round-trips export → import preserving fields, and stamps the bundle', () => {
    const json = serializeProfiles([sampleProfile]);
    const bundle = JSON.parse(json);
    expect(bundle.app).toBe('senmurv');
    expect(bundle.type).toBe('profiles');
    expect(bundle.schemaVersion).toBe(1);
    expect(typeof bundle.exportedAt).toBe('string');

    const res = parseProfilesImport(json);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(1);
      expect(res.value[0]).toMatchObject({
        id: 'prof_1',
        name: 'Locale',
        target: 'local',
        key: 'localeKey',
        values: ['en_GB', 'fr_FR'],
        enabled: true,
      });
    }
  });

  it('accepts a bare array and defaults a missing enabled to true', () => {
    const res = parseProfilesImport(
      JSON.stringify([{ name: 'X', target: 'cookie', key: 'k', values: ['v'] }])
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value[0]).toMatchObject({ name: 'X', enabled: true });
  });

  it('rejects an unsupported schemaVersion', () => {
    const res = parseProfilesImport(
      JSON.stringify({
        schemaVersion: 99,
        profiles: [{ name: 'a', target: 'local', key: 'k', values: [] }],
      })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('schemaVersion');
  });

  it('reports the offending item with an index', () => {
    const res = parseProfilesImport(
      JSON.stringify({
        profiles: [
          { name: 'ok', target: 'local', key: 'k', values: [] },
          { name: '', target: 'local', key: 'k', values: [] },
        ],
      })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('profiles[1].name');
  });

  it('rejects a bad target and non-string values', () => {
    expect(
      parseProfilesImport(JSON.stringify([{ name: 'a', target: 'weird', key: 'k', values: [] }])).ok
    ).toBe(false);
    expect(
      parseProfilesImport(
        JSON.stringify([{ name: 'a', target: 'local', key: 'k', values: [1, 2] }])
      ).ok
    ).toBe(false);
  });

  it('rejects bad JSON and content without a profiles array', () => {
    expect(parseProfilesImport('{not json').ok).toBe(false);
    expect(parseProfilesImport(JSON.stringify({ foo: 1 })).ok).toBe(false);
  });

  it('profileImportConflicts detects a conflict by id or name', () => {
    expect(
      profileImportConflicts([sampleProfile], {
        id: 'prof_1',
        name: 'whatever',
        target: 'local',
        key: 'k',
        values: [],
        enabled: true,
      })
    ).toBe(true);
    expect(
      profileImportConflicts([sampleProfile], {
        name: 'Locale',
        target: 'local',
        key: 'k',
        values: [],
        enabled: true,
      })
    ).toBe(true);
    expect(
      profileImportConflicts([sampleProfile], {
        name: 'New',
        target: 'local',
        key: 'k',
        values: [],
        enabled: true,
      })
    ).toBe(false);
  });

  it('applyProfileImport overwrite mode replaces a matching id and keeps createdAt', () => {
    const next = applyProfileImport(
      [sampleProfile],
      [
        {
          id: 'prof_1',
          name: 'Renamed',
          target: 'local',
          key: 'k2',
          values: ['x'],
          enabled: false,
        },
      ],
      'overwrite',
      999
    );
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 'prof_1',
      name: 'Renamed',
      key: 'k2',
      enabled: false,
      createdAt: 1,
      updatedAt: 999,
    });
  });

  it('applyProfileImport keep-both mode never overwrites and de-duplicates names', () => {
    const next = applyProfileImport(
      [sampleProfile],
      [{ id: 'prof_1', name: 'Locale', target: 'local', key: 'k', values: [], enabled: true }],
      'keep-both',
      999
    );
    expect(next).toHaveLength(2);
    expect(next[0]!.id).toBe('prof_1'); // original untouched
    expect(next[1]!.name).toBe('Locale (2)');
    expect(next[1]!.id).not.toBe('prof_1');
  });
});

describe('data-io: query-param sets', () => {
  it('round-trips export → import preserving fields, and stamps the bundle', () => {
    const json = serializeQueryParamSets([sampleSet]);
    const bundle = JSON.parse(json);
    expect(bundle.app).toBe('senmurv');
    expect(bundle.type).toBe('queryParamSets');
    expect(bundle.schemaVersion).toBe(1);
    expect(typeof bundle.exportedAt).toBe('string');

    const res = parseQueryParamSetsImport(json);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(1);
      expect(res.value[0]).toMatchObject({ id: 'qps_1', name: 'Account record' });
    }
  });

  it('accepts a bare array of sets', () => {
    const res = parseQueryParamSetsImport(
      JSON.stringify([{ name: 'X', base: 'https://x', params: [], hash: '' }])
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value[0]).toMatchObject({ name: 'X', base: 'https://x' });
  });

  it('rejects an unsupported schemaVersion', () => {
    const res = parseQueryParamSetsImport(
      JSON.stringify({ schemaVersion: 99, sets: [{ name: 'a', base: 'b', params: [], hash: '' }] })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('schemaVersion');
  });

  it('reports the offending item with an index', () => {
    const res = parseQueryParamSetsImport(
      JSON.stringify({
        sets: [
          { name: 'ok', base: 'b', params: [], hash: '' },
          { name: '', base: 'b', params: [], hash: '' },
        ],
      })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('sets[1].name');
  });

  it('rejects malformed params', () => {
    const res = parseQueryParamSetsImport(
      JSON.stringify([{ name: 'a', base: 'b', params: [{ name: 'x' }], hash: '' }])
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('params');
  });

  it('rejects bad JSON and content without a sets array', () => {
    expect(parseQueryParamSetsImport('{not json').ok).toBe(false);
    expect(parseQueryParamSetsImport(JSON.stringify({ foo: 1 })).ok).toBe(false);
  });

  it('queryParamSetImportConflicts detects a conflict by id or name', () => {
    expect(
      queryParamSetImportConflicts([sampleSet], {
        id: 'qps_1',
        name: 'whatever',
        base: 'b',
        params: [],
        hash: '',
      })
    ).toBe(true);
    expect(
      queryParamSetImportConflicts([sampleSet], {
        name: 'Account record',
        base: 'b',
        params: [],
        hash: '',
      })
    ).toBe(true);
    expect(
      queryParamSetImportConflicts([sampleSet], { name: 'New', base: 'b', params: [], hash: '' })
    ).toBe(false);
  });

  it('applyQueryParamSetImport overwrite mode replaces a matching id and keeps createdAt', () => {
    const next = applyQueryParamSetImport(
      [sampleSet],
      [{ id: 'qps_1', name: 'Renamed', base: 'https://new', params: [], hash: '#x' }],
      'overwrite',
      999
    );
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 'qps_1',
      name: 'Renamed',
      base: 'https://new',
      hash: '#x',
      createdAt: 1,
      updatedAt: 999,
    });
  });

  it('applyQueryParamSetImport keep-both mode never overwrites and de-duplicates names', () => {
    const next = applyQueryParamSetImport(
      [sampleSet],
      [{ id: 'qps_1', name: 'Account record', base: 'b', params: [], hash: '' }],
      'keep-both',
      999
    );
    expect(next).toHaveLength(2);
    expect(next[0]!.id).toBe('qps_1');
    expect(next[1]!.name).toBe('Account record (2)');
    expect(next[1]!.id).not.toBe('qps_1');
  });
});

describe('data-io: notes', () => {
  it('round-trips export → import preserving fields, and stamps the bundle', () => {
    const json = serializeNotes([sampleNote]);
    const bundle = JSON.parse(json);
    expect(bundle.app).toBe('senmurv');
    expect(bundle.type).toBe('notes');
    expect(bundle.schemaVersion).toBe(1);
    expect(typeof bundle.exportedAt).toBe('string');

    const res = parseNotesImport(json);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(1);
      expect(res.value[0]).toMatchObject({ id: 'note_1', title: 'Standup' });
    }
  });

  it('accepts a bare array, including blank title/body', () => {
    const res = parseNotesImport(JSON.stringify([{ title: '', body: '' }]));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value[0]).toEqual({ title: '', body: '' });
  });

  it('rejects an unsupported schemaVersion', () => {
    const res = parseNotesImport(
      JSON.stringify({ schemaVersion: 99, notes: [{ title: 'a', body: 'b' }] })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('schemaVersion');
  });

  it('reports the offending item with an index', () => {
    const res = parseNotesImport(
      JSON.stringify({
        notes: [
          { title: 'ok', body: 'b' },
          { title: 'bad', body: 5 },
        ],
      })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('notes[1].body');
  });

  it('rejects bad JSON and content without a notes array', () => {
    expect(parseNotesImport('{not json').ok).toBe(false);
    expect(parseNotesImport(JSON.stringify({ foo: 1 })).ok).toBe(false);
  });

  it('noteImportConflicts detects a conflict by id or title', () => {
    expect(noteImportConflicts([sampleNote], { id: 'note_1', title: 'whatever', body: '' })).toBe(
      true
    );
    expect(noteImportConflicts([sampleNote], { title: 'Standup', body: '' })).toBe(true);
    expect(noteImportConflicts([sampleNote], { title: 'New', body: '' })).toBe(false);
  });

  it('applyNoteImport overwrite mode replaces a matching id and keeps createdAt', () => {
    const next = applyNoteImport(
      [sampleNote],
      [{ id: 'note_1', title: 'Renamed', body: 'new body' }],
      'overwrite',
      999
    );
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 'note_1',
      title: 'Renamed',
      body: 'new body',
      createdAt: 1,
      updatedAt: 999,
    });
  });

  it('applyNoteImport keep-both mode never overwrites and de-duplicates titles', () => {
    const next = applyNoteImport(
      [sampleNote],
      [{ id: 'note_1', title: 'Standup', body: 'x' }],
      'keep-both',
      999
    );
    expect(next).toHaveLength(2);
    expect(next[0]!.id).toBe('note_1');
    expect(next[1]!.title).toBe('Standup (2)');
    expect(next[1]!.id).not.toBe('note_1');
  });

  it('round-trips the favorite flag through export → import', () => {
    const favoriteNote: Note = { ...sampleNote, favorite: true };
    const res = parseNotesImport(serializeNotes([favoriteNote]));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value[0]!.favorite).toBe(true);
  });

  it('applyNoteImport carries favorite through in overwrite mode', () => {
    const next = applyNoteImport(
      [sampleNote],
      [{ id: 'note_1', title: 'Standup', body: 'x', favorite: true }],
      'overwrite',
      999
    );
    expect(next[0]!.favorite).toBe(true);
  });

  it('applyNoteImport carries favorite through in keep-both mode', () => {
    const next = applyNoteImport(
      [],
      [{ title: 'New', body: 'x', favorite: true }],
      'keep-both',
      999
    );
    expect(next[0]!.favorite).toBe(true);
  });
});

const sampleImportedAccount: ImportedAccount = {
  name: 'My Site',
  address: 'https://sub.x.com',
  username: 'sss@ss.com',
  useDefaultPassword: false,
  password: 'hunter2',
  usernameField: { kind: 'css', query: '#username' },
  passwordField: { kind: 'css', query: '#password' },
  loginButton: { kind: 'css', query: '#login' },
};

describe('data-io: accounts', () => {
  it('round-trips export → import preserving fields, and stamps the bundle', () => {
    const json = serializeAccountsExport([sampleImportedAccount], 'defaultPw');
    const bundle = JSON.parse(json);
    expect(bundle.app).toBe('senmurv');
    expect(bundle.type).toBe('accounts');
    expect(bundle.schemaVersion).toBe(1);
    expect(typeof bundle.exportedAt).toBe('string');
    expect(bundle.defaultPassword).toBe('defaultPw');

    const res = parseAccountsImport(json);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.accounts).toHaveLength(1);
      expect(res.value.accounts[0]).toEqual(sampleImportedAccount);
      expect(res.value.defaultPassword).toBe('defaultPw');
    }
  });

  it('omits defaultPassword from the bundle and the parsed result when absent', () => {
    const json = serializeAccountsExport([sampleImportedAccount]);
    expect(JSON.parse(json).defaultPassword).toBeUndefined();
    const res = parseAccountsImport(json);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.defaultPassword).toBeUndefined();
  });

  it('accepts a bare array, with no defaultPassword', () => {
    const res = parseAccountsImport(JSON.stringify([sampleImportedAccount]));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.accounts).toHaveLength(1);
      expect(res.value.defaultPassword).toBeUndefined();
    }
  });

  it('accepts useDefaultPassword: true with no password of its own', () => {
    const account = { ...sampleImportedAccount, useDefaultPassword: true };
    delete (account as { password?: string }).password;
    const res = parseAccountsImport(JSON.stringify({ accounts: [account] }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.accounts[0]!.password).toBeUndefined();
  });

  it('rejects an unsupported schemaVersion', () => {
    const res = parseAccountsImport(
      JSON.stringify({ schemaVersion: 99, accounts: [sampleImportedAccount] })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('schemaVersion');
  });

  it('rejects an account with no password and useDefaultPassword: false', () => {
    const account = { ...sampleImportedAccount };
    delete (account as { password?: string }).password;
    const res = parseAccountsImport(JSON.stringify({ accounts: [account] }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('accounts[0]');
  });

  it('reports the offending item with an index', () => {
    const res = parseAccountsImport(
      JSON.stringify({
        accounts: [sampleImportedAccount, { ...sampleImportedAccount, usernameField: null }],
      })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('accounts[1].usernameField');
  });

  it('rejects bad JSON and content without an accounts array', () => {
    expect(parseAccountsImport('{not json').ok).toBe(false);
    expect(parseAccountsImport(JSON.stringify({ foo: 1 })).ok).toBe(false);
  });

  it('rejects a non-object item and a bogus locator kind', () => {
    expect(parseAccountsImport(JSON.stringify({ accounts: [null] })).ok).toBe(false);
    const res = parseAccountsImport(
      JSON.stringify({
        accounts: [{ ...sampleImportedAccount, passwordField: { kind: 'html', query: 'x' } }],
      })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('passwordField');
  });

  it('carries group and description through export → import', () => {
    const withExtras: ImportedAccount = {
      ...sampleImportedAccount,
      group: 'Group A',
      description: 'Staging login',
    };
    const res = parseAccountsImport(serializeAccountsExport([withExtras]));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.accounts[0]!.group).toBe('Group A');
      expect(res.value.accounts[0]!.description).toBe('Staging login');
    }
  });
});

describe('data-io: checklists', () => {
  it('round-trips export → import preserving fields (incl. subtasks), and stamps the bundle', () => {
    const json = serializeChecklists([sampleChecklist]);
    const bundle = JSON.parse(json);
    expect(bundle.app).toBe('senmurv');
    expect(bundle.type).toBe('checklists');
    expect(bundle.schemaVersion).toBe(1);
    expect(typeof bundle.exportedAt).toBe('string');

    const res = parseChecklistsImport(json);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(1);
      expect(res.value[0]).toMatchObject({
        id: 'chk_1',
        title: 'Release v1.0',
        subtasks: [{ id: 'sub_1', title: 'Write tests', done: false }],
      });
    }
  });

  it('accepts a bare array of checklists', () => {
    const res = parseChecklistsImport(
      JSON.stringify([{ title: 'X', subtasks: [], done: false, deadline: null }])
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value[0]).toMatchObject({ title: 'X', subtasks: [] });
  });

  it('rejects an unsupported schemaVersion', () => {
    const res = parseChecklistsImport(
      JSON.stringify({
        schemaVersion: 99,
        checklists: [{ title: 'a', subtasks: [], done: false, deadline: null }],
      })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('schemaVersion');
  });

  it('reports the offending item with an index', () => {
    const res = parseChecklistsImport(
      JSON.stringify({
        checklists: [
          { title: 'ok', subtasks: [], done: false, deadline: null },
          { title: '', subtasks: [], done: false, deadline: null },
        ],
      })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('checklists[1].title');
  });

  it('reports an offending inline subtask with its own index', () => {
    const res = parseChecklistsImport(
      JSON.stringify({
        checklists: [
          {
            title: 'ok',
            subtasks: [
              { title: 'good', done: false },
              { title: 'bad', done: 'nope' },
            ],
            done: false,
            deadline: null,
          },
        ],
      })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('checklists[0].subtasks[1].done');
  });

  it('rejects a non-number, non-null deadline', () => {
    const res = parseChecklistsImport(
      JSON.stringify([{ title: 'a', subtasks: [], done: false, deadline: 'soon' }])
    );
    expect(res.ok).toBe(false);
  });

  it('rejects bad JSON and content without a checklists array', () => {
    expect(parseChecklistsImport('{not json').ok).toBe(false);
    expect(parseChecklistsImport(JSON.stringify({ foo: 1 })).ok).toBe(false);
  });

  it('checklistImportConflicts detects a conflict by id or title', () => {
    expect(
      checklistImportConflicts([sampleChecklist], {
        id: 'chk_1',
        title: 'whatever',
        subtasks: [],
        done: false,
        deadline: null,
      })
    ).toBe(true);
    expect(
      checklistImportConflicts([sampleChecklist], {
        title: 'Release v1.0',
        subtasks: [],
        done: false,
        deadline: null,
      })
    ).toBe(true);
    expect(
      checklistImportConflicts([sampleChecklist], {
        title: 'New',
        subtasks: [],
        done: false,
        deadline: null,
      })
    ).toBe(false);
  });

  it('applyChecklistImport overwrite mode replaces a matching id, keeps createdAt, and keeps subtask ids', () => {
    const next = applyChecklistImport(
      [sampleChecklist],
      [
        {
          id: 'chk_1',
          title: 'Renamed',
          subtasks: [{ id: 'sub_1', title: 'Write tests', done: true }],
          done: false,
          deadline: 123,
        },
      ],
      'overwrite',
      999
    );
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 'chk_1',
      title: 'Renamed',
      deadline: 123,
      createdAt: 1,
      updatedAt: 999,
    });
    expect(next[0]!.subtasks).toEqual([{ id: 'sub_1', title: 'Write tests', done: true }]);
  });

  it('applyChecklistImport overwrite mode assigns a fresh subtask id when none is given', () => {
    const next = applyChecklistImport(
      [],
      [{ title: 'New', subtasks: [{ title: 'Step', done: false }], done: false, deadline: null }],
      'overwrite',
      999
    );
    expect(next).toHaveLength(1);
    expect(next[0]!.subtasks).toHaveLength(1);
    expect(next[0]!.subtasks[0]!.id).toMatch(/^sub_/);
  });

  it('applyChecklistImport keep-both mode never overwrites, de-duplicates titles, and remaps subtask ids', () => {
    const next = applyChecklistImport(
      [sampleChecklist],
      [
        {
          id: 'chk_1',
          title: 'Release v1.0',
          subtasks: [{ id: 'sub_1', title: 'Write tests', done: false }],
          done: false,
          deadline: null,
        },
      ],
      'keep-both',
      999
    );
    expect(next).toHaveLength(2);
    expect(next[0]!.id).toBe('chk_1'); // original untouched
    expect(next[1]!.title).toBe('Release v1.0 (2)');
    expect(next[1]!.id).not.toBe('chk_1');
    expect(next[1]!.subtasks[0]!.id).not.toBe('sub_1');
    expect(next[1]!.subtasks[0]!.id).toMatch(/^sub_/);
  });

  it('round-trips the important flag through export → import', () => {
    const importantChecklist: Checklist = { ...sampleChecklist, important: true };
    const res = parseChecklistsImport(serializeChecklists([importantChecklist]));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value[0]!.important).toBe(true);
  });

  it('applyChecklistImport carries important through in overwrite mode', () => {
    const next = applyChecklistImport(
      [sampleChecklist],
      [
        {
          id: 'chk_1',
          title: 'Release v1.0',
          subtasks: [],
          done: false,
          deadline: null,
          important: true,
        },
      ],
      'overwrite',
      999
    );
    expect(next[0]!.important).toBe(true);
  });

  it('applyChecklistImport carries important through in keep-both mode', () => {
    const next = applyChecklistImport(
      [],
      [{ title: 'New', subtasks: [], done: false, deadline: null, important: true }],
      'keep-both',
      999
    );
    expect(next[0]!.important).toBe(true);
  });
});
