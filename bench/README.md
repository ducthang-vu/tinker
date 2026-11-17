# List benchmark

A 1,000-row list, built two ways: with the framework (`@map` over a signal, keyed by `track`) and in plain DOM. Each is run through the same three operations:

- **create**: the list is set from empty
- **update**: every tenth row gets a new label
- **reverse**: the list is reversed

## Run

```bash
npx vite bench --config vite.config.ts --port 5300 --strictPort &
node bench/run.cjs
```

The script prints the median time of five runs, and the number of DOM nodes added or removed.

## Reading the numbers

- Headless Chromium on one machine: use the numbers to compare changes, not as absolute speeds.
- The plain version is deliberately simple: `replaceChildren` on every change. It is a baseline, not the fastest possible DOM code.
