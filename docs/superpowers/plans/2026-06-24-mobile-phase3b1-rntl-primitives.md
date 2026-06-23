# Mobile Phase 3b-1 — RNTL Setup + Native UI Primitives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up React Native component testing (jest-expo + @testing-library/react-native) and build the native UI primitives the auth screens need — Button, Input, Field, PasswordInput (+ strength meter), ScreenContainer, Toggle, Dropdown — styled with NativeWind + Phase-2 tokens, mirroring the web component contracts.

**Architecture:** Two test runners in the mobile app, cleanly separated by extension: **Vitest** keeps running `*.test.ts` (pure logic — adapters/session/store, node env), and **jest-expo** runs `*.test.tsx` (RN component tests via react-test-renderer; no simulator, runs on Linux). Primitives live in `apps/mobile/src/components/ui/` and use only NativeWind classNames + RN core components (no reanimated — it's disabled for Expo Go; Dropdown uses RN's built-in `Modal`). The pure password-strength logic moves to `@finby/shared` so web and mobile share it.

**Tech Stack:** Expo SDK 54 (RN 0.81, React 19.1.0), NativeWind 4.2, jest-expo + @testing-library/react-native + react-test-renderer, Vitest (logic). Screens/nav/biometric are Phase 3b-2.

## Global Constraints

- Node `>=20`; pnpm `10.28.1`. Use `expo install` for Expo/native + test deps so SDK-54-compatible versions are pinned.
- Commit messages: NO AI-attribution / "Generated with" boilerplate. One logical change per commit.
- TypeScript strict + `noUncheckedIndexedAccess`.
- React is pinned to `19.1.0` monorepo-wide (pnpm overrides). `react-test-renderer` MUST also be `19.1.0` (exact match with react, or RNTL throws "Incompatible React versions").
- NativeWind static styling only — do NOT import/use `react-native-reanimated`/`react-native-worklets` (disabled in `babel.config.js`; they crash Expo Go's Hermes). No `@gorhom/bottom-sheet` (it needs reanimated). Use RN core `Modal` for the Dropdown.
- Primitives use the Phase-2 color tokens (NativeWind classes like `bg-accent`, `text-ink`, `border-line`) — mirror `apps/web/src/components/ui/` contracts (prop names/behavior) so feature code ports cleanly.
- No native form controls — build accessible RN components (mirrors the web hard-rule intent).
- Verification here = `pnpm --filter finby-mobile test` (must run BOTH vitest + jest) + `pnpm --filter finby-mobile typecheck`. No simulator/`expo start`/EAS in this session.
- Whole-repo gate after changes: `@finby/core` + `finby-web` (300) + `finby-mobile` (vitest + jest) green; `pnpm lint` 0 errors.

## File Structure (created/modified)

```
packages/shared/src/password-strength.ts      # MOVED from web (pure logic)
apps/web/src/lib/password-strength.ts          # → re-export shim
apps/mobile/
  jest.config.js                               # jest-expo preset, testMatch *.test.tsx
  vitest.config.ts                             # MODIFIED: keep *.test.ts only (exclude tsx)
  package.json                                 # MODIFIED: test runs vitest + jest; devDeps
  src/components/ui/
    button.tsx + button.test.tsx
    input.tsx + input.test.tsx
    field.tsx + field.test.tsx
    password-input.tsx + password-input.test.tsx
    password-strength-meter.tsx + password-strength-meter.test.tsx
    screen-container.tsx
    toggle.tsx + toggle.test.tsx
    dropdown.tsx + dropdown.test.tsx
```

---

### Task 1: Move `password-strength` logic to `@finby/shared`

**Files:**
- Move (git mv): `apps/web/src/lib/password-strength.ts` → `packages/shared/src/password-strength.ts`
- Move (git mv): `apps/web/src/lib/password-strength.test.ts` → `packages/shared/src/password-strength.test.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/web/src/lib/password-strength.ts` (re-export shim)
- Note: `@finby/shared` has no test runner yet; add a minimal Vitest config so the moved test runs there. (Mirror `@finby/core`'s `vitest.config.ts`.)

**Interfaces:**
- Produces (from `@finby/shared`): `type PasswordScore = 0|1|2|3`, `interface PasswordStrengthResult { score; label }`, `function passwordStrength(password: string): PasswordStrengthResult`.

- [ ] **Step 1: Add a Vitest config + test script to `@finby/shared`**

Create `packages/shared/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```
Add to `packages/shared/package.json` scripts: `"test": "vitest run"`, and devDependency `"vitest": "^2.1.8"`. Run `pnpm install`.

- [ ] **Step 2: Move the test, run it to confirm it fails (impl not moved yet)**

Run: `git mv apps/web/src/lib/password-strength.test.ts packages/shared/src/password-strength.test.ts`
The moved test imports `from './password-strength'` — valid once the impl moves. Run `pnpm --filter @finby/shared test` → FAIL (`Cannot find module './password-strength'`).

- [ ] **Step 3: Move the implementation**

Run: `git mv apps/web/src/lib/password-strength.ts packages/shared/src/password-strength.ts`
The content is already pure (no platform imports). No edit needed.

- [ ] **Step 4: Export from shared; run shared test**

Add to `packages/shared/src/index.ts`:
```ts
export * from './password-strength';
```
Run: `pnpm --filter @finby/shared test` → PASS.

- [ ] **Step 5: Recreate the web shim + rebuild shared**

Create `apps/web/src/lib/password-strength.ts`:
```ts
export { passwordStrength } from '@finby/shared';
export type { PasswordScore, PasswordStrengthResult } from '@finby/shared';
```
Run: `pnpm --filter @finby/shared build && pnpm --filter finby-web typecheck && pnpm --filter finby-web test`
Expected: all PASS (web's `password-strength` consumers + `PasswordStrength` component still resolve via the shim).

- [ ] **Step 6: Commit**

```bash
git add packages/shared apps/web/src/lib/password-strength.ts pnpm-lock.yaml
git commit -m "refactor(shared): move password-strength logic into @finby/shared"
```

---

### Task 2: Set up jest-expo + React Native Testing Library

**Files:**
- Create: `apps/mobile/jest.config.js`, `apps/mobile/jest-setup.ts`
- Modify: `apps/mobile/vitest.config.ts`, `apps/mobile/package.json`
- Create: `apps/mobile/src/components/ui/__smoke__.test.tsx`

**Interfaces:**
- Produces: `pnpm --filter finby-mobile test` runs Vitest (`*.test.ts`) then Jest (`*.test.tsx`); component tests render RN components via react-test-renderer.

- [ ] **Step 1: Install test deps (SDK-54-pinned where applicable)**

Run:
```bash
pnpm --filter finby-mobile add -D jest jest-expo @testing-library/react-native react-test-renderer@19.1.0 @types/react-test-renderer@19.1.0
pnpm install
```
> RNTL v13 ships its own Jest matchers and auto-cleanup — `@testing-library/jest-native` is deprecated and NOT needed (our tests use `.toBeTruthy()`/`.props`/`jest.fn()`, no jest-native matchers).
> `react-test-renderer` MUST be `19.1.0` (exact match with the pinned `react@19.1.0`). If pnpm resolves a different version, add it to the root `pnpm.overrides` (`"react-test-renderer": "19.1.0"`) and reinstall.

- [ ] **Step 2: Restrict Vitest to `*.test.ts` (so it doesn't pick up component `.test.tsx`)**

In `apps/mobile/vitest.config.ts`, change `include` to exclude tsx:
```ts
    include: ['src/**/*.test.ts'],
    exclude: ['**/*.test.tsx', '**/node_modules/**'],
```

- [ ] **Step 3: Create the Jest config**

`apps/mobile/jest.config.js` (rely on the `jest-expo` preset's `transformIgnorePatterns` — it already allowlists react-native/@react-native/expo/react-navigation etc. that expo-router needs; do NOT override it wholesale):
```js
/** Component tests only (*.test.tsx) via jest-expo + RNTL. Pure-logic *.test.ts
 *  stays on Vitest. The two never overlap (testMatch vs Vitest include). */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
```
> If a component test later throws `SyntaxError: Unexpected token 'export'` from an ESM dep (most likely `nativewind` or `react-native-css-interop`), the preset's `transformIgnorePatterns` needs that package allowlisted. Extend it by spreading the preset's value, e.g.:
> ```js
> const expoPreset = require('jest-expo/jest-preset');
> module.exports = { ...expoPreset, testMatch: ['<rootDir>/src/**/*.test.tsx'], moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
>   transformIgnorePatterns: [ 'node_modules/(?!(' + ['react-native','@react-native','expo','@expo','expo-router','@react-navigation','nativewind','react-native-css-interop','@finby'].join('|') + ')/)' ] };
> ```
> Only add this if the default actually fails — confirm with Step 7's smoke run and Task 3's first NativeWind component.

- [ ] **Step 4: Wire the `test` script to run both runners**

In `apps/mobile/package.json` scripts, change `test` and add `test:logic`/`test:components`:
```json
    "test": "vitest run && jest",
    "test:logic": "vitest run",
    "test:components": "jest",
```

- [ ] **Step 5: Write a smoke component test**

`apps/mobile/src/components/ui/__smoke__.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

describe('RNTL smoke', () => {
  it('renders a Text node', () => {
    render(<Text>hello</Text>);
    expect(screen.getByText('hello')).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run both runners**

Run: `pnpm --filter @finby/core build && pnpm --filter @finby/shared build && pnpm --filter finby-mobile test`
Expected: Vitest passes the existing `*.test.ts` (28); Jest runs the smoke `.test.tsx` and shows `1 passed`. If Jest errors transforming a package, extend `transformIgnorePatterns` per Step 3's note and re-run (report which package if it's not one already listed).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/jest.config.js apps/mobile/vitest.config.ts apps/mobile/package.json apps/mobile/src/components/ui/__smoke__.test.tsx pnpm-lock.yaml
git commit -m "test(mobile): add jest-expo + RNTL for component tests (vitest keeps logic)"
```

---

### Task 3: `Button` primitive (RNTL exemplar)

**Files:**
- Create: `apps/mobile/src/components/ui/button.tsx`, `apps/mobile/src/components/ui/button.test.tsx`

**Interfaces:**
- Produces: `Button` — `props: { variant?: 'primary' | 'ghost'; loading?: boolean; disabled?: boolean; onPress?: () => void; children: ReactNode } & Pick<PressableProps, 'accessibilityLabel' | 'testID'>`. Disabled when `disabled || loading`; shows an `ActivityIndicator` when loading; `accessibilityState.busy` reflects loading.

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/components/ui/button.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Button } from './button';

describe('Button', () => {
  it('renders its label and fires onPress', () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress}>Sign in</Button>);
    fireEvent.press(screen.getByText('Sign in'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress} disabled>Sign in</Button>);
    fireEvent.press(screen.getByText('Sign in'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not fire onPress and is busy when loading', () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress} loading testID="btn">Sign in</Button>);
    fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('btn').props.accessibilityState.busy).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test:components`
Expected: FAIL — `Cannot find module './button'`.

- [ ] **Step 3: Implement**

`apps/mobile/src/components/ui/button.tsx`:
```tsx
import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, type PressableProps, Text, View } from 'react-native';

interface ButtonProps extends Pick<PressableProps, 'accessibilityLabel' | 'testID'> {
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  children: ReactNode;
}

const VARIANT = {
  primary: 'bg-accent',
  ghost: 'border border-line bg-surface',
} as const;

const TEXT_VARIANT = {
  primary: 'text-white',
  ghost: 'text-ink',
} as const;

export function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  onPress,
  children,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
      className={`min-h-12 flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 ${VARIANT[variant]} ${isDisabled ? 'opacity-60' : ''}`}
    >
      {loading && <ActivityIndicator color={variant === 'primary' ? '#fff' : '#e8eef7'} />}
      <View className={loading ? 'opacity-0' : ''}>
        {typeof children === 'string' ? (
          <Text className={`text-base font-medium ${TEXT_VARIANT[variant]}`}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile test:components`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter finby-mobile typecheck`
```bash
git add apps/mobile/src/components/ui/button.tsx apps/mobile/src/components/ui/button.test.tsx
git commit -m "feat(mobile): Button primitive"
```

---

### Task 4: `Input` + `Field` primitives

**Files:**
- Create: `apps/mobile/src/components/ui/input.tsx`, `input.test.tsx`, `field.tsx`, `field.test.tsx`

**Interfaces:**
- Produces:
  - `Input` — `props: TextInputProps & { invalid?: boolean }`; forwards all `TextInput` props; red border when `invalid`.
  - `Field` — `props: { label: string; error?: string; hint?: string; children: ReactNode }`; renders label, children, and error (or hint) text.

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/components/ui/input.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Input } from './input';

describe('Input', () => {
  it('renders value and fires onChangeText', () => {
    const onChangeText = jest.fn();
    render(<Input testID="email" value="a@b.com" onChangeText={onChangeText} />);
    expect(screen.getByTestId('email').props.value).toBe('a@b.com');
    fireEvent.changeText(screen.getByTestId('email'), 'c@d.com');
    expect(onChangeText).toHaveBeenCalledWith('c@d.com');
  });
});
```
`apps/mobile/src/components/ui/field.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Field } from './field';

describe('Field', () => {
  it('renders the label and children', () => {
    render(<Field label="Email"><Text>child</Text></Field>);
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('child')).toBeTruthy();
  });
  it('shows the error when present (over the hint)', () => {
    render(<Field label="Email" error="Required" hint="we never share it"><Text>x</Text></Field>);
    expect(screen.getByText('Required')).toBeTruthy();
    expect(screen.queryByText('we never share it')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter finby-mobile test:components`
Expected: FAIL — modules `./input` / `./field` not found.

- [ ] **Step 3: Implement `Input`**

`apps/mobile/src/components/ui/input.tsx`:
```tsx
import { forwardRef } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  invalid?: boolean;
}

export const Input = forwardRef<TextInput, InputProps>(function Input({ invalid = false, ...rest }, ref) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor="#5b6f8c"
      className={`min-h-12 w-full rounded-xl border bg-canvas/60 px-3.5 py-3 text-base text-ink ${invalid ? 'border-danger' : 'border-line'}`}
      {...rest}
    />
  );
});
```

- [ ] **Step 4: Implement `Field`**

`apps/mobile/src/components/ui/field.tsx`:
```tsx
import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, error, hint, children }: FieldProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-medium uppercase tracking-wide text-muted">{label}</Text>
      {children}
      {error ? (
        <Text className="text-xs text-danger">{error}</Text>
      ) : hint ? (
        <Text className="text-xs text-faint">{hint}</Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass; typecheck; commit**

Run: `pnpm --filter finby-mobile test:components && pnpm --filter finby-mobile typecheck`
```bash
git add apps/mobile/src/components/ui/input.tsx apps/mobile/src/components/ui/input.test.tsx apps/mobile/src/components/ui/field.tsx apps/mobile/src/components/ui/field.test.tsx
git commit -m "feat(mobile): Input + Field primitives"
```

---

### Task 5: `PasswordInput` + `PasswordStrengthMeter`

**Files:**
- Create: `apps/mobile/src/components/ui/password-input.tsx`, `password-input.test.tsx`, `password-strength-meter.tsx`, `password-strength-meter.test.tsx`

**Interfaces:**
- Consumes: `passwordStrength` from `@finby/shared` (Task 1).
- Produces:
  - `PasswordInput` — `props: TextInputProps & { invalid?: boolean }`; secure entry with a show/hide toggle (`accessibilityLabel` "Show password"/"Hide password").
  - `PasswordStrengthMeter` — `props: { password: string }`; renders nothing when empty, else the strength label; uses `passwordStrength`.

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/components/ui/password-input.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PasswordInput } from './password-input';

describe('PasswordInput', () => {
  it('starts secure and toggles visibility', () => {
    render(<PasswordInput testID="pw" value="secret" onChangeText={() => {}} />);
    expect(screen.getByTestId('pw').props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByLabelText('Show password'));
    expect(screen.getByTestId('pw').props.secureTextEntry).toBe(false);
    fireEvent.press(screen.getByLabelText('Hide password'));
    expect(screen.getByTestId('pw').props.secureTextEntry).toBe(true);
  });
});
```
`apps/mobile/src/components/ui/password-strength-meter.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native';
import { PasswordStrengthMeter } from './password-strength-meter';

describe('PasswordStrengthMeter', () => {
  it('renders nothing for an empty password', () => {
    render(<PasswordStrengthMeter password="" />);
    expect(screen.queryByText(/Weak|So-so|Strong/)).toBeNull();
  });
  it('shows Strong for a long varied password', () => {
    render(<PasswordStrengthMeter password="Abcd1234efgh!" />);
    expect(screen.getByText('Strong')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter finby-mobile test:components`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `PasswordInput`**

`apps/mobile/src/components/ui/password-input.tsx`:
```tsx
import { forwardRef, useState } from 'react';
import { Pressable, Text, TextInput, type TextInputProps, View } from 'react-native';

interface PasswordInputProps extends TextInputProps {
  invalid?: boolean;
}

export const PasswordInput = forwardRef<TextInput, PasswordInputProps>(function PasswordInput(
  { invalid = false, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <View
      className={`min-h-12 w-full flex-row items-center rounded-xl border bg-canvas/60 px-3.5 ${invalid ? 'border-danger' : 'border-line'}`}
    >
      <TextInput
        ref={ref}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor="#5b6f8c"
        className="flex-1 py-3 text-base text-ink"
        {...rest}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        hitSlop={8}
      >
        <Text className="text-xs font-medium text-accent">{visible ? 'Hide' : 'Show'}</Text>
      </Pressable>
    </View>
  );
});
```

- [ ] **Step 4: Implement `PasswordStrengthMeter`**

`apps/mobile/src/components/ui/password-strength-meter.tsx`:
```tsx
import { Text, View } from 'react-native';
import { passwordStrength } from '@finby/shared';

const BAR_COLOR = ['', 'bg-danger', 'bg-warn', 'bg-success'] as const;

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  if (score === 0) return null;
  return (
    <View className="mt-1.5 gap-1" accessibilityLabel={`Password strength: ${label}`}>
      <View className="h-1 flex-row gap-1">
        {[1, 2, 3].map((i) => (
          <View key={i} className={`h-1 flex-1 rounded-full ${i <= score ? BAR_COLOR[score] : 'bg-line'}`} />
        ))}
      </View>
      <Text className="text-xs text-faint">{label}</Text>
    </View>
  );
}
```

- [ ] **Step 5: Run tests; typecheck; commit**

Run: `pnpm --filter @finby/shared build && pnpm --filter finby-mobile test:components && pnpm --filter finby-mobile typecheck`
```bash
git add apps/mobile/src/components/ui/password-input.tsx apps/mobile/src/components/ui/password-input.test.tsx apps/mobile/src/components/ui/password-strength-meter.tsx apps/mobile/src/components/ui/password-strength-meter.test.tsx
git commit -m "feat(mobile): PasswordInput + PasswordStrengthMeter (shared strength logic)"
```

---

### Task 6: `ScreenContainer` + `Toggle`

**Files:**
- Create: `apps/mobile/src/components/ui/screen-container.tsx`, `toggle.tsx`, `toggle.test.tsx`

**Interfaces:**
- Produces:
  - `ScreenContainer` — `props: { children: ReactNode }`; safe-area + keyboard-avoiding scroll wrapper over the canvas background. (Uses `react-native-safe-area-context` `SafeAreaView` — installed in Phase 2 — plus RN `KeyboardAvoidingView` + `ScrollView`.) No test (layout-only; verified on device).
  - `Toggle` — `props: { value: boolean; onValueChange: (v: boolean) => void; accessibilityLabel?: string }`; thin wrapper over RN `Switch` with the accent track color.

- [ ] **Step 1: Write the failing `Toggle` test**

`apps/mobile/src/components/ui/toggle.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Toggle } from './toggle';

describe('Toggle', () => {
  it('reflects value and fires onValueChange', () => {
    const onValueChange = jest.fn();
    render(<Toggle value={false} onValueChange={onValueChange} accessibilityLabel="Biometric lock" />);
    const sw = screen.getByLabelText('Biometric lock');
    expect(sw.props.value).toBe(false);
    fireEvent(sw, 'valueChange', true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test:components`
Expected: FAIL — `./toggle` not found.

- [ ] **Step 3: Implement `Toggle`**

`apps/mobile/src/components/ui/toggle.tsx`:
```tsx
import { Switch } from 'react-native';

interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel?: string;
}

export function Toggle({ value, onValueChange, accessibilityLabel }: ToggleProps) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ false: '#1c2c46', true: '#1d6ef5' }}
      thumbColor="#e8eef7"
    />
  );
}
```

- [ ] **Step 4: Implement `ScreenContainer`**

`apps/mobile/src/components/ui/screen-container.tsx`:
```tsx
import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function ScreenContainer({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="grow justify-center gap-5 px-6 py-8"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 5: Run test; typecheck; commit**

Run: `pnpm --filter finby-mobile test:components && pnpm --filter finby-mobile typecheck`
Expected: PASS. (typecheck also covers `screen-container.tsx`; `contentContainerClassName` is supported by NativeWind v4.)
```bash
git add apps/mobile/src/components/ui/screen-container.tsx apps/mobile/src/components/ui/toggle.tsx apps/mobile/src/components/ui/toggle.test.tsx
git commit -m "feat(mobile): ScreenContainer + Toggle primitives"
```

---

### Task 7: `Dropdown` (Modal-based single-select)

**Files:**
- Create: `apps/mobile/src/components/ui/dropdown.tsx`, `dropdown.test.tsx`

**Interfaces:**
- Produces: `Dropdown<T extends string>` — `props: { value: T | null; options: { value: T; label: string }[]; onSelect: (value: T) => void; placeholder?: string; accessibilityLabel?: string }`. A trigger Pressable showing the selected label (or placeholder); tapping opens an RN `Modal` listing options; selecting one calls `onSelect` and closes. No reanimated / no `@gorhom/bottom-sheet`.

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/components/ui/dropdown.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Dropdown } from './dropdown';

const OPTS = [
  { value: 'USD', label: 'US Dollar' },
  { value: 'NGN', label: 'Nigerian Naira' },
];

describe('Dropdown', () => {
  it('shows the placeholder when nothing is selected', () => {
    render(<Dropdown value={null} options={OPTS} onSelect={() => {}} placeholder="Select currency" accessibilityLabel="currency" />);
    expect(screen.getByText('Select currency')).toBeTruthy();
  });

  it('opens, lists options, and selects one', () => {
    const onSelect = jest.fn();
    render(<Dropdown value={null} options={OPTS} onSelect={onSelect} placeholder="Select currency" accessibilityLabel="currency" />);
    fireEvent.press(screen.getByLabelText('currency'));
    fireEvent.press(screen.getByText('Nigerian Naira'));
    expect(onSelect).toHaveBeenCalledWith('NGN');
  });

  it('shows the selected option label', () => {
    render(<Dropdown value="USD" options={OPTS} onSelect={() => {}} placeholder="Select currency" accessibilityLabel="currency" />);
    expect(screen.getByText('US Dollar')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter finby-mobile test:components`
Expected: FAIL — `./dropdown` not found.

- [ ] **Step 3: Implement**

`apps/mobile/src/components/ui/dropdown.tsx`:
```tsx
import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface DropdownProps<T extends string> {
  value: T | null;
  options: Option<T>[];
  onSelect: (value: T) => void;
  placeholder?: string;
  accessibilityLabel?: string;
}

export function Dropdown<T extends string>({
  value,
  options,
  onSelect,
  placeholder = 'Select…',
  accessibilityLabel,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className="min-h-12 flex-row items-center justify-between rounded-xl border border-line bg-canvas/60 px-3.5 py-3"
      >
        <Text className={`text-base ${selected ? 'text-ink' : 'text-faint'}`}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text className="text-faint">▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setOpen(false)}>
          <Pressable className="max-h-96 rounded-t-2xl border-t border-line bg-surface px-2 py-3">
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onSelect(item.value);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  className="rounded-xl px-4 py-3"
                >
                  <Text className={`text-base ${item.value === value ? 'text-accent' : 'text-ink'}`}>
                    {item.label}
                  </Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
```
> RNTL renders `Modal` children even when `visible` initially false in some RN versions; the test opens it first via the trigger press, so `getByText` for options resolves after opening. If a test can't find an option before opening, that's expected — only assert option presence after the trigger press (the test does this).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter finby-mobile test:components`
Expected: PASS.

- [ ] **Step 5: Typecheck + full gate + commit**

Run: `pnpm --filter finby-mobile typecheck && pnpm --filter finby-mobile test && pnpm lint`
Expected: vitest (28) + jest (all component tests) pass; lint 0 errors.
```bash
git add apps/mobile/src/components/ui/dropdown.tsx apps/mobile/src/components/ui/dropdown.test.tsx
git commit -m "feat(mobile): Dropdown primitive (Modal-based single-select)"
```

---

## Phase 3b-1 Done — What Exists After This Plan

- Mobile component testing via jest-expo + RNTL (`*.test.tsx`), Vitest still owns `*.test.ts` logic — both run by `pnpm --filter finby-mobile test`.
- `password-strength` logic shared via `@finby/shared` (web shim unchanged behavior).
- Native UI primitives: Button, Input, Field, PasswordInput, PasswordStrengthMeter, ScreenContainer, Toggle, Dropdown — RNTL-tested (except layout-only ScreenContainer), NativeWind-styled, no reanimated.

## Deferred to Phase 3b-2

- Auth screens (Login/Register/Onboarding/Forgot-Password) composed from these primitives.
- expo-router `(auth)`/`(app)` route groups + navigation gate + composition-root `useAuthStore` bound to the real session.
- Cold-start session restore (`hydrate` + identity persistence; confirm `/auth/me` shape from `apps/api`).
- Biometric adapter + `BiometricGate` + lock state wired to the `Toggle`.

## Open Items for 3b-2 Planning

- Read the `apps/api` `/auth/me` handler for the exact response shape (the web store treats it as `{ user }`).
- On-device validation of the primitives + screens (run `expo start`); biometric resume-lock best validated in a dev build.
