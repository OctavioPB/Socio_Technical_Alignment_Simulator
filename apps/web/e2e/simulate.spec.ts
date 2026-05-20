import { test, expect } from "@playwright/test"

test.describe("/simulate page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/simulate")
  })

  test("renders the page without crashing", async ({ page }) => {
    // Either the workspace loads or the 'no teams' fallback appears
    const title = page.locator("h1, [data-testid='simulator-workspace'], code")
    await expect(title.first()).toBeVisible({ timeout: 10_000 })
  })

  test("nav bar is present", async ({ page }) => {
    const nav = page.locator("nav")
    await expect(nav).toBeVisible()
  })

  test("footer is present", async ({ page }) => {
    const footer = page.locator("footer")
    await expect(footer).toBeVisible()
  })

  test.describe("with graph loaded", () => {
    test.beforeEach(async ({ page }) => {
      // Skip if no teams available (CI without Neo4j)
      const workspace = page.locator('[data-testid="candidate-slot-A"]')
      const isVisible = await workspace.isVisible({ timeout: 5_000 }).catch(() => false)
      test.skip(!isVisible, "Graph not available in this environment")
    })

    test("candidate slot A is rendered", async ({ page }) => {
      await expect(page.locator('[data-testid="candidate-slot-A"]')).toBeVisible()
    })

    test("candidate slot B is rendered", async ({ page }) => {
      await expect(page.locator('[data-testid="candidate-slot-B"]')).toBeVisible()
    })

    test("stage button is disabled with no name", async ({ page }) => {
      const btn = page.locator('[data-testid="stage-btn-A"]')
      await expect(btn).toBeDisabled()
    })

    test("stage button enables after typing a name", async ({ page }) => {
      await page.locator('[data-testid="candidate-name-input-A"]').fill("Alice Engineer")
      const btn = page.locator('[data-testid="stage-btn-A"]')
      await expect(btn).toBeEnabled()
    })

    test("staging candidate A shows the CandidateCard", async ({ page }) => {
      await page.locator('[data-testid="candidate-name-input-A"]').fill("Alice Engineer")
      await page
        .locator('[data-testid="candidate-skills-input-A"]')
        .fill("python, kafka, neo4j")
      await page.locator('[data-testid="stage-btn-A"]').click()
      await expect(page.locator('[data-testid="candidate-card-A"]')).toBeVisible()
    })

    test("team graph canvas renders", async ({ page }) => {
      await expect(page.locator('[data-testid="team-graph-canvas"]')).toBeVisible({
        timeout: 8_000,
      })
    })
  })
})
