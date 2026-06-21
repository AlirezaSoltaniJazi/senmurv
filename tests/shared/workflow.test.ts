import { describe, expect, it } from 'vitest';
import {
  buildWorkflowScript,
  isWorkflowScript,
  newStep,
  parseWorkflowScript,
} from '@/shared/workflow';
import type { WorkflowStep } from '@/shared/workflow';

const steps: WorkflowStep[] = [
  { id: 'a', kind: 'click', text: 'Continue' },
  { id: 'b', kind: 'fill', label: 'Prescription name', value: 'APD Rx' },
  { id: 'c', kind: 'select', label: 'Therapy modality', value: 'APD', optionMode: 'text' },
  { id: 'd', kind: 'wait', ms: 3000 },
  { id: 'e', kind: 'check', selector: 'mat-checkbox[formcontrolname="isRtm"]', checked: true },
];

describe('newStep', () => {
  it('creates sensible defaults per kind', () => {
    expect(newStep('wait').ms).toBe(1000);
    expect(newStep('select').optionMode).toBe('text');
    expect(newStep('check').checked).toBe(true);
    expect(newStep('click').text).toBe('');
  });
});

describe('buildWorkflowScript', () => {
  it('emits a runnable IIFE with a STEPS array and the interpreter', () => {
    const code = buildWorkflowScript(steps);
    expect(code.trim().startsWith('(async () =>')).toBe(true);
    expect(code).toContain('const STEPS =');
    expect(code).toContain('clickButton(step.text)');
    expect(code).toContain('setSelect(step)');
    expect(code).toContain('"Continue"');
    expect(isWorkflowScript(code)).toBe(true);
  });
});

describe('parseWorkflowScript', () => {
  it('round-trips a generated script back into steps', () => {
    const parsed = parseWorkflowScript(buildWorkflowScript(steps));
    expect(parsed).not.toBeNull();
    expect(parsed).toHaveLength(5);
    expect(parsed!.map((s) => s.kind)).toEqual(['click', 'fill', 'select', 'wait', 'check']);
    expect(parsed![0]).toMatchObject({ kind: 'click', text: 'Continue' });
    expect(parsed![2]).toMatchObject({ kind: 'select', label: 'Therapy modality', value: 'APD' });
    expect(parsed![3]).toMatchObject({ kind: 'wait', ms: 3000 });
  });

  it('returns null for non-workflow scripts', () => {
    expect(parseWorkflowScript('console.log(1)')).toBeNull();
    expect(isWorkflowScript('console.log(1)')).toBe(false);
  });
});
