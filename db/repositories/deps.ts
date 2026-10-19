export interface RepoDeps {
  now: () => number;
  newId: () => string;
  /** Called after any write so UI queries can refresh. */
  notify: () => void;
}
