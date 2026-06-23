// Domain DTOs now live in @finby/shared (shared by web + mobile). Re-exported
// here so existing `@/lib/types` / `./types` import sites keep working whether
// they import the name as a type or (harmlessly) as a value.
export * from '@finby/shared';
