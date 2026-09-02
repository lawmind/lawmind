/**
 * THE PRODUCTION iOS BUILD IMAGE, AND WHY IT IS PINNED RATHER THAN LEFT ALONE.
 *
 * `eas.json`'s `build.production` carried no `ios.image` at all until this
 * round. An unset image resolves to EAS's default for the project's SDK, which
 * MOVES: the same commit, built two months apart, gets two different Xcode
 * versions. That is fine until the day Apple's minimum SDK changes and a
 * release build silently comes back on a toolchain the App Store now refuses —
 * a failure that arrives at submission, weeks after the commit that caused it.
 *
 * Apple currently requires the iOS 26 SDK, which means Xcode 26. The image
 * pinned in `eas.json` is `macos-tahoe-26.5-xcode-26.6`.
 *
 * PROVENANCE, STATED HONESTLY: that image name comes from the round brief's
 * measurement of Expo's published build-image list for `sdk-57`/`latest`. It
 * was NOT re-verified against Expo's infrastructure at this commit — `eas-cli`
 * is not installed in this workspace and this lane has no cloud network. If the
 * tag is ever wrong, the build fails at queue time with an unknown-image error,
 * which is loud; the failure mode this file exists to prevent — a silent
 * downgrade — is the quiet one.
 *
 * THE GUARD IS A FLOOR, NOT AN EQUALITY. `assertProductionIosImage` does not
 * demand one exact string, because that would have to be edited every time the
 * image is legitimately bumped, and a check that must be edited to pass is a
 * check people edit without reading. It demands three properties instead:
 *
 *   1. an image is set at all on the production profile;
 *   2. it is PINNED — `latest`, `default` and any `-latest` suffix are floating
 *      tags and are refused, because a floating tag is the unset case wearing a
 *      value;
 *   3. its Xcode version is at least {@link MIN_PRODUCTION_XCODE}, the Apple
 *      iOS 26 SDK floor.
 *
 * Raising the floor is a deliberate edit to one constant here. Regressing below
 * it is impossible without failing a test.
 *
 * WHAT THIS IS NOT. A pinned image is configuration. It is not evidence that a
 * production build succeeds on that toolchain — no production build has been
 * run. `APPLE_PRODUCTION_BUILD_PROOF` stays PENDING until one has.
 */

/** The Apple iOS 26 SDK floor, expressed as the Xcode major that carries it. */
export const MIN_PRODUCTION_XCODE = { major: 26, minor: 0 } as const;

/** Tags that name a moving target rather than a build. */
const FLOATING = new Set(['latest', 'default', 'macos-latest', 'stable']);

export type BuildImage = {
  /** e.g. `tahoe` */
  readonly os: string;
  /** e.g. `26.5` */
  readonly osVersion: string;
  readonly xcode: { readonly major: number; readonly minor: number };
};

/**
 * `macos-tahoe-26.5-xcode-26.6` → its parts. Returns null for anything that is
 * not a fully pinned macOS image — including a floating tag, which is the point.
 */
export function parseBuildImage(image: string): BuildImage | null {
  const trimmed = image.trim();
  if (FLOATING.has(trimmed.toLowerCase())) return null;
  const m = /^macos-([a-z]+)-(\d+(?:\.\d+)*)-xcode-(\d+)(?:\.(\d+))?$/i.exec(trimmed);
  const [, os, osVersion, major, minor] = m ?? [];
  if (os === undefined || osVersion === undefined || major === undefined) return null;
  return {
    os: os.toLowerCase(),
    osVersion,
    xcode: { major: Number(major), minor: minor === undefined ? 0 : Number(minor) },
  };
}

/** True when `xcode` is at or above the floor. Major first, then minor. */
export function meetsXcodeFloor(
  xcode: { major: number; minor: number },
  floor: { major: number; minor: number } = MIN_PRODUCTION_XCODE,
): boolean {
  if (xcode.major !== floor.major) return xcode.major > floor.major;
  return xcode.minor >= floor.minor;
}

/** The shape of `eas.json` this guard reads. Everything else is ignored. */
export type EasJson = {
  build?: Record<string, { ios?: { image?: string; simulator?: boolean } } | undefined>;
};

/**
 * Every reason the production profile's iOS toolchain is unacceptable, as
 * sentences. Empty array = acceptable. Returning all of them rather than
 * throwing on the first keeps a failure legible when two things are wrong.
 */
export function productionIosImageViolations(eas: EasJson): string[] {
  const profile = eas.build?.production;
  if (!profile) return ['eas.json has no `build.production` profile.'];

  const image = profile.ios?.image;
  if (image === undefined || image === null || image.trim() === '') {
    return [
      'build.production.ios.image is not set. An unset image floats with EAS defaults, ' +
        `so a release build can silently drop below Xcode ${MIN_PRODUCTION_XCODE.major}.`,
    ];
  }

  const parsed = parseBuildImage(image);
  if (parsed === null) {
    return [
      `build.production.ios.image is "${image}", which is not a pinned macOS image ` +
        '(expected `macos-<name>-<version>-xcode-<version>`). A floating tag is the unset ' +
        'case wearing a value.',
    ];
  }

  if (!meetsXcodeFloor(parsed.xcode)) {
    return [
      `build.production.ios.image pins Xcode ${parsed.xcode.major}.${parsed.xcode.minor}, ` +
        `below the required floor of ${MIN_PRODUCTION_XCODE.major}.${MIN_PRODUCTION_XCODE.minor}. ` +
        'Apple requires the iOS 26 SDK for App Store submission.',
    ];
  }

  return [];
}
