/**
 * T-30: a value that must never be printed.
 *
 * The only way to read it is `expose()`, which is easy to grep for.  Every
 * implicit conversion (template strings, JSON.stringify, console.log,
 * util.inspect) yields "[redacted]".
 */
export class Secret<T extends string = string> {
  readonly #value: T;

  constructor(value: T) {
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError("Secret needs a non-empty string");
    }
    this.#value = value;
  }

  expose(): T {
    return this.#value;
  }

  toString(): string {
    return "[redacted]";
  }

  toJSON(): string {
    return "[redacted]";
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return "Secret([redacted])";
  }

  get [Symbol.toStringTag](): string {
    return "Secret";
  }
}

/** Shape of a Nandee CI token.  Used by the scrubber even when the token was not passed in explicitly. */
export const CI_TOKEN_PATTERN = /ci_[A-Za-z0-9_-]{16,}/g;
