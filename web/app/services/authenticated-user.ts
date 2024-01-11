import Service from "@ember/service";
import { tracked } from "@glimmer/tracking";
import { inject as service } from "@ember/service";
import Store from "@ember-data/store";
import { assert } from "@ember/debug";
import { restartableTask, task } from "ember-concurrency";
import ConfigService from "hermes/services/config";
import FetchService from "hermes/services/fetch";
import SessionService from "./session";

export interface AuthenticatedUser {
  name: string;
  email: string;
  given_name: string;
  picture: string;
  subscriptions: Subscription[];
}

export interface Subscription {
  productArea: string;
  subscriptionType: SubscriptionType;
}

export enum SubscriptionType {
  Digest = "digest",
  Instant = "instant",
}

export default class AuthenticatedUserService extends Service {
  @service("config") declare configSvc: ConfigService;
  @service("fetch") declare fetchSvc: FetchService;
  @service declare session: SessionService;
  @service declare store: Store;

  @tracked subscriptions: Subscription[] | null = null;
  @tracked _info: AuthenticatedUser | null = null;

  get info(): AuthenticatedUser {
    assert("user info must exist", this._info);
    return this._info;
  }

  /**
   * Returns the user's subscriptions as a JSON string.
   * E.g., '{"subscriptions":["Customer Success", "Terraform"]}'
   * Used in POST requests to the subscriptions endpoint.
   */
  private get subscriptionsPostBody(): string {
    assert("subscriptions must be defined", this.subscriptions);
    let subscriptions = this.subscriptions.map(
      (subscription: Subscription) => subscription.productArea,
    );
    return JSON.stringify({ subscriptions });
  }

  /**
   * Loads the user's info from the Google API.
   * Called by `session.handleAuthentication` and `authenticated.afterModel`.
   * Ensures `authenticatedUser.info` is always defined and up-to-date
   * in any route that needs it. On error, bubbles up to the application route.
   */
  loadInfo = task(async () => {
    try {
      this._info = await this.fetchSvc
        .fetch(`/api/${this.configSvc.config.api_version}/me`)
        .then((response) => response?.json());
    } catch (e: unknown) {
      console.error("Error getting user information: ", e);
      throw e;
    }
  });

  /**
   * Loads the user's subscriptions from the API.
   * If the user has no subscriptions, returns an empty array.
   */
  fetchSubscriptions = task(async () => {
    try {
      let subscriptions = await this.fetchSvc
        .fetch(`/api/${this.configSvc.config.api_version}/me/subscriptions`, {
          method: "GET",
        })
        .then((response) => response?.json());

      let newSubscriptions: Subscription[] = [];

      if (subscriptions) {
        newSubscriptions = subscriptions.map((subscription: string) => {
          return {
            productArea: subscription,
            subscriptionType: SubscriptionType.Instant,
          };
        });
      }
      this.subscriptions = newSubscriptions;
    } catch (e: unknown) {
      console.error("Error loading subscriptions: ", e);
      throw e;
    }
  });

  setSubscription = restartableTask(
    async (
      productArea: string,
      subscriptionType: SubscriptionType | undefined,
    ) => {
      assert("subscriptions must exist", this.subscriptions);
      console.log("subscriptionType", subscriptionType);

      const cached = this.subscriptions.slice();

      const existingSubscription = this.subscriptions.find(
        (subscription) => subscription.productArea === productArea,
      );

      if (existingSubscription) {
        // remove the subscription
        if (subscriptionType === undefined) {
          this.subscriptions.removeObject(existingSubscription);
        } else {
          // update the subscription type
          existingSubscription.subscriptionType = subscriptionType;

          // updating an array element doesn't trigger a change
          // so we need to replace the array
          this.subscriptions = this.subscriptions.slice();
        }
      } else {
        if (subscriptionType === undefined) {
          return;
        }
        // add the subscription
        this.subscriptions.addObject({
          productArea,
          subscriptionType: subscriptionType ?? SubscriptionType.Instant,
        });
      }

      try {
        await this.fetchSvc.fetch(
          `/api/${this.configSvc.config.api_version}/me/subscriptions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: this.subscriptionsPostBody,
          },
        );
      } catch (e: unknown) {
        this.subscriptions = cached;
        // TODO: flash message
        console.error("Error updating subscriptions: ", e);
      }
    },
  );
}
