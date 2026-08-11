import { ResearchWorkspace } from '../../src/screens/research/ResearchWorkspace';

/**
 * 10 · tab route. Real from S1 — one screen with states, covering inventory
 * rows 10, 15, 16, 17, 86 and 87 rather than six near-identical shells.
 *
 * MOUNTS THE WORKSPACE RATHER THAN THE SEARCH SCREEN DIRECTLY — PD-15, 11 Aug
 * 2026. Below `size.researchTwoPane` the workspace renders `<SearchScreen />`
 * and nothing else, so on every phone and on this route's whole existing
 * history the behaviour is unchanged. At desktop width it draws the results
 * beside a reader.
 *
 * The route stays one route on purpose. A separate `/research` path would make
 * the desktop layout a place an advocate has to go to, and would split the
 * search history in two; this is the same surface at a different width, which
 * is what "responsive within the existing architecture" means.
 */
export default function Route() {
  return <ResearchWorkspace />;
}
