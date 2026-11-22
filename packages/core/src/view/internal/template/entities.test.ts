import { describe, expect, test } from "vitest";
import { decodeReferences } from "./entities.ts";

describe("decodeReferences", () => {
  test("decodes the HTML 4 names, and the basic ones", () => {
    expect(decodeReferences("&copy; &hellip; &amp; &lt; &gt; &quot; &apos; &nbsp;"))
      .toBe("© … & < > \" '  ");
  });

  test("keeps a name it does not know, and a reference without its semicolon", () => {
    expect(decodeReferences("&notathing; &copy &not"))
      .toBe("&notathing; &copy &not");
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
