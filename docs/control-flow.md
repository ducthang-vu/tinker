# Control flow in templates: design

This page collects the design of template control flow: `@if`, `@else`, `@match`,
`@for`, and the patterns they use. It is a plan, not a reference for what
exists. The status of each item is marked: **done**, **planned**, or
**later**. The last section orders the work.

## Principles

- **One core.** `@match` is the only branching construct. `@if` is sugar for it.
- **The pattern belongs to the case.** A `@match` subject is only a value. Each
  `@case` says what the value must look like, so a test is never a mode of the
  whole `@match`.
- **Cases are tried in order.** The first case that matches is shown. Later
  cases are not evaluated, so a later test can rely on the earlier ones failing.
- **Only the branch shown exists.** Each branch is an embedded view, owned by an
  anchor. Changing branch removes the old view and creates the new one. Staying
  on the same branch does nothing.
- **Names bound by a case exist only in its branch.**
- **The subject is evaluated once when it is a `@let`.** Written inline, it is
  evaluated again for each case.

## Expressions

Expressions are what a case or a `when` reads. Their grammar, from the loosest
operator to the tightest:

```
expression := conditional
conditional := coalesce ( "?" conditional ":" conditional )?   -- right-associative
coalesce   := equality ( "??" equality )*                      -- right side only for null or undefined
equality   := ... (see below)
additive   := term ( ("+" | "-") term )*
term       := power ( ("*" | "/") power )*
power      := operand ( "**" power )?                                   -- right-associative
operand    := number | string | boolean | null | "!" operand
            | "(" expression ")" | object | array | access
object     := "{" ( key ( ":" conditional )? ) ( "," ... )* "}"          -- { k } reads field k
array      := "[" ( conditional ( "," conditional )* )? "]"
access     := identifier ( ( "." | "?." ) identifier | "(" ")" )*        -- "?." yields undefined on null
```

`?.` is lenient: once a chain has a `?.` link, every later link in that chain
also reads `undefined` instead of throwing when its receiver is nullish. So
`user?.address.city` is `undefined` when `user.address` is missing. JavaScript
throws in that case, so this differs on purpose for templates, where a missing
field should not break rendering. Key modifiers (`(keydown.enter)`, `.esc`,
`.space`, ...) compare `KeyboardEvent.key`, so the names are `Enter`, `Escape`
and `" "` (a space).

| Item | Status | Notes |
|---|---|---|
| Fields and chains: `title`, `user.name` | done | bare names read from the component, or a `@let` |
| Calls with no arguments: `count()`, `user().name` | done | |
| Numbers: `2`, `0.5` | done | |
| `+ - * / **`, parentheses | done | JavaScript's precedence; `**` right-associative |
| `===`, `==` | done | `==` converts operands, as JavaScript does |
| String literals: `"loading"` | done | single or double quotes; a backslash escapes the next character |
| `true`, `false`, `null`, `undefined` | done | |
| `>`, `<`, `>=`, `<=` | done | |
| `!==`, `!=` | done | |
| `&&`, `\|\|`, `!` | done | short-circuit, as in JavaScript |
| `test ? then : otherwise`, nested | done | only the chosen branch is evaluated |
| Call arguments: `format(x)` | later | |
| Arrow functions: `t => t.done` | later | needed for `filter` and `map` in templates |
| Unary minus: `-1` | later | |
| Pipes | not planned | |

## `@let`

| Form | Meaning | Status |
|---|---|---|
| `@let name = expression;` | declares a value for the bindings after it; it shadows a field of the same name | done |
| `@let name;` with no value | declares a name to be set later | not planned |

## `@match`

```html
@match subject {
  @case pattern { ... }
  @case pattern when condition { ... }
  @default { ... }
}
```

| Form | Status |
|---|---|
| `@match subject { @case pattern { ... } }` | done |
| `@default { ... }`, shown when no case matched | done |
| `@match { @case _ when condition { ... } }`, with no subject, where each case is a condition | done |
| No default, and nothing matched: nothing is shown | done |

### Patterns

| Pattern | Matches | Example | Status |
|---|---|---|---|
| Number | `===` that number | `@case 0` | done |
| String | `===` that text | `@case "loading"` | done |
| `true`, `false`, `null`, `undefined` | `===` that value | `@case null` | done |
| `truthy` | a truthy value | `@case truthy` | done |
| `falsy` | a falsy value: `0`, `""`, `null`, `undefined`, `false`, `NaN` | `@case falsy` | done |
| `_` | anything | `@case _ when a()` | done |
| Name | anything, bound to that name in the branch | `@case value` | done |
| `present` | anything except `null` and `undefined` | `@case present` | done |
| Object, by tag or shape | an object with those fields | `@case { tag: "ok", value }` | done |
| Object key absent | an object without that key | `@case { error: absent }` | done |
| Type check in an object | a field of a runtime type | `@case { id: number, name: string }` | done |
| Empty array | an empty list | `@case []` | done |
| Array, fixed length or with rest | a list of that shape | `@case [first, ...rest]` | done |
| Nested object | a field that is itself an object pattern | `@case { customer: { country: "FR" } }` | done |
| Alternatives | any of several patterns (they bind no names) | `@case "loading" \| "saving"` | done |
| Range | a number from the smaller bound to the larger, both included | `@case 0..12` | done |
| `not` | anything the inner pattern does not match (it binds no names) | `@case not "guest"` | done |

Type names (`number`, `string`, `boolean`, `object`, `function`, `undefined`)
are reserved words in patterns, so a field named `number` cannot be bound by a
bare name.

Class checks (`instanceof`) are not planned: a class name is not in the
template's scope. Our own types are matched by their `tag` instead.

### Guards

| Form | Meaning | Status |
|---|---|---|
| `@case pattern when condition` | the pattern matches, and the condition is truthy | done |
| `@case _ when condition` | the condition alone decides | done |

A guard is only tried after its pattern matched, so a binding it uses already
exists.

## `@if` and `@else`

`@if` is `@match` with truthiness. It has no separate mechanism.

| Form | Desugars to | Status |
|---|---|---|
| `@if (c) { A } @else { B }` | `@match c { @case truthy { A } @default { B } }` | done |
| `@if (a) { A } @else if (b) { B } @else { C }` | `@match { @case _ when a { A } @case _ when b { B } @default { C } }` | done |

## `@map` (the list block)

`@map` renders one row per item. It is named `@map` rather than `@for`.

| Form | Meaning | Status |
|---|---|---|
| `@map list(); let item { ... }` | one row per item, in order, the item named `item` | done |
| `$index`, `$first`, `$last`, `$even`, `$odd`, `$count` | per-row variables, always in scope, reserved | done |
| `@map list(); let item; track item.id { ... }` | the identity of each row; defaults to the index | done |
| `track { id, kind }` | identity by some fields, each compared with `===` | done |
| `@match list() { @case [] { ... } }` | shown when the list is empty | done |
| `let { id, title }` or `let [first, ...rest]` | destructures each item into names | done |

What the item binds (its name, or the names its pattern destructures) is a signal
per name, set on each update, so a row updates in place when its item changes, and
is recreated only when its identity leaves the list.

## Equality as sugar

| Form | Desugars to | Status |
|---|---|---|
| `@match v { @case 1 { A } }` | `@match { @case _ when v === 1 { A } }` | done |

## What to implement first

Each step depends on the one before. The order below is the cheapest path to a
working `@if` and `@match`, and it keeps every step testable on its own.

1. **Literals: strings, `true`, `false`, `null`, `undefined`.** Done.
2. **Comparison and logical operators: `> < >= <=`, `!== !=`, `&& || !`.** Done.
3. **Embedded views.** A `View` kind with no host element and no component, owned
   by an anchor, that a block creates and removes. This is the machinery `@if`,
   `@match` and `@for` all need.
4. **`@match` with a subject, and the patterns `truthy`, `falsy`, literals and
   `_`, with `@default`.** Then `@if` and `@else` as sugar for it.
5. **Guards with `when`, and the subject-less form.** Done. `@else if` is done too (it nests).
6. **`@map`**, with `track`, the `$` variables, destructuring, and the empty case. Done.
7. **Names and object patterns**, then arrays, then alternatives, `present`,
   ranges and `not`. Done.

Steps 1 and 2 are small and can each be a pull request. Step 3 is the largest
change, and steps 4 to 7 build on it.

## Relations and object patterns (as built)

| Pattern | Matches | Example | Status |
|---|---|---|---|
| Relation | the subject compared with a literal: `<`, `<=`, `>`, `>=`, `!==` | `@case >= 90` | done |
| Object | an object (not `null`) with each key, its value matching the key's pattern | `@case { status, index: number }` | done |
| Bound name | anything, bound to that name in the branch and in the case's guard | `status`, `m` | done |
| Type | a value of that `typeof` (`object` excludes `null`) | `number`, `string` | done |
| Nested object | an object pattern inside a field | `@case { user: { role: "admin" } }` | done |

A key must exist for its pattern to match, so `{ status }` fails on `{}`, and
passes on `{ status: undefined }`. `undefined` is a value, not a type.

## Lists in templates (rules for `@map`)

These rules hold for any list a template reads, and the `@map` block above follows them.

1. **A list is a value and is never mutated.** A change is a new list, set on
   its signal (`todos.set([...todos(), next])`). Changing a list in place
   (`push`, `splice`, `sort`) does not notify anything, because the signal still
   holds the same array, so the author gets stale rows. The framework cannot
   stop mutation in JavaScript. Mutating an item in place and setting the list
   again is the same bug: the item is the same reference, so its row is not
   updated. A dev-mode check for both is planned, not built.
2. **Equality is `===`.** A row's item changed when it is a different reference.
   Objects are not compared by content. An author who rebuilds equal objects
   causes their rows to update, which costs binding work but not wrong output.
3. **`track` decides identity, and defaults to the index.** `track` names what
   makes a row the same row across two lists. The default is the index. The
   author can write a value (`track item.id`), or the names of fields
   (`track { id, kind }`), which match when each named field is `===`. Because
   the list is immutable, a row at a position shows the current item at that
   position, so the default is safe for rows that hold no state of their own.
4. **Rows with state name their identity.** When a row holds state (a component
   with its own signals, a text field), or the list is reordered, the author
   writes `track`, so the view follows the item rather than its position.
5. **Identity decides which rows exist; content decides what changes.** The diff
   is a function of the previous and new identities: it says which rows to keep,
   move, create and remove. It does not decide content. The names an item binds
   are signals updated for every kept row, and a row's bindings notify only when
   the value is a different reference (rule 2). So a same-length list with
   different content updates the rows that changed.
6. **Implicit variables start with `$`.** Each row has these, without declaring
   them: `$index`, `$first`, `$last`, `$even`, `$odd`, and `$count`, the length
   of the list. The `$` keeps them apart from the author's own names, so a field
   called `index` is never shadowed. The author cannot declare a `$`-prefixed
   name with `let`, including inside a destructuring pattern.
