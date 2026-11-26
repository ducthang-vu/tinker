import { describe, expect, test } from "vitest";
import { decodeReferences } from "./entities.ts";

describe("decodeReferences", () => {
  test("decodes the HTML 4 names, and the basic ones", () => {
    expect(decodeReferences("&copy; &hellip; &amp; &lt; &gt; &quot; &apos; &nbsp;"))
      .toBe("© … & < > \" '  ");
  });

  test("keeps a name it does not know, and a name that is not a legacy one without its semicolon", () => {
    expect(decodeReferences("&zzzunknown; &hellip &Alpha"))
      .toBe("&zzzunknown; &hellip &Alpha");
  });

  test("decodes numeric references, in decimal and in hexadecimal", () => {
    expect(decodeReferences("&#65; &#x42; &#X43;"))
      .toBe("A B C");
  });

  test("a numeric reference that is not a code point becomes U+FFFD", () => {
    expect(decodeReferences("&#0; &#x110000; &#xD800;"))
      .toBe("\uFFFD \uFFFD \uFFFD");
  });
});

describe("legacy names, which decode without their semicolon", () => {
  test("decode without the semicolon in text", () => {
    expect(decodeReferences("&copy 2026"))
      .toBe("© 2026");
    expect(decodeReferences("&nbsp;&amp &AMP"))
      .toBe("\u00a0& &");
    expect(decodeReferences("&COPY &REG"))
      .toBe("\u00a9 \u00ae");
  });

  test("take the longest legacy name, and keep the rest of the text", () => {
    expect(decodeReferences("&copyx"))
      .toBe("©x");
    expect(decodeReferences("&notit;"))
      .toBe("¬it;");
  });

  test("in an attribute value, are kept when followed by = or a letter or digit", () => {
    expect(decodeReferences("a&copy=1", "attribute"))
      .toBe("a&copy=1");
    expect(decodeReferences("&copyx", "attribute"))
      .toBe("&copyx");
    expect(decodeReferences("&copy 2026", "attribute"))
      .toBe("© 2026");
    expect(decodeReferences("&copy", "attribute"))
      .toBe("©");
  });

  test("a numeric reference still needs its semicolon", () => {
    expect(decodeReferences("&#65 &#65;"))
      .toBe("&#65 A");
  });
});

describe("the HTML 5 names beyond HTML 4", () => {
  test("decode with their semicolon, to the characters the standard gives", () => {
    expect(decodeReferences("&check; &NotEqualTilde; &rarr;"))
      .toBe("✓ ≂̸ →");
  });

  test("need their semicolon", () => {
    expect(decodeReferences("&check x"))
      .toBe("&check x");
  });
});
