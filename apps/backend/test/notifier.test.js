import test from "node:test";
import assert from "node:assert/strict";
import nock from "nock";
import createNotifier from "../src/notifier.js";

nock.disableNetConnect();

const ensureNoPendingNocks = (t) => {
  t.after(() => {
    if (!nock.isDone()) {
      const pending = nock.pendingMocks();
      nock.cleanAll();
      throw new Error(`Pending mocks: ${pending.join(", ")}`);
    }
  });
};

test("notifier posts notifications with supplied URLs", async (t) => {
  ensureNoPendingNocks(t);

  let capturedPayload;
  nock("http://apprise:8000")
    .post("/notify", (body) => {
      capturedPayload = body;
      return true;
    })
    .reply(200, "");

  const notifier = createNotifier({
    appriseApiUrl: "http://apprise:8000/notify",
  });

  await notifier.sendNotification({
    title: "Balance update",
    body: "Body",
    urls: ["pover://token@user/"],
  });

  assert.equal(capturedPayload.title, "Balance update");
  assert.equal(capturedPayload.format, "html");
  assert.deepEqual(capturedPayload.urls, ["pover://token@user/"]);
});

test("notifier targets config keys without duplicating URLs", async (t) => {
  ensureNoPendingNocks(t);

  let capturedPayload;
  nock("http://apprise:8000")
    .post("/kids", (body) => {
      capturedPayload = body;
      return true;
    })
    .reply(200, "");

  const notifier = createNotifier({ appriseApiUrl: "http://apprise:8000" });

  await notifier.sendNotification({
    title: "Balance update",
    body: "Body",
    urls: ["pover://token@user/"],
    configKey: "kids",
  });

  assert.equal(capturedPayload.urls, undefined);
});

test("notifier rejects when no destinations are provided", async () => {
  const notifier = createNotifier({
    appriseApiUrl: "http://apprise:8000/notify",
  });
  await assert.rejects(
    () => notifier.sendNotification({ title: "Missing", body: "Body" }),
    /No Apprise destination provided/i,
  );
});
