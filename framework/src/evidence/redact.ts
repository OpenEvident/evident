const REDACTED = '[REDACTED]';

/**
 * Field names redacted by key alone, regardless of value shape — the only
 * way to catch PII that has no reliable value-level pattern (a person's
 * name, a street address). Two categories: credentials (token, password,
 * secret, authorization, credential, apiKey) and common PII field names
 * (name, email, phone, address, date of birth, national ID, card number).
 * This is a name-matching heuristic, not a guarantee — a field called
 * `"notes"` containing a name in free text isn't caught this way; see the
 * module-level note below on why that needs NER, not regex.
 */
const SENSITIVE_KEY_PATTERN =
  /token|password|secret|authorization|credential|api[-_]?key|^name$|(?:first|last|full|middle|sur|display|customer|client|user|contact|person|employee|patient|guest)[-_]?name|e[-_]?mail|phone|mobile|address|street|city|postal|zip[-_]?code|date[-_]?of[-_]?birth|\bdob\b|birth[-_]?date|ssn|social[-_]?security|national[-_]?id|passport|driver.?s?[-_]?licen[cs]e|credit[-_]?card|card[-_]?number|\bcvv\b|\biban\b/i;

/**
 * Value-pattern detectors — the regex + checksum tier Microsoft Presidio
 * (the reference implementation most PII tools benchmark against) uses for
 * structured entities: format is well-defined enough to detect without ML.
 * Contextual entities (person names, street addresses in free text) need
 * real NER — deliberately out of scope here, since that needs a real
 * model, not a regex, and this framework stays local/dependency-light by
 * design. If that's ever needed, Presidio or a cloud DLP API is the
 * honest answer, not a bigger regex.
 */
const EMAIL_PATTERN =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+/g;

/** US format only (xxx-xx-xxxx) — the one SSN shape with a fixed, low-false-positive pattern. */
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;

const IPV4_PATTERN = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g;

/**
 * Requires a visible separator or leading `+` so it doesn't fire on
 * unformatted digit runs (record IDs, timestamps) — international formats
 * vary too widely for one regex to catch reliably; this covers common
 * US/punctuated shapes, not an exhaustive set.
 */
const PHONE_PATTERN =
  /\+\d{1,3}[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{0,4}\b|\(\d{3}\)[-.\s]?\d{3}[-.\s]\d{4}\b|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g;

/** 13-19 digits, optionally space/dash-separated — the real card-number length range. Luhn-validated before redacting, see {@link isValidLuhn}. */
const CARD_CANDIDATE_PATTERN = /\b(?:\d[ -]?){13,19}\b/g;

/** Standard mod-10 checksum every real card number satisfies (PCI-DSS's own recommended detection technique) — filters out arbitrary same-length digit runs (record IDs, timestamps) that aren't actually card numbers. */
function isValidLuhn(digitsOnly: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = digitsOnly.length - 1; i >= 0; i -= 1) {
    let digit = Number(digitsOnly[i]);
    if (alternate) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    alternate = !alternate;
  }
  return digitsOnly.length > 0 && sum % 10 === 0;
}

function redactCreditCards(text: string): string {
  return text.replace(CARD_CANDIDATE_PATTERN, (match) => {
    const digitsOnly = match.replace(/[ -]/g, '');
    if (digitsOnly.length < 13 || digitsOnly.length > 19) {
      return match;
    }
    return isValidLuhn(digitsOnly) ? REDACTED : match;
  });
}

/**
 * Redacts structured PII (email, US SSN, IPv4, Luhn-validated credit card,
 * common phone shapes) from raw text. Order matters: credit cards (most
 * specific, checksum-validated) and SSNs (fixed dash grouping) run first,
 * so the loosest pattern (phone) never gets a chance to partially match
 * inside a run of digits a stricter pattern should own.
 */
export function redactPii(text: string): string {
  let result = text;
  result = redactCreditCards(result);
  result = result.replace(SSN_PATTERN, REDACTED);
  result = result.replace(EMAIL_PATTERN, REDACTED);
  result = result.replace(IPV4_PATTERN, REDACTED);
  result = result.replace(PHONE_PATTERN, REDACTED);
  return result;
}

/**
 * Recursively redacts object properties whose key matches a known-sensitive
 * pattern (see {@link SENSITIVE_KEY_PATTERN}), and additionally scans every
 * string leaf value for structured PII via {@link redactPii} regardless of
 * its key — catches PII sitting under an innocuous field name. Arrays and
 * plain objects are walked; non-string, non-object values pass through
 * unchanged.
 */
export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (value !== null && typeof value === 'object') {
    /**
     * `Object.create(null)`: a plain `{}` inherits the `__proto__` setter,
     * so assigning a literal `__proto__` key (`JSON.parse` can produce
     * one) would reassign this object's prototype instead of storing the
     * field.
     */
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactValue(val);
    }
    return result;
  }

  if (typeof value === 'string') {
    return redactPii(value);
  }

  return value;
}

/** Redacts credential shapes (auth headers, bearer/basic tokens, JSON secret fields) and structured PII (see {@link redactPii}) from raw text such as log content. */
export function redactText(text: string): string {
  let result = text;
  /**
   * Consumes the rest of the line — an Authorization header's value isn't
   * necessarily a single whitespace-delimited token (e.g. "Bearer <jwt>").
   */
  result = result.replace(/(authorization:\s*).*/gi, `$1${REDACTED}`);
  result = result.replace(/bearer\s+[\w.-]+/gi, REDACTED);
  result = result.replace(/basic\s+[\w+/=]+/gi, REDACTED);
  result = result.replace(
    /("(?:password|token|secret|api[-_]?key)"\s*:\s*")[^"]*(")/gi,
    `$1${REDACTED}$2`,
  );
  result = redactPii(result);
  return result;
}
