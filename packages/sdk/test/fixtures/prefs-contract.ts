import type { TommySdk } from '../../src/types';

declare const sdk: TommySdk;
type Layout = 'grid' | 'list';
// With no fallback, an unstored or unloaded pref reads as null.
const stored: Layout | null = sdk.prefs.get<Layout>('layout');
const unknownValue: unknown = sdk.prefs.get('layout');
// @ts-expect-error A pref read without a fallback may be null.
const notNull: Layout = sdk.prefs.get<Layout>('layout');
// With a fallback, the read is the stored value or that fallback.
const chosen: Layout = sdk.prefs.get<Layout>('layout', 'grid');
const inferred: number = sdk.prefs.get('columns', 3);
// An undefined fallback is no fallback: the read may still be null.
// @ts-expect-error The read may be null as well as undefined.
const undefinedFallback: Layout | undefined = sdk.prefs.get<Layout | undefined>('layout', undefined);
void [stored, unknownValue, notNull, chosen, inferred, undefinedFallback];
