import { create } from 'zustand';

/**
 * WHETHER THE COMMAND PALETTE IS OPEN — nothing else.
 *
 * A store rather than component state because the trigger (Cmd/Ctrl+K on
 * web, a tab-bar icon everywhere) lives in `app/_layout.tsx` and the tab
 * bar, and the palette itself is mounted once at the root — neither is an
 * ancestor of the other, so there is no single component to lift state into.
 */
type CommandPaletteState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export const useCommandPalette = create<CommandPaletteState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
