import easJson from '../../eas.json';
import {
  MIN_PRODUCTION_XCODE,
  meetsXcodeFloor,
  parseBuildImage,
  productionIosImageViolations,
} from './easBuildImage';
import type { EasJson } from './easBuildImage';

/**
 * THE PRODUCTION iOS TOOLCHAIN CANNOT SILENTLY REGRESS.
 *
 * This suite reads the REAL `eas.json` off disk rather than a fixture. A guard
 * written against a fixture proves the parser works and proves nothing about
 * the file that is actually shipped — the same mistake as an audit that skips
 * the file it exists to police.
 *
 * It asserts a FLOOR, not an equality, so a legitimate image bump passes and a
 * downgrade, a deletion, or a swap to a floating tag all fail. See the module
 * note in `easBuildImage.ts` for why each of those three is the same failure.
 */

/**
 * The REAL `eas.json`, imported rather than fixtured — a guard written against a
 * fixture proves the parser works and proves nothing about the file that ships.
 *
 * `as unknown as EasJson` is load-bearing: without it TypeScript narrows the
 * import to the exact literals currently in the file, every assertion below
 * becomes statically true, and deleting the pin would surface as a type error in
 * this file instead of as a failing test. The widened type keeps the failure
 * where it is legible.
 */
const eas = easJson as unknown as EasJson;

describe('eas.json production iOS build image', () => {
  it('is pinned, and at or above the Apple iOS 26 SDK floor', () => {
    expect(productionIosImageViolations(eas)).toEqual([]);
  });

  it('names an image at all — an unset one floats with EAS defaults', () => {
    const image = eas.build?.production?.ios?.image;
    expect(typeof image).toBe('string');
    expect((image ?? '').trim()).not.toBe('');
  });

  it('is a fully pinned macOS image, never a moving tag', () => {
    const parsed = parseBuildImage(eas.build!.production!.ios!.image!);
    expect(parsed).not.toBeNull();
    expect(parsed!.xcode.major).toBeGreaterThanOrEqual(MIN_PRODUCTION_XCODE.major);
  });

  /**
   * The staging and preview profiles build iOS SIMULATOR artefacts, which never
   * reach the App Store. Pinning them would be config for its own sake. This
   * asserts the distinction is real rather than assumed — if either ever stops
   * being a simulator build it becomes a submittable binary and this test says
   * so, at which point it needs a pin too.
   */
  it('leaves the simulator profiles unpinned, and they are still simulator profiles', () => {
    for (const name of ['staging', 'preview'] as const) {
      expect(eas.build?.[name]?.ios?.simulator).toBe(true);
      expect(eas.build?.[name]?.ios?.image).toBeUndefined();
    }
  });
});

describe('the guard itself', () => {
  const withImage = (image?: string): EasJson => ({
    build: { production: image === undefined ? {} : { ios: { image } } },
  });

  it('refuses an absent image', () => {
    expect(productionIosImageViolations(withImage())).toHaveLength(1);
    expect(productionIosImageViolations(withImage())[0]).toMatch(/not set/);
  });

  it('refuses a floating tag, which is the unset case wearing a value', () => {
    for (const tag of ['latest', 'default', 'stable', 'macos-latest']) {
      expect(productionIosImageViolations(withImage(tag))).toHaveLength(1);
    }
  });

  it('refuses a downgrade below the Xcode floor', () => {
    const v = productionIosImageViolations(withImage('macos-sequoia-15.5-xcode-16.4'));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/below the required floor/);
  });

  it('accepts a legitimate future bump without needing an edit here', () => {
    expect(productionIosImageViolations(withImage('macos-tahoe-26.9-xcode-27.0'))).toEqual([]);
  });

  it('compares Xcode versions by major first, then minor', () => {
    expect(meetsXcodeFloor({ major: 26, minor: 0 })).toBe(true);
    expect(meetsXcodeFloor({ major: 26, minor: 6 })).toBe(true);
    expect(meetsXcodeFloor({ major: 27, minor: 0 })).toBe(true);
    expect(meetsXcodeFloor({ major: 25, minor: 9 })).toBe(false);
    // 26.10 is above 26.9 — string comparison would get this backwards.
    expect(meetsXcodeFloor({ major: 26, minor: 10 }, { major: 26, minor: 9 })).toBe(true);
  });

  it('parses the image this repo pins', () => {
    expect(parseBuildImage('macos-tahoe-26.5-xcode-26.6')).toEqual({
      os: 'tahoe',
      osVersion: '26.5',
      xcode: { major: 26, minor: 6 },
    });
  });
});
