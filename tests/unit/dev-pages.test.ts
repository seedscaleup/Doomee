import { describe, expect, it } from 'vitest'
import { devPagesEnabled } from '@/lib/dev-pages'

describe('development-only pages', () => {
  it('are absent from a production build', () => {
    expect(devPagesEnabled({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false)
  })

  it('are present in development without any flag', () => {
    expect(devPagesEnabled({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(true)
  })

  it('can be opted into explicitly, which is how the e2e suite scans them', () => {
    expect(
      devPagesEnabled({ NODE_ENV: 'production', ENABLE_DEV_PAGES: 'true' } as NodeJS.ProcessEnv),
    ).toBe(true)
  })

  it('is not enabled by a truthy-looking value', () => {
    expect(
      devPagesEnabled({ NODE_ENV: 'production', ENABLE_DEV_PAGES: '1' } as NodeJS.ProcessEnv),
    ).toBe(false)
  })
})
