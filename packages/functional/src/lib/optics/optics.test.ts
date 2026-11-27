import { isDeepStrictEqual } from "node:util";
import { describe, expect, test } from "vitest";
import { isoLaws, lensLaws, type LawCheck, optionalLaws, EDGE_VALUES } from "../../testing.ts";
import { None, Some } from "../monad/maybe.ts";
import { isEqual } from "../monad/monad.ts";
import { at, prop } from "./accessors.ts";
import { compose, Iso, Lens, Optional } from "./optics.ts";

interface Address {
  readonly city: string;
  readonly zip: string;
}
interface User {
  readonly name: string;
  readonly address: Address;
  readonly tags: readonly string[];
}

const user: User = { name: "Ada", address: { city: "Paris", zip: "75001" }, tags: ["a", "b"] };
const users: readonly User[] = [
  user,
  { name: "", address: { city: "", zip: "" }, tags: [] },
  { name: "Bob", address: { city: "Rome", zip: "00100" }, tags: [""] },
];
const texts = ["", " ", "Paris", "Rome", "0", "null"];

/** A lawful Iso: a text and its reverse. */
const reversed = Iso.of(
  (text: string) => [...text].reverse()
    .join(""),
  (text: string) => [...text].reverse()
    .join(""),
);
/** A lawful Iso on records: a city as a one-key record. */
const boxed = Iso.of((city: string) => ({ city }), (box: { readonly city: string }) => box.city);

const address = prop<User>()("address");
const city = prop<Address>()("city");
const firstTag = compose(prop<User>()("tags"), at<string>(0));

/** Runs every check of a law checker, and expects none to throw. */
const expectLawful = (checks: readonly LawCheck[]): void => {
  for (const [description, check] of checks) {
    expect(check, description)
      .not.toThrow();
  }
};

describe("Iso", () => {
  test("to and from convert both ways", () => {
    expect(reversed.to("abc"))
      .toBe("cba");
    expect(reversed.from("cba"))
      .toBe("abc");
  });

  test("obeys the iso laws", () => {
    expectLawful(isoLaws({ name: "reversed", optic: reversed, samples: texts, values: texts }));
  });

  test("as a Lens, obeys the lens laws and keeps the whole when the part is unchanged", () => {
    const lens = reversed.toLens();
    expectLawful(lensLaws({ name: "reversed as a lens", optic: lens, samples: texts, values: texts }));
    expect(lens.set("cba", "abc"))
      .toBe("abc");
    expect(lens.set("xyz", "abc"))
      .toBe("zyx");
  });

  test("as an Optional, always holds its part", () => {
    const optional = reversed.toOptional();
    expect(isEqual(optional.preview("abc"), Some.of("cba")))
      .toBe(true);
    expectLawful(optionalLaws({ name: "reversed as an optional", optic: optional, samples: texts, values: texts }));
  });

  test("modify changes the part through the conversion", () => {
    expect(reversed.modify((part) => part.toUpperCase(), "abc"))
      .toBe("ABC");
  });
});

describe("Lens", () => {
  test("get reads the part and set returns a new whole", () => {
    const name = Lens.of((u: User) => u.name, (name: string, u: User) => ({ ...u, name }));
    expect(name.get(user))
      .toBe("Ada");
    expect(name.set("Eve", user))
      .toEqual({ ...user, name: "Eve" });
    expect(user.name)
      .toBe("Ada");
  });

  test("modify sets the part computed from the current one", () => {
    expect(address.modify((a) => ({ ...a, zip: "75002" }), user).address.zip)
      .toBe("75002");
  });

  test("toLens is the Lens itself", () => {
    expect(address.toLens())
      .toBe(address);
  });

  test("as an Optional, always holds its part and obeys the optional laws", () => {
    const optional = address.toOptional();
    expect(isEqual(optional.preview(user), Some.of(user.address)))
      .toBe(true);
    expectLawful(optionalLaws({
      name: "address as an optional",
      optic: optional,
      samples: users,
      values: users.map((u) => u.address),
      equal: isDeepStrictEqual,
    }));
  });
});

describe("Optional", () => {
  test("modify changes the part when there is one, and keeps the whole otherwise", () => {
    const second = at<number>(1);
    expect(second.modify((n) => n * 10, [1, 2]))
      .toEqual([1, 20]);
    const short = [1];
    expect(second.modify((n) => n * 10, short))
      .toBe(short);
  });

  test("toOptional is the Optional itself", () => {
    const optional = Optional.of((n: number) => Some.of(n), (n: number) => n);
    expect(optional.toOptional())
      .toBe(optional);
  });
});

describe("compose", () => {
  test("two Isos give an Iso that obeys the iso laws", () => {
    const both = compose(reversed, reversed);
    expect(both)
      .toBeInstanceOf(Iso);
    expect(both.to("abc"))
      .toBe("abc");
    expectLawful(isoLaws({ name: "reversed twice", optic: both, samples: texts, values: texts }));
  });

  test("two Lenses give a Lens that obeys the lens laws", () => {
    const userCity = compose(address, city);
    expect(userCity)
      .toBeInstanceOf(Lens);
    expect(userCity.get(user))
      .toBe("Paris");
    expectLawful(lensLaws({
      name: "address.city",
      optic: userCity,
      samples: users,
      values: texts,
      equal: isDeepStrictEqual,
    }));
  });

  test("a set copies only the path to the part, and shares every other branch", () => {
    const moved = compose(address, city)
      .set("Rome", user);
    expect(moved.address.city)
      .toBe("Rome");
    expect(moved.address.zip)
      .toBe("75001");
    expect(moved.tags)
      .toBe(user.tags);
    expect(moved.address)
      .not.toBe(user.address);
  });

  test("setting the part a whole holds returns the same whole, at any depth", () => {
    expect(compose(address, city)
      .set("Paris", user))
      .toBe(user);
    expect(firstTag.set("a", user))
      .toBe(user);
  });

  test("an Iso and a Lens give a Lens, in either order", () => {
    const outer = compose(boxed, prop<{ readonly city: string }>()("city"));
    expect(outer)
      .toBeInstanceOf(Lens);
    expectLawful(lensLaws({ name: "boxed.city", optic: outer, samples: texts, values: texts }));

    const inner = compose(city, reversed);
    expect(inner)
      .toBeInstanceOf(Lens);
    expect(inner.set("emoR", user.address))
      .toEqual({ city: "Rome", zip: "75001" });
    expectLawful(lensLaws({
      name: "city reversed",
      optic: inner,
      samples: users.map((u) => u.address),
      values: texts,
      equal: isDeepStrictEqual,
    }));
  });

  test("a Lens and an Optional give an Optional that obeys the optional laws", () => {
    expect(firstTag)
      .toBeInstanceOf(Optional);
    expect(isEqual(firstTag.preview(user), Some.of("a")))
      .toBe(true);
    expect(isEqual(firstTag.preview(users[1]!), None.of()))
      .toBe(true);
    expectLawful(optionalLaws({
      name: "tags[0]",
      optic: firstTag,
      samples: users,
      values: texts,
      equal: isDeepStrictEqual,
    }));
  });

  test("an Optional and a Lens give an Optional that obeys the optional laws", () => {
    const firstName = compose(at<User>(0), prop<User>()("name"));
    expect(firstName)
      .toBeInstanceOf(Optional);
    expectLawful(optionalLaws({
      name: "[0].name",
      optic: firstName,
      samples: [[], users, [users[2]!]],
      values: texts,
      equal: isDeepStrictEqual,
    }));
  });

  test("an Optional and an Iso give an Optional, in either order", () => {
    const tagReversed = compose(firstTag, reversed);
    expect(tagReversed)
      .toBeInstanceOf(Optional);
    expect(tagReversed.set("x", user).tags)
      .toEqual(["x", "b"]);
    expectLawful(optionalLaws({
      name: "tags[0] reversed",
      optic: tagReversed,
      samples: users,
      values: texts,
      equal: isDeepStrictEqual,
    }));

    const listReversed = compose(Iso.of<readonly string[], readonly string[]>(
      (list: readonly string[]) => list.slice()
        .reverse(),
      (list: readonly string[]) => list.slice()
        .reverse(),
    ), at<string>(0));
    expect(listReversed)
      .toBeInstanceOf(Optional);
    expect(isEqual(listReversed.preview(["a", "b"]), Some.of("b")))
      .toBe(true);
  });

  test("obeys the laws on every edge value as the part", () => {
    const deep = compose(
      prop<{ readonly inner: { readonly value: unknown } }>()("inner"),
      prop<{ readonly value: unknown }>()("value"),
    );
    expectLawful(lensLaws({
      name: "inner.value",
      optic: deep,
      samples: EDGE_VALUES.map((value) => ({ inner: { value } })),
      values: EDGE_VALUES,
      equal: isDeepStrictEqual,
    }));
  });
});
