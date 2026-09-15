import { expect, test } from '@playwright/test'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import { enterWorkspace, signUpAndSignIn, uniqueEmail } from './helpers/workspace'
import { linkFrom, waitForMail } from './mailbox'

/** Every action needs a project; this is the shortest way to have one. */
async function createProject(page: import('@playwright/test').Page, name: string) {
  await page.goto('/fr/app/projects')
  await page.getByRole('button', { name: fr.projects.new }).first().click()
  await page.getByLabel(fr.projects.form.name).fill(name)
  await page.getByRole('button', { name: fr.common.save }).click()
  await expect(page.getByRole('main')).toContainText(name)
}

async function quickCreate(
  page: import('@playwright/test').Page,
  title: string,
  options: { dueDate?: string } = {},
) {
  await page.getByRole('button', { name: fr.actions.new }).first().click()
  const sheet = page.getByRole('dialog', { name: fr.actions.quickCreate.title })
  await sheet.getByLabel(fr.actions.quickCreate.titleField).fill(title)
  if (options.dueDate) await sheet.getByLabel(fr.actions.quickCreate.dueDate).fill(options.dueDate)
  await sheet.getByRole('button', { name: fr.actions.quickCreate.submit }).click()
  await expect(page.getByRole('main')).toContainText(title)
}

test.describe('managing actions', () => {
  test('creates an action in two fields and follows it to done', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'actions')
    await createProject(page, 'Campagne Octobre')

    await page.goto('/fr/app/actions')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fr.actions.title)
    await expect(page.getByText(fr.actions.emptyTitle)).toBeVisible()

    // Quick create: a title and a project, nothing else (rule 10).
    await quickCreate(page, 'Publier le carrousel')

    await page.getByRole('button', { name: 'Publier le carrousel' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Publier le carrousel')

    // The one-click moves are exactly the transitions the machine allows.
    await expect(
      page.getByRole('button', { name: fr.status.action.done, exact: true }),
    ).toHaveCount(0)

    await page.getByRole('button', { name: fr.status.action.in_progress, exact: true }).click()
    await expect(page.getByRole('main')).toContainText(fr.status.action.in_progress)

    await page.getByRole('button', { name: fr.status.action.done, exact: true }).click()
    await expect(page.getByRole('main')).toContainText(fr.status.action.done)
  })

  test('refuses to block an action without saying why', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'blocked')
    await createProject(page, 'Refonte')
    await page.goto('/fr/app/actions')
    await quickCreate(page, 'Attendre les visuels')

    await page.getByRole('button', { name: 'Attendre les visuels' }).click()
    await page.getByRole('button', { name: fr.common.save }).first().click()

    const sheet = page.getByRole('dialog', { name: fr.actions.form.editTitle })
    await sheet.getByLabel(fr.actions.form.status).selectOption('blocked')
    await sheet.getByRole('button', { name: fr.common.save }).click()

    // A blocked action with no reason is one nobody unblocks, so the server
    // refuses it and the form says so rather than saving a half-truth.
    await expect(sheet.getByRole('alert')).toBeVisible()

    await sheet
      .getByLabel(fr.actions.form.blockedReason)
      .fill('Le client n’a pas envoyé les visuels')
    await sheet.getByRole('button', { name: fr.common.save }).click()
    await expect(page.getByRole('main')).toContainText('Le client n’a pas envoyé les visuels')
  })

  test('keeps a comment internal unless it is deliberately shared', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'comments')
    await createProject(page, 'Projet commenté')
    await page.goto('/fr/app/actions')
    await quickCreate(page, 'Relire le brief')

    await page.getByRole('button', { name: 'Relire le brief' }).click()
    await page.getByRole('tab', { name: fr.actions.tabs.comments }).click()

    await page.getByLabel(fr.actions.comments.title).fill('Note pour l’équipe')
    await page.getByRole('button', { name: fr.actions.comments.submit }).click()

    await expect(page.getByRole('main')).toContainText('Note pour l’équipe')
    // The default is what protects the rule: nobody chose "internal", and it is.
    await expect(page.getByRole('main')).toContainText(fr.actions.comments.internal)
  })

  test('moves the project’s progress as actions are finished', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'counters')
    await createProject(page, 'Projet mesuré')
    await page.goto('/fr/app/actions')

    await quickCreate(page, 'Première tâche')
    await quickCreate(page, 'Deuxième tâche')

    // Nothing done yet.
    await page.goto('/fr/app/projects')
    await page.getByRole('button', { name: 'Projet mesuré' }).click()
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')

    await page.goto('/fr/app/actions')
    await page.getByRole('button', { name: 'Première tâche' }).click()
    await page.getByRole('button', { name: fr.status.action.in_progress, exact: true }).click()
    await page.getByRole('button', { name: fr.status.action.done, exact: true }).click()
    await expect(page.getByRole('main')).toContainText(fr.status.action.done)

    // One of two: the denormalised counters were rewritten inside the same
    // transaction as the status change, so the project agrees immediately
    // (ADR-013) — no nightly job in between.
    await page.goto('/fr/app/projects')
    await page.getByRole('button', { name: 'Projet mesuré' }).click()
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  })

  test('works in English too', async ({ page }) => {
    await enterWorkspace(page, 'en', 'actions-en')

    await page.goto('/en/app/projects')
    await page.getByRole('button', { name: en.projects.new }).first().click()
    await page.getByLabel(en.projects.form.name).fill('October campaign')
    await page.getByRole('button', { name: en.common.save }).click()
    await expect(page.getByRole('main')).toContainText('October campaign')

    await page.goto('/en/app/actions')
    await page.getByRole('button', { name: en.actions.new }).first().click()
    const sheet = page.getByRole('dialog', { name: en.actions.quickCreate.title })
    await sheet.getByLabel(en.actions.quickCreate.titleField).fill('Publish the carousel')
    await sheet.getByRole('button', { name: en.actions.quickCreate.submit }).click()

    await expect(page.getByRole('main')).toContainText('Publish the carousel')
  })
})

test.describe('My Work', () => {
  test('sorts what is late, what is today and what is coming', async ({ page }) => {
    await enterWorkspace(page, 'fr', 'mywork')
    await createProject(page, 'Projet du jour')
    await page.goto('/fr/app/actions')

    const today = new Date().toISOString().slice(0, 10)
    const past = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10)
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)

    await quickCreate(page, 'En retard', { dueDate: past })
    await quickCreate(page, "Pour aujourd'hui", { dueDate: today })
    await quickCreate(page, 'Cette semaine', { dueDate: soon })

    await page.goto('/fr/app/my-work')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fr.myWork.title)

    const main = page.getByRole('main')
    await expect(main).toContainText(fr.myWork.buckets.overdue)
    await expect(main).toContainText(fr.myWork.buckets.today)
    await expect(main).toContainText(fr.myWork.buckets.soon)

    // Focus Mode opens from three actions and shows one at a time.
    await page.getByRole('button', { name: fr.myWork.focus.enter }).click()
    const focus = page.getByRole('dialog', { name: fr.myWork.focus.title })
    await expect(focus).toBeVisible()
    // The most urgent one first: the overdue action, not the newest.
    await expect(focus).toContainText('En retard')
  })
})

/**
 * The collaborator scope, one level down (ADR-038).
 *
 * An action is readable when its project is. This checks the whole chain
 * through HTTP, on a phone-sized viewport — the collaborator journey the
 * roadmap asks for, and the width the product is designed at (rule 9).
 */
test.describe('what a collaborator sees on a phone', () => {
  test('sees only the actions of their own projects', async ({ browser }) => {
    const WORKSPACE = 'action-scope'
    const ORGANISATION = `Agence ${WORKSPACE}`

    const managerContext = await browser.newContext()
    const manager = await managerContext.newPage()
    await enterWorkspace(manager, 'fr', WORKSPACE)

    await createProject(manager, 'Projet partagé')
    await createProject(manager, 'Projet réservé')

    await manager.goto('/fr/app/actions')
    await manager.getByRole('button', { name: fr.actions.new }).first().click()
    const sheet = manager.getByRole('dialog', { name: fr.actions.quickCreate.title })
    await sheet.getByLabel(fr.actions.quickCreate.titleField).fill('Tâche partagée')
    await sheet.getByLabel(fr.actions.quickCreate.project).selectOption({ label: 'Projet partagé' })
    await sheet.getByRole('button', { name: fr.actions.quickCreate.submit }).click()
    await expect(manager.getByRole('main')).toContainText('Tâche partagée')

    await manager.getByRole('button', { name: fr.actions.new }).first().click()
    const second = manager.getByRole('dialog', { name: fr.actions.quickCreate.title })
    await second.getByLabel(fr.actions.quickCreate.titleField).fill('Tâche réservée')
    await second
      .getByLabel(fr.actions.quickCreate.project)
      .selectOption({ label: 'Projet réservé' })
    await second.getByRole('button', { name: fr.actions.quickCreate.submit }).click()
    await expect(manager.getByRole('main')).toContainText('Tâche réservée')

    // Invite a collaborator and put them on one project only.
    const collaboratorEmail = uniqueEmail('collab')
    await manager.goto('/fr/app/team')
    await manager.getByLabel(fr.settings.members.email).fill(collaboratorEmail)
    await manager.getByLabel(fr.settings.members.role).selectOption('collaborator')
    await manager.getByRole('button', { name: fr.settings.members.invite }).click()
    await expect(manager.getByRole('main').getByRole('status')).toContainText(collaboratorEmail)

    const invitationUrl = linkFrom(
      await waitForMail(collaboratorEmail, {
        subject: fr.emails.invitation.subject.replace('{organization}', ORGANISATION),
      }),
    )

    // A phone, because that is where a collaborator actually works (rule 9).
    const phone = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const collaborator = await phone.newPage()
    await signUpAndSignIn(collaborator, 'fr', collaboratorEmail, 'Koffi Yao')
    await collaborator.goto(invitationUrl)
    await collaborator.getByRole('button', { name: fr.invitation.accept }).click()
    await expect(collaborator).toHaveURL(/\/fr\/app$/)

    await manager.goto('/fr/app/projects')
    await manager.getByRole('button', { name: 'Projet partagé' }).click()
    await expect(manager.getByRole('heading', { level: 1 })).toHaveText('Projet partagé')
    await manager.getByRole('tab', { name: fr.projects.tabs.members }).click()
    await manager.getByRole('button', { name: fr.projects.members.add }).click()
    const memberSheet = manager.getByRole('dialog', { name: fr.projects.members.add })
    await memberSheet.getByLabel(fr.projects.members.person).selectOption({ label: 'Koffi Yao' })
    await memberSheet.getByRole('button', { name: fr.common.save }).click()
    await expect(manager.getByRole('main')).toContainText('Koffi Yao')

    await collaborator.goto('/fr/app/actions')
    await expect(collaborator.getByRole('main')).toContainText('Tâche partagée')
    await expect(collaborator.getByRole('main')).not.toContainText('Tâche réservée')

    // And no sideways scrolling at 375px, on the screen they live in.
    const overflow = await collaborator.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'the actions list must not scroll sideways on a phone').toBeLessThanOrEqual(0)

    await managerContext.close()
    await phone.close()
  })
})
