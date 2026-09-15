/**
 * The Doomee visual vocabulary.
 *
 * Only components with a caller in the next lots live here. MetricTile and
 * DeltaIndicator are specified but deliberately absent until the Results work
 * needs them (CLAUDE.md rule 8: a component at its third occurrence, not at
 * its first guess).
 */
export { Avatar, AvatarStack, initialsOf } from './avatar'
export { ConfirmDialog } from './confirm-dialog'
export { type Column, DataTable } from './data-table'
export { EmptyState } from './empty-state'
export { FilterBar, type FilterDescriptor, type FilterOption } from './filter-bar'
export { type LoopStageView, LoopStrip } from './loop-strip'
export { PageHeader } from './page-header'
export { ProgressRing } from './progress-ring'
export { SheetForm } from './sheet-form'
export { PriorityChip, type PriorityLevel, StatusBadge, type Tone } from './status-badge'
export { type TabDescriptor, Tabs } from './tabs'
export { Timeline, type TimelineEntry } from './timeline'
