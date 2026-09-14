import type { Locator, Page } from '@playwright/test'

/**
 * Next.js renders its own <div role="alert" id="__next-route-announcer__"> on
 * every page, so a bare getByRole('alert') matches two elements and fails
 * strict mode. Scoping to <main> keeps the query about OUR alerts.
 */
export function formAlert(page: Page): Locator {
  return page.getByRole('main').getByRole('alert')
}

export function formStatus(page: Page): Locator {
  return page.getByRole('main').getByRole('status')
}
