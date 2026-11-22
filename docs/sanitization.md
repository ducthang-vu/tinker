# Sanitization: the cases

Where a value from a template or a component can reach the DOM, and what happens to it.
Each case says what the code does today, how it was checked, and the rule proposed for it.
The trust wrappers are one family: `trustUrl` (see PR #168) and, proposed, `trustHtml` and
`trustStyle`, in the same style as Angular's `DomSanitizer`.

Today's only check is `runtime/url-safety.ts`: a fixed list of URL attributes must hold a
safe scheme, and event attributes (`on…`) are refused.

## Cases

### A. Attribute bindings: `[attr.name]` in a template, or `"[attr.name]"` in `host`

| # | Attribute | Example value | Today | Proposed rule |
|---|-----------|---------------|-------|---------------|
| A1 | `href`, `src`, `action`, `formaction`, `xlink:href`, `cite`, `poster` | `javascript:alert(1)` | Checked: removed when unsafe (verified: `formaction` is removed) | Keep. `TrustedUrl` bypasses it. |
| A2 | `background`, `codebase` | `javascript:alert(1)` | **Not checked**: set as written (verified) | Add to the URL kind. |
| A3 | `data` (on `<object>`) | `https://evil.example/x.swf` | **Not checked**: set as written (verified) | Add to the URL kind. |
| A4 | `srcset` | `javascript:alert(1) 1x` | **Not checked**: set as written (verified) | URL kind, one check per candidate. |
| A5 | `ping`, `icon`, `manifest`, `lowsrc`, `dynsrc`, `usemap`, `longdesc`, `classid`, `profile` | a URL | **Not checked** | Add to the URL kind (URLs or fragments only, per attribute). |
| A6 | `srcdoc` (on `<iframe>`) | `<script>…</script>` | **Not checked**: set as written (verified). Runs script in the frame. | Refuse the binding. Allow it only with `trustHtml`. |
| A7 | `style` | `background:url(https://evil.example/x)` | **Not checked**: set as written (verified). CSS can load URLs and leak data. | Refuse `[attr.style]`: the template should use `[style.x]`. |
| A8 | `on…` (`onclick`, …) | `alert(1)` | Refused when read (template and host) | Keep. |
| A9 | Any other attribute (`title`, `alt`, `aria-*`, `id`, `name`, `data-*`) | any text | Set as text | Allow. The value is text, not markup or a URL. |
| A10 | `xmlns`, `is`, `slot` | a name | Set as written | Decide: `xmlns` and `is` change how the element is built. Refuse them. |

### B. Style bindings: `[style.prop]`

| # | Property | Example value | Today | Proposed rule |
|---|----------|---------------|-------|---------------|
| B1 | `color`, `width`, … | `red` | Set with `setProperty` | Allow. |
| B2 | any property, value with `url(…)` | `url(https://evil.example/x)` | **Not checked**: set as written. Loads the URL. | Refuse `url(` in a value unless it is a `TrustedStyle`. |
| B3 | custom properties (`--x`) | `1px` | Set as written | Allow; the same `url(` rule applies. |
| B4 | the value is not a string (number, `null`) | `null` | Removed when empty | Allow. |

### C. Class bindings: `[class.name]`, `[class]="{ … }"`

| # | Case | Today | Proposed rule |
|---|------|-------|---------------|
| C1 | Class name from a boolean | A class is added or removed | Allow. Names are not markup. |
| C2 | Class name from text (`[class]="string"`) | Set as text | Allow. |

### D. Text

| # | Case | Today | Proposed rule |
|---|------|-------|---------------|
| D1 | `{{ value }}` | Set with `createTextNode`: never markup | Allow. Escaping is not needed. |
| D2 | `TrustedUrl` in `{{ }}` | Shows the URL as text | Allow. |

### E. Static markup written in the template

| # | Case | Today | Proposed rule |
|---|------|-------|---------------|
| E1 | `<a href="javascript:…">` written in the template string | Set as written | Not sanitized: the template is the author's code. Document it. Decide whether the compiler should warn. |
| E2 | `<iframe srcdoc="…">` written in the template string | Set as written | As E1. |

### F. Bindings that are not DOM writes

| # | Case | Today | Proposed rule |
|---|------|-------|---------------|
| F1 | `[src]="x"` on a component or directive that has an input named `src` | Passed to the input | Allow. The component decides; if it binds `[attr.src]` itself, A1 applies. |
| F2 | `(output)="…"` and `(click)="…"` | Calls a method | Allow. |

### G. Property bindings (not built yet)

Planned in `IMPROVEMENTS.md`, Templates item 1. Each needs its rule before it ships.

| # | Property | Proposed rule |
|---|----------|---------------|
| G1 | `innerHTML`, `outerHTML` | Only a `TrustedHtml`. Refuse anything else. |
| G2 | `src`, `href`, `action`, `formAction` (as DOM properties) | The URL check of A1, same as the attribute. |
| G3 | `value`, `checked`, `disabled`, `textContent` | Allow. These are not markup or URLs. |
| G4 | `on…` (as DOM properties) | Refuse, as A8. |

### H. Precompiled templates

| # | Case | Proposed rule |
|---|------|---------------|
| H1 | A compiled tree (`@tinker/core/compiler`) with the same bindings | The same rules as A–D. Test it: a precompiled template must not skip the check. |

### I. Router and framework-set attributes

| # | Case | Proposed rule |
|---|------|---------------|
| I1 | The router sets links or URLs | **To check**: read `packages/router` for any attribute it writes. |
| I2 | The framework's own scope attributes (`tk-cN`, `tk-hN`) | Internal. Not user input. |

### J. Developer mode (not built)

| # | Case | Proposed rule |
|---|------|---------------|
| J1 | A trusted value is set on an attribute | Warn, naming the element and attribute (`IMPROVEMENTS.md`, Developer mode). |

## Decisions taken

These are the defaults the code now follows. Change one by changing the rule in
`runtime/sanitization.ts` and its tests.

1. **One wrapper per kind:** `trustUrl`, `trustHtml`, `trustStyle`, each with its own class.
2. **`style` attribute:** removed unless it is a `TrustedStyle` (A7).
3. **`url(` in a style value:** removed unless it is a `TrustedStyle`. Also `image(`,
   `image-set(`, `src(`, `expression(`, and any backslash, since a CSS escape can spell
   one of them (B2).
4. **Static markup (E):** not checked, and not warned about. The template is the author's code.
5. **`xmlns` and `is`:** refused when the template or host metadata is read (A10).

## What is built

- URL attributes: the list in `url-safety.ts` covers every case in A1–A5. `srcset` and `ping`
  check each URL in the list.
- `srcdoc`, `style` (attribute), and style values with `url(` and the other forms in B2 are
  removed unless trusted: `runtime/sanitization.ts`.
- `xmlns` and `is` are refused where the template and host metadata are read (A10).
- Event attributes are refused as before (A8).
- Tests: `runtime/sanitization.test.ts`, `factories/url-attributes.test.ts`.

Not built yet: property bindings (G, which need their own rules when they exist), the
developer-mode warning for trusted values (J1), and the router check (I1).

