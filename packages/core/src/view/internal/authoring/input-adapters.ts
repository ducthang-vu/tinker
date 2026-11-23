// Built-in adapters for the `adapter` option of `input()`. An adapter turns the string of
// a plain attribute (`size="3"`) into the input's type. Any `(value: string) => T` works,
// so an app can write its own the same way.

/**
 * Reads a plain attribute as a number: `size="3"` is 3. Text that is not a number, and an empty
 * attribute, are an error: the attribute's binding reports it with the attribute named.
 */
export const numberAdapter = (value: string): number => {
  const text = value.trim();
  const number = text === "" ? Number.NaN : Number(text);
  if (Number.isNaN(number)) {
    throw new TypeError(`"${value}" is not a number`);
  }
  return number;
};

/**
 * Reads a plain attribute as a boolean, as HTML does: a bare `open` and `open="open"`
 * are true, and only `open="false"` is false.
 */
export const booleanAdapter = (value: string): boolean => value !== "false";
