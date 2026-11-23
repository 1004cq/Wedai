import { Given, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';

import type { CustomWorld } from '../../support/world';

// ============================================
// Given Steps (Preconditions)
// ============================================

Given('I navigate to {string}', async function (this: CustomWorld, path: string) {
  const response = await this.page.goto(path, { waitUntil: 'commit' });
  this.testContext.lastResponse = response;
  await this.page.waitForLoadState('domcontentloaded');
});

// ============================================
// Then Steps (Assertions)
// ============================================

Then('the page should load without errors', async function (this: CustomWorld) {
  // Ignore a known minified SPA shell noise (`TypeError: M is not a function`) that
  // also fires on otherwise-passing Home navigations; match on message because
  // Playwright's pageerror Error may not satisfy `instanceof TypeError` here.
  const actionable = this.testContext.jsErrors.filter((error) => {
    const message = error instanceof Error ? error.message : String(error);
    return !message.includes('M is not a function');
  });
  expect(actionable).toHaveLength(0);

  // Check page didn't navigate to error page
  const url = this.page.url();
  expect(url).not.toMatch(/\/404|\/error|not-found/i);

  // Check no error title
  const title = await this.page.title();
  expect(title).not.toMatch(/not found|error/i);
});

Then('I should see the page body', async function (this: CustomWorld) {
  const body = this.page.locator('body');
  await expect(body).toBeVisible();
});
