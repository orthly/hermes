import { visit } from "@ember/test-helpers";
import { setupApplicationTest } from "ember-qunit";
import { module, test } from "qunit";
import { authenticateSession } from "ember-simple-auth/test-support";
import { MirageTestContext, setupMirage } from "ember-cli-mirage/test-support";
import { getPageTitle } from "ember-page-title/test-support";

interface AuthenticatedSettingsRouteTestContext extends MirageTestContext {}

module("Acceptance | authenticated/settings", function (hooks) {
  setupApplicationTest(hooks);
  setupMirage(hooks);

  hooks.beforeEach(async function () {
    await authenticateSession({});
  });

  test("the page title is correct", async function (this: AuthenticatedSettingsRouteTestContext, assert) {
    await visit("/settings");
    assert.equal(getPageTitle(), "Email Notifications | Hermes");
  });

  test("you can manage product-area subscriptions", async function (this: AuthenticatedSettingsRouteTestContext, assert) {
    await visit("/settings");

    // probably need to do some populating
    assert.dom("[data-test-subscription-list]").exists();
    assert.dom("[data-test-subscription-list-item]").exists({ count: 3 });
  });
});
