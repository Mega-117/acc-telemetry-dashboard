---
description: Run TypeScript type checking and fix all type errors
---

# TypeScript Type Check & Fix

// turbo-all

## Steps

1. Run vue-tsc to find all type errors:
```
npx vue-tsc --noEmit 2>&1 | head -100
```

2. For each error found, classify it into one of these categories and apply the fix:

### Category A: `noUncheckedIndexedAccess` (array/object access returns undefined)
- **Pattern**: `arr[0]`, `arr[i]`, `obj[key]` → `T | undefined`  
- **Fix**: Add `?? fallback` or `if (!val) continue/return`
- **Examples**:
  - `str.split('.')[0]` → `str.split('.')[0] ?? str`
  - `const item = arr[i]` → add `if (!item) continue` after

### Category B: Wrong argument order in function calls
- **Pattern**: `string` not assignable to literal union like `'GT3' | 'GT4'`
- **Fix**: Check the function signature and add missing positional parameters
- **Example**: `getTrackBests(id, userId)` → `getTrackBests(id, 'GT3', userId)`

### Category C: String vs Literal Union
- **Pattern**: `string` not assignable to `'pilot' | 'coach' | 'admin'`
- **Fix**: Cast with `as`: `(value as 'pilot' | 'coach' | 'admin')`

### Category D: Duplicate imports
- **Pattern**: Import conflicts with local declaration
- **Fix**: Remove the import if a local function with same name exists

### Category E: Library callback signatures
- **Pattern**: callback parameter type doesn't match library definition
- **Fix**: Match the exact signature from the library types (e.g., Chart.js `value: string | number`)

3. After fixing, run vue-tsc again to verify:
```
npx vue-tsc --noEmit 2>&1 | head -100
```

4. Repeat until 0 errors.
