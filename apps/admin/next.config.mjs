/**
 * `externalDir` lets the admin import `apps/mobile/src/theme/tokens.ts` and the
 * screen manifest directly, rather than keeping a copy.
 *
 * That is the whole point: the admin consumes the SAME tokens file as the app.
 * No admin-only hex, no second palette, no second type scale. Density may
 * differ; values may not. A copied token file is a second palette that agrees
 * with the first until the day someone edits one of them.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { externalDir: true },
};

export default nextConfig;
