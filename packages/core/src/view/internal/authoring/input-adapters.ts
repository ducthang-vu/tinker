// Built-in adapters for the `adapter` option of `input()`. An adapter turns the string of
// a plain attribute (`size="3"`) into the input's type. Any `(value: string) => T` works,
// so an app can write its own the same way.

/**
 * Reads a plain attribute as a number: `size="3"` is 3. Text that is not a number, and an
 * empty attribute, give NaN.
 */
export const numberAdapter = (value: string): number => {
  const text = value.trim();
  return text === "" ? Number.NaN : Number(text);
};

/**
 * Reads a plain attribute as a boolean, as HTML does: a bare `open` and `open="open"`
 * are true, and only `open="false"` is false.
 */
export const booleanAdapter = (value: string): boolean => value !== "false";
