// Phase 020: OptionGroup is now a compatibility shim over the controls kit.
// Segmented preserves the full legacy contract (props, generics, classnames)
// and adds arrow-key navigation. New code should import from "./controls".
export { Segmented as OptionGroup } from "./controls/Segmented";
export type { SegmentedItem as OptionItem } from "./controls/Segmented";
