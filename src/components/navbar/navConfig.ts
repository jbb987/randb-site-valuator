export interface NavItem {
  label: string;
  to: string;
  /** Additional paths that should mark this link as active */
  matchPaths?: string[];
}

export const navItems: NavItem[] = [
  { label: 'Tools', to: '/', matchPaths: ['/valuator'] },
];
