## Public API

**Added**
- List every new exported name, with its package. Write "None" if there are none.

**Removed**
- List every exported name that was removed or renamed. Write "None" if there are none.

**Changed**
- List exported names whose type or behaviour changed. Write "None" if there are none.

## Summary

<!-- What the change does, and why. -->

## Not included

<!-- What this PR deliberately leaves out, and where it will come from. Write "None" if nothing. -->

## Checks

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run coverage` (100% lines and branches)

The repo maps and the generated API reference are regenerated if exports changed.
