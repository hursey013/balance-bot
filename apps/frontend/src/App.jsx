import { useEffect, useMemo, useState } from "react";

const LOGO_URL = "/logo.svg";

const accountLabel = (account) => {
  if (!account) return "Unknown account";
  const parts = [account.name || account.nickname || account.institution];
  if (account.mask || account.last_four) {
    parts.push(`•••• ${account.mask || account.last_four}`);
  }
  if (account.id && !parts.filter(Boolean).length) {
    parts.push(account.id);
  }
  return parts.filter(Boolean).join(" · ") || account.id || "Account";
};

const createBlankTarget = () => ({
  name: "",
  accountIds: [],
  appriseConfigKey: "",
  appriseUrls: [],
});

const splitUrls = (value) =>
  value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const WizardStep = ({ step, currentStep, title, description }) => (
  <div className="flex gap-3">
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all ${currentStep === step ? "border-primary bg-primary text-primary-foreground" : currentStep > step ? "border-emerald-400 bg-emerald-400 text-slate-900" : "border-slate-700 text-slate-300"}`}
    >
      {step}
    </div>
    <div>
      <p className="font-semibold text-slate-100">{title}</p>
      <p className="text-sm text-slate-400">{description}</p>
    </div>
  </div>
);

const TargetEditor = ({ target, index, accounts, onChange, onRemove }) => {
  const handleAccountToggle = (accountId, checked) => {
    if (accountId === "*") {
      onChange({
        ...target,
        accountIds: checked ? ["*"] : [],
      });
      return;
    }

    const withoutAll = target.accountIds.filter((id) => id !== "*");
    let next = new Set(withoutAll);
    if (checked) {
      next.add(accountId);
    } else {
      next.delete(accountId);
    }
    onChange({
      ...target,
      accountIds: Array.from(next),
    });
  };

  const selectedAccounts = useMemo(
    () => new Set(target.accountIds),
    [target.accountIds],
  );

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-black/20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex-1">
          <label
            className="block text-sm font-medium text-slate-300"
            htmlFor={`target-name-${index}`}
          >
            Person or channel name
          </label>
          <input
            id={`target-name-${index}`}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-primary focus:ring-2 focus:ring-primary/60"
            placeholder="Elliot's devices"
            value={target.name}
            onChange={(event) =>
              onChange({ ...target, name: event.target.value })
            }
          />
        </div>
        <button
          type="button"
          className="mt-4 inline-flex items-center justify-center rounded-lg border border-red-500 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/10 md:mt-0"
          onClick={onRemove}
        >
          Remove
        </button>
      </div>

      <div className="mt-6">
        <p className="text-sm font-semibold text-slate-200">
          Which accounts should notify this person?
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200">
            <input
              type="checkbox"
              className="rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary/40"
              checked={selectedAccounts.has("*")}
              onChange={(event) =>
                handleAccountToggle("*", event.target.checked)
              }
            />
            All accounts
          </label>
          {accounts.map((account) => (
            <label
              key={account.id}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
            >
              <input
                type="checkbox"
                className="rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary/40"
                checked={
                  selectedAccounts.has("*") || selectedAccounts.has(account.id)
                }
                onChange={(event) =>
                  handleAccountToggle(account.id, event.target.checked)
                }
                disabled={
                  selectedAccounts.has("*") && !selectedAccounts.has(account.id)
                }
              />
              {accountLabel(account)}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <label
            className="block text-sm font-medium text-slate-300"
            htmlFor={`target-config-${index}`}
          >
            Apprise config key (optional)
          </label>
          <input
            id={`target-config-${index}`}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-primary focus:ring-2 focus:ring-primary/60"
            placeholder="team-balance-updates"
            value={target.appriseConfigKey ?? ""}
            onChange={(event) =>
              onChange({ ...target, appriseConfigKey: event.target.value })
            }
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium text-slate-300"
            htmlFor={`target-urls-${index}`}
          >
            Direct Apprise URLs (one per line)
          </label>
          <textarea
            id={`target-urls-${index}`}
            rows={3}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-primary focus:ring-2 focus:ring-primary/60"
            placeholder="discord://webhook-url"
            value={(target.appriseUrls ?? []).join("\n")}
            onChange={(event) =>
              onChange({
                ...target,
                appriseUrls: splitUrls(event.target.value),
              })
            }
          />
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [appriseApiUrl, setAppriseApiUrl] = useState(
    "http://apprise:8000/notify",
  );
  const [targets, setTargets] = useState([]);
  const [setupToken, setSetupToken] = useState("");
  const [accessUrl, setAccessUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [accessPreview, setAccessPreview] = useState(null);

  useEffect(() => {
    const boot = async () => {
      try {
        const response = await fetch("/api/config");
        if (!response.ok) throw new Error("Failed to load configuration");
        const data = await response.json();
        setAppriseApiUrl(data.notifier.appriseApiUrl);
        setTargets(data.notifications.targets ?? []);
        if (data.simplefin.configured) {
          setCurrentStep(2);
          setAccessPreview(data.simplefin.accessUrlPreview);
          try {
            const accountsResponse = await fetch("/api/simplefin/accounts");
            if (accountsResponse.ok) {
              const json = await accountsResponse.json();
              setAccounts(json.accounts ?? []);
            }
          } catch (accountError) {
            console.warn("Unable to load accounts", accountError);
          }
        }
      } catch (configError) {
        console.error(configError);
        setError("We couldn\'t load your saved settings. Give it another try in a moment.");
      }
    };

    boot();
  }, []);

  const handleExchange = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const payload = {};
      if (setupToken.trim()) {
        payload.setupToken = setupToken.trim();
      }
      if (accessUrl.trim()) {
        payload.accessUrl = accessUrl.trim();
      }

      const response = await fetch("/api/simplefin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "SimpleFIN exchange failed");
      }

      const data = await response.json();
      setAccounts(data.accounts ?? []);
      setAccessPreview(data.accessUrlPreview ?? null);
      setCurrentStep(2);
      setMessage("Sweet! We grabbed your SimpleFIN accounts and stored the access link for safekeeping.");
    } catch (exchangeError) {
      setError(
        exchangeError.message ||
          "Something felt off while talking to SimpleFIN. Double-check the token or access link and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appriseApiUrl,
          targets,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Unable to save configuration");
      }

      const data = await response.json();
      setTargets(data.notifications.targets ?? []);
      setAppriseApiUrl(data.notifier.appriseApiUrl);
      setMessage("All set! Your crew will get updates as balances change.");
      setCurrentStep(3);
    } catch (saveError) {
      setError(
        saveError.message ||
          "We weren\'t able to save those settings. Give it another shot and we\'ll keep an eye on things.",
      );
    } finally {
      setLoading(false);
    }
  };

  const addTarget = () => {
    setTargets((existing) => [...existing, createBlankTarget()]);
  };

  const updateTarget = (index, nextTarget) => {
    setTargets((existing) =>
      existing.map((target, idx) => (idx === index ? nextTarget : target)),
    );
  };

  const removeTarget = (index) => {
    setTargets((existing) => existing.filter((_, idx) => idx !== index));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
        <header className="flex flex-col items-center gap-4 text-center">
          <img src={LOGO_URL} alt="Balance Bot" className="h-20 w-20" />
          <h1 className="text-3xl font-bold">Welcome to Balance Bot</h1>
          <p className="max-w-2xl text-slate-400">
            We\'ll walk through everything together—paste your SimpleFIN details,
            meet your accounts, and decide who gets the heads up when money moves.
          </p>
        </header>

        <section className="grid gap-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl shadow-black/40 md:grid-cols-[280px,1fr]">
          <div className="flex flex-col gap-6">
            <WizardStep
              step={1}
              currentStep={currentStep}
              title="Connect SimpleFIN"
              description="Share a setup token or access link so we can talk to your bank friend."
            />
            <WizardStep
              step={2}
              currentStep={currentStep}
              title="Invite recipients"
              description="Pair accounts with the people or channels that care."
            />
            <WizardStep
              step={3}
              currentStep={currentStep}
              title="Finish"
              description="Save everything and let Balance Bot keep watch."
            />
          </div>

          <div className="flex flex-col gap-6">
            {error ? (
              <div className="rounded-lg border border-red-500 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="rounded-lg border border-emerald-500 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {message}
              </div>
            ) : null}

            {currentStep === 1 ? (
              <form className="flex flex-col gap-4" onSubmit={handleExchange}>
                <div>
                  <label
                    className="block text-sm font-medium text-slate-300"
                    htmlFor="setup-token"
                  >
                    SimpleFIN setup token
                  </label>
                  <textarea
                    id="setup-token"
                    rows={3}
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary focus:ring-2 focus:ring-primary/60"
                    placeholder="Paste the long base64 token from SimpleFIN"
                    value={setupToken}
                    onChange={(event) => setSetupToken(event.target.value)}
                  />
                </div>

                <div className="text-center text-sm font-semibold text-slate-400">
                  or
                </div>

                <div>
                  <label
                    className="block text-sm font-medium text-slate-300"
                    htmlFor="access-url"
                  >
                    Existing access URL
                  </label>
                  <input
                    id="access-url"
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary focus:ring-2 focus:ring-primary/60"
                    placeholder="https://user:pass@bridge.simplefin.org/simplefin"
                    value={accessUrl}
                    onChange={(event) => setAccessUrl(event.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading}
                >
                  {loading ? "Checking…" : "Let\'s keep going"}
                </button>

                {accessPreview ? (
                  <p className="text-sm text-slate-400">
                    Stored access link:{" "}
                    <span className="font-mono">{accessPreview}</span>
                  </p>
                ) : null}
              </form>
            ) : null}

            {currentStep >= 2 ? (
              <div className="flex flex-col gap-6">
                <div>
                  <label
                    className="block text-sm font-medium text-slate-300"
                    htmlFor="apprise-url"
                  >
                    Where should Balance Bot send alerts?
                  </label>
                  <input
                    id="apprise-url"
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-primary focus:ring-2 focus:ring-primary/60"
                    value={appriseApiUrl}
                    onChange={(event) => setAppriseApiUrl(event.target.value)}
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    We\'ll append config keys or use direct URLs for each person so
                    notifications land exactly where you expect.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">
                      Who should hear about balances?
                    </h2>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/10"
                      onClick={addTarget}
                    >
                      Add someone new
                    </button>
                  </div>
                  {targets.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/80 px-4 py-6 text-sm text-slate-400">
                      Add at least one person or channel so Balance Bot knows who to
                      nudge when something changes.
                    </p>
                  ) : null}
                  {targets.map((target, index) => (
                    <TargetEditor
                      key={`target-${index}`}
                      target={target}
                      index={index}
                      accounts={accounts}
                      onChange={(nextTarget) => updateTarget(index, nextTarget)}
                      onRemove={() => removeTarget(index)}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleSave}
                  disabled={loading || accounts.length === 0}
                >
                  {loading ? "Saving…" : "Save and start monitoring"}
                </button>

                {accounts.length === 0 ? (
                  <p className="text-sm text-amber-300">
                    We\'ll unlock this step after SimpleFIN shares your accounts.
                    Pop back up to step one if you haven\'t done that yet.
                  </p>
                ) : null}
              </div>
            ) : null}

            {currentStep === 3 ? (
              <div className="rounded-lg border border-emerald-500 bg-emerald-500/10 px-4 py-4 text-emerald-200">
                Nice work! Balance Bot is now watching {accounts.length} account
                {accounts.length === 1 ? "" : "s"} and will deliver updates using
                the targets above.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
};

export default App;
