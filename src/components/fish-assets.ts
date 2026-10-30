export const FISH_IMAGES = {
  guardian: 'assets/fish-guardian.png',
  create: 'assets/fish-create.png',
  unlock: 'assets/fish-unlock.png',
  recover: 'assets/fish-recover.png',
  change: 'assets/fish-change.png',
  reset: 'assets/fish-reset.png',
  continue: 'assets/fish-continue.png',
  lock: 'assets/fish-lock.png',
  save: 'assets/fish-save.png',
  delete: 'assets/fish-delete.png',
  cancel: 'assets/fish-cancel.png',
  add: 'assets/fish-add.png',
  sites: 'assets/fish-sites.png',
  backup: 'assets/fish-bg-thinking.png',
  clearSite: 'assets/fish-clear-site.png',
} as const

export const FISH_GUARDIAN_IMAGE = FISH_IMAGES.guardian

export type FishVariant = keyof typeof FISH_IMAGES

const ACTION_FISH_VARIANTS = new Set<FishVariant>([
  'create',
  'unlock',
  'recover',
  'change',
  'reset',
  'continue',
  'lock',
  'save',
  'delete',
  'cancel',
  'add',
  'sites',
  'backup',
  'clearSite',
])

export function isActionFishVariant(variant: FishVariant): boolean {
  return ACTION_FISH_VARIANTS.has(variant)
}
