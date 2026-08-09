import { describe, expect, it } from 'vitest';
import { redactPii, redactText, redactValue } from '../src/evidence/redact.js';

describe('redactValue', () => {
  it('redacts top-level sensitive keys', () => {
    expect(redactValue({ token: 'abc123', recordId: 'r1' })).toEqual({
      token: '[REDACTED]',
      recordId: 'r1',
    });
  });

  it('redacts nested sensitive keys', () => {
    expect(redactValue({ auth: { password: 'hunter2' }, recordId: 'r1' })).toEqual({
      auth: { password: '[REDACTED]' },
      recordId: 'r1',
    });
  });

  it('redacts sensitive keys inside arrays of objects', () => {
    expect(redactValue([{ apiKey: 'k1' }, { apiKey: 'k2', ok: true }])).toEqual([
      { apiKey: '[REDACTED]' },
      { apiKey: '[REDACTED]', ok: true },
    ]);
  });

  it('matches key variants case-insensitively and with separators', () => {
    expect(
      redactValue({
        Authorization: 'Bearer xyz',
        client_secret: 's1',
        'api-key': 'k1',
        credentials: { user: 'u', pass: 'p' },
      }),
    ).toEqual({
      Authorization: '[REDACTED]',
      client_secret: '[REDACTED]',
      'api-key': '[REDACTED]',
      credentials: '[REDACTED]',
    });
  });

  it('leaves non-sensitive values untouched', () => {
    const value = { recordId: 'r1', status: 'completed', count: 3 };
    expect(redactValue(value)).toEqual(value);
  });

  it('preserves a literal "__proto__" own key instead of reassigning the result object\'s prototype', () => {
    const withProtoKey: Record<string, unknown> = JSON.parse(
      '{"__proto__": "not-a-real-prototype", "recordId": "r1"}',
    ) as Record<string, unknown>;

    const result = redactValue(withProtoKey) as Record<string, unknown>;

    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true);
    expect(result.__proto__).toBe('not-a-real-prototype');
    expect(result.recordId).toBe('r1');
  });

  it('passes through primitives and null', () => {
    expect(redactValue('plain string')).toBe('plain string');
    expect(redactValue(42)).toBe(42);
    expect(redactValue(null)).toBeNull();
    expect(redactValue(undefined)).toBeUndefined();
  });
});

describe('redactText', () => {
  it('redacts an Authorization header line', () => {
    expect(redactText('Authorization: Bearer abc.def.ghi')).toBe('Authorization: [REDACTED]');
  });

  it('redacts a bare Bearer token', () => {
    expect(redactText('calling with token Bearer abc123 attached')).toBe(
      'calling with token [REDACTED] attached',
    );
  });

  it('redacts a Basic auth value', () => {
    expect(redactText('Authorization: Basic dXNlcjpwYXNz')).toBe('Authorization: [REDACTED]');
  });

  it('redacts JSON-shaped secret fields embedded in text', () => {
    expect(redactText('payload: {"password":"hunter2","recordId":"r1"}')).toBe(
      'payload: {"password":"[REDACTED]","recordId":"r1"}',
    );
  });

  it('leaves unrelated text untouched', () => {
    const text = 'processed record r1 in 300ms';
    expect(redactText(text)).toBe(text);
  });
});

describe('redactPii', () => {
  it('redacts an email address embedded in a sentence', () => {
    expect(redactPii('contact jane.doe@example.com for help')).toBe('contact [REDACTED] for help');
  });

  it('redacts a US-format SSN', () => {
    expect(redactPii('ssn on file: 123-45-6789')).toBe('ssn on file: [REDACTED]');
  });

  it('does not redact a 9-digit number without SSN dash grouping', () => {
    const text = 'reference number 123456789';
    expect(redactPii(text)).toBe(text);
  });

  it('redacts an IPv4 address', () => {
    expect(redactPii('client connected from 203.0.113.42')).toBe(
      'client connected from [REDACTED]',
    );
  });

  it('redacts a formatted phone number', () => {
    expect(redactPii('call me at 555-123-4567')).toBe('call me at [REDACTED]');
    expect(redactPii('call me at (555) 123-4567')).toBe('call me at [REDACTED]');
    expect(redactPii('call me at +1 555 123 4567')).toBe('call me at [REDACTED]');
  });

  it('redacts a Luhn-valid credit card number', () => {
    expect(redactPii('card on file: 4111111111111111')).toBe('card on file: [REDACTED]');
    expect(redactPii('card on file: 4111-1111-1111-1111')).toBe('card on file: [REDACTED]');
  });

  it('does not redact a card-length digit run that fails the Luhn checksum', () => {
    /**
     * Same as the valid Visa test number above with the last digit changed
     * by 1 — guaranteed to break the Luhn checksum.
     */
    const text = 'card on file: 4111111111111112';
    expect(redactPii(text)).toBe(text);
  });

  it('does not redact realistic recordId/timestamp strings as cards, SSNs, or phone numbers', () => {
    const text = 'processed record timeout-pass-1786265603754 in 894ms';
    expect(redactPii(text)).toBe(text);
  });
});

describe('redactValue with structured PII', () => {
  it('redacts a PII-shaped value even under an innocuous key name', () => {
    expect(redactValue({ contact: 'jane.doe@example.com', recordId: 'r1' })).toEqual({
      contact: '[REDACTED]',
      recordId: 'r1',
    });
  });

  it('redacts common PII field names by key regardless of value shape', () => {
    expect(
      redactValue({
        customerName: 'Jane Doe',
        address: '123 Main St',
        dateOfBirth: '1990-01-01',
        recordId: 'r1',
      }),
    ).toEqual({
      customerName: '[REDACTED]',
      address: '[REDACTED]',
      dateOfBirth: '[REDACTED]',
      recordId: 'r1',
    });
  });

  it('leaves realistic non-PII business data untouched', () => {
    const value = { recordId: 'timeout-pass-1786265603754', status: 'completed', delayMs: 300 };
    expect(redactValue(value)).toEqual(value);
  });

  it('does not redact "name" fields that are not person-name-shaped (fileName, hostName, eventName)', () => {
    const value = {
      fileName: 'caller-service.log',
      hostName: 'localhost',
      eventName: 'trigger-received',
    };
    expect(redactValue(value)).toEqual(value);
  });
});
