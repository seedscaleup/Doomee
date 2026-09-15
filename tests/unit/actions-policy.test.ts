import { describe, expect, it } from 'vitest'
import { mayEditAction } from '@/modules/actions/policy'

const ME = 'user-me'
const SOMEONE = 'user-else'

describe('who may change an action', () => {
  it('lets a manager change anything', () => {
    expect(
      mayEditAction(
        { userId: ME, canUpdateAny: true },
        { assigneeId: SOMEONE, createdBy: SOMEONE },
      ),
    ).toBe(true)
  })

  it('lets the assignee change their own', () => {
    expect(
      mayEditAction({ userId: ME, canUpdateAny: false }, { assigneeId: ME, createdBy: SOMEONE }),
    ).toBe(true)
  })

  it('lets whoever wrote it down change it', () => {
    expect(
      mayEditAction({ userId: ME, canUpdateAny: false }, { assigneeId: SOMEONE, createdBy: ME }),
    ).toBe(true)
  })

  it('lets a listed collaborator change it', () => {
    expect(
      mayEditAction(
        { userId: ME, canUpdateAny: false },
        { assigneeId: SOMEONE, createdBy: SOMEONE, collaboratorIds: [ME] },
      ),
    ).toBe(true)
  })

  it('refuses someone with no connection to it', () => {
    expect(
      mayEditAction(
        { userId: ME, canUpdateAny: false },
        { assigneeId: SOMEONE, createdBy: SOMEONE, collaboratorIds: [SOMEONE] },
      ),
    ).toBe(false)
  })

  it('refuses an unassigned, unauthored action to a plain collaborator', () => {
    // An action nobody owns is not everybody's to edit.
    expect(
      mayEditAction({ userId: ME, canUpdateAny: false }, { assigneeId: null, createdBy: null }),
    ).toBe(false)
  })
})
