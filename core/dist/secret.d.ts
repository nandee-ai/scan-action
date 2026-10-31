/**
 * T-30: a value that must never be printed.
 *
 * The only way to read it is `expose()`, which is easy to grep for.  Every
 * implicit conversion (template strings, JSON.stringify, console.log,
 * util.inspect) yields "[redacted]".
 */
export declare class Secret<T extends string = string> {
    #private;
    constructor(value: T);
    expose(): T;
    toString(): string;
    toJSON(): string;
    get [Symbol.toStringTag](): string;
}
/** Shape of a Nandee CI token.  Used by the scrubber even when the token was not passed in explicitly. */
export declare const CI_TOKEN_PATTERN: RegExp;
