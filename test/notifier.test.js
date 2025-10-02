import test from "node:test";
import assert from "node:assert/strict";
import createNotifier from "../src/notifier.js";

test("notifier posts notifications with supplied URLs", async (t) => {
  const originalFetch = global.fetch;
  let capturedRequest;
  global.fetch = async (url, options) => {
    capturedRequest = { url, options };
    return { ok: true, text: async () => "" };
  };

  t.after(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
  });

  const notifier = createNotifier({ appriseApiUrl: "http://apprise:8000/notify" });

  await notifier.sendNotification({
    title: "Balance update",
    body: "Body",
    urls: ["pover://token@user/"],
  });

  assert(capturedRequest);
  const payload = JSON.parse(capturedRequest.options.body);
  assert.equal(payload.title, "Balance update");
  assert.equal(payload.format, "html");
  assert.deepEqual(payload.urls, ["pover://token@user/"]);
});

test("notifier targets config keys without duplicating URLs", async (t) => {
  const originalFetch = global.fetch;
  let capturedRequest;
  global.fetch = async (url, options) => {
    capturedRequest = { url, options };
    return { ok: true, text: async () => "" };
  };

  t.after(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
  });

  const notifier = createNotifier({ appriseApiUrl: "http://apprise:8000" });

  await notifier.sendNotification({
    title: "Balance update",
    body: "Body",
    urls: ["pover://token@user/"],
    configKey: "kids",
  });

  assert(capturedRequest);
  assert.equal(capturedRequest.url, "http://apprise:8000/kids");
  const payload = JSON.parse(capturedRequest.options.body);
  assert.equal(payload.urls, undefined);
});

test("notifier rejects when no destinations are provided", async (t) => {
  const notifier = createNotifier({ appriseApiUrl: "http://apprise:8000/notify" });
  await assert.rejects(
    () => notifier.sendNotification({ title: "Missing", body: "Body" }),
    /No Apprise destination provided/i,
  );
});
