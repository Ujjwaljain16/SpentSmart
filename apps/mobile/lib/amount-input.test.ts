import { describe, expect, it } from 'vitest';
import { applyAmountEdit, groupAmountInput, ungroupAmountInput } from './amount-input';

describe('amount input grouping', () => {
  it('groups in the Indian style', () => {
    expect(groupAmountInput('')).toBe('');
    expect(groupAmountInput('999')).toBe('999');
    expect(groupAmountInput('1000')).toBe('1,000');
    expect(groupAmountInput('15000')).toBe('15,000');
    expect(groupAmountInput('150000')).toBe('1,50,000');
    expect(groupAmountInput('12345678')).toBe('1,23,45,678');
  });

  it('keeps decimals, a trailing point and a minus sign as typed', () => {
    expect(groupAmountInput('150000.5')).toBe('1,50,000.5');
    expect(groupAmountInput('2500.')).toBe('2,500.');
    expect(groupAmountInput('-25000')).toBe('-25,000');
  });

  it('leaves text that is not a number alone', () => {
    expect(groupAmountInput('12a4')).toBe('12a4');
    expect(groupAmountInput('1.2.3')).toBe('1.2.3');
  });

  it('backspacing over a comma deletes the digit before it', () => {
    // "2,50,000" with the cursor after the first comma; backspace removes the comma only.
    expect(applyAmountEdit('250000', '250,000')).toBe('50000');
    // "25,000" → backspace at the end deletes a digit normally.
    expect(applyAmountEdit('25000', '25,00')).toBe('2500');
    // Holding backspace from "25,00,000" all the way down never gets stuck.
    let raw = '2500000';
    for (let n = 0; n < 12 && raw; n++) {
      const shown = groupAmountInput(raw);
      raw = applyAmountEdit(raw, shown.slice(0, -1));
    }
    expect(raw).toBe('');
  });

  it('typing and pasting still work', () => {
    expect(applyAmountEdit('2500', '2,5000')).toBe('25000');
    expect(applyAmountEdit('', '1,50,000')).toBe('150000');
    expect(applyAmountEdit('25000', '')).toBe('');
  });

  it('round-trips through what the field shows', () => {
    for (const raw of ['', '7', '1000', '150000.50', '-99999', '2500.']) {
      expect(ungroupAmountInput(groupAmountInput(raw))).toBe(raw);
    }
    expect(ungroupAmountInput('1,50,000')).toBe('150000');
  });
});
