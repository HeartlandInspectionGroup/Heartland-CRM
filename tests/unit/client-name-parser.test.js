import { describe, it, expect } from 'vitest';
const { parseClientName } = require('../../functions/schedule-booking');

describe('parseClientName', () => {

  it('splits "John Smith" into first and last', () => {
    expect(parseClientName('John Smith')).toEqual({ first: 'John', last: 'Smith' });
  });

  it('handles three-part names — last word is last name', () => {
    expect(parseClientName('Mary Jane Watson')).toEqual({ first: 'Mary Jane', last: 'Watson' });
  });

  it('handles single name — no last name', () => {
    expect(parseClientName('John')).toEqual({ first: 'John', last: '' });
  });

  it('trims whitespace', () => {
    expect(parseClientName('  Jane   Doe  ')).toEqual({ first: 'Jane', last: 'Doe' });
  });

  it('handles empty string', () => {
    expect(parseClientName('')).toEqual({ first: '', last: '' });
  });

  it('handles null/undefined', () => {
    expect(parseClientName(null)).toEqual({ first: '', last: '' });
    expect(parseClientName(undefined)).toEqual({ first: '', last: '' });
  });

  it('handles four-part names', () => {
    expect(parseClientName('Sir Arthur Conan Doyle')).toEqual({ first: 'Sir Arthur Conan', last: 'Doyle' });
  });

});
