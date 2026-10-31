/**
 * T-30: a value that must never be printed.
 *
 * The only way to read it is `expose()`, which is easy to grep for.  Every
 * implicit conversion (template strings, JSON.stringify, console.log,
 * util.inspect) yields "[redacted]".
 */
export class Secret {
    #value;
    constructor(value) {
        if (typeof value !== "string" || value.length === 0) {
            throw new TypeError("Secret needs a non-empty string");
        }
        this.#value = value;
    }
    expose() {
        return this.#value;
    }
    toString() {
        return "[redacted]";
    }
    toJSON() {
        return "[redacted]";
    }
    [Symbol.for("nodejs.util.inspect.custom")]() {
        return "Secret([redacted])";
    }
    get [Symbol.toStringTag]() {
        return "Secret";
    }
}
/** Shape of a Nandee CI token.  Used by the scrubber even when the token was not passed in explicitly. */
export const CI_TOKEN_PATTERN = /ci_[A-Za-z0-9_-]{16,}/g;
//# sourceMappingURL=secret.js.map