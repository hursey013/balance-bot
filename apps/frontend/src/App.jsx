import { useEffect, useMemo, useRef, useState, useId } from 'react';

/**
 * @typedef {{
 *   id: string,
 *   name?: string,
 *   nickname?: string,
 *   institution?: string,
 *   mask?: string,
 *   last_four?: string
 * }} Account
 */

/**
 * @typedef {{
 *   name: string,
 *   accountIds: string[],
 *   appriseConfigKey?: string,
 *   appriseUrls: string[]
 * }} Target
 */

const LOGO_URL = '/logo.svg';
const REPO_URL = 'https://github.com/hursey013/balance-bot';

const IconPlus = ({ className }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 4.5v15m7.5-7.5h-15"
    />
  </svg>
);

const IconChevronDown = ({ className }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.5 8.25l-7.5 7.5-7.5-7.5"
    />
  </svg>
);

const IconTrash = ({ className }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
    />
  </svg>
);

/**
 * Generate a readable label for an account in the wizard UI.
 * @param {Account} account
 * @returns {string}
 */
const accountLabel = (account) => {
  if (!account) return 'Unknown account';

  const trim = (value) => (typeof value === 'string' ? value.trim() : '');
  const orgName = trim(account.org?.name) || trim(account.institution);
  const primaryName = trim(account.name) || trim(account.nickname);
  const masked = trim(account.mask) || trim(account.last_four);

  let label = '';
  if (orgName && primaryName) {
    label = `${orgName} - ${primaryName}`;
  } else if (orgName) {
    label = orgName;
  } else if (primaryName) {
    label = primaryName;
  }

  if (masked) {
    label = label ? `${label} · •••• ${masked}` : `•••• ${masked}`;
  }

  if (!label) {
    label = account.id || 'Account';
  }

  return label;
};

/**
 * Provide a fresh notification target for the wizard.
 * @returns {Target}
 */
const createBlankTarget = () => ({
  name: '',
  accountIds: [],
  appriseConfigKey: '',
  appriseUrls: [],
});

/**
 * Split a textarea input into a list of Apprise URLs.
 * @param {string} value
 * @returns {string[]}
 */
const splitUrls = (value) =>
  value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * Edit a single notification target in the onboarding flow.
 * @param {{ target: Target, index: number, accounts: Account[], onChange: (target: Target) => void, onRemove: () => void }} props
 */
const TargetEditor = ({ target, index, accounts, onChange, onRemove }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const searchInputId = useId();
  const listboxId = useId();
  const legendId = useId();
  const detailsId = useId();

  const selectedSet = useMemo(
    () => new Set(Array.isArray(target.accountIds) ? target.accountIds : []),
    [target.accountIds],
  );

  const accountMap = useMemo(() => {
    const map = new Map();
    accounts.forEach((account) => {
      if (account?.id) {
        map.set(account.id, account);
      }
    });
    return map;
  }, [accounts]);

  const selectedChips = useMemo(() => {
    if (selectedSet.has('*')) {
      return [{ id: '*', label: 'All accounts' }];
    }
    return (Array.isArray(target.accountIds) ? target.accountIds : []).map(
      (accountId) => {
        const account = accountMap.get(accountId);
        return {
          id: accountId,
          label: account ? accountLabel(account) : accountId,
        };
      },
    );
  }, [accountMap, selectedSet, target.accountIds]);

  const filteredGroups = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const groups = new Map();

    accounts.forEach((account) => {
      if (!account?.id) return;
      const labelText = accountLabel(account).toLowerCase();
      const institution = (account.institution || '').toLowerCase();
      const orgLower = (account.org?.name || '').toLowerCase();
      if (
        lower &&
        !labelText.includes(lower) &&
        !institution.includes(lower) &&
        !orgLower.includes(lower)
      ) {
        return;
      }

      const groupLabel =
        account.org?.name?.trim() ||
        account.institution?.trim() ||
        'Other accounts';
      if (!groups.has(groupLabel)) {
        groups.set(groupLabel, []);
      }
      groups.get(groupLabel).push(account);
    });

    return Array.from(groups.entries())
      .map(([label, grouped]) => ({
        label,
        accounts: grouped.sort((a, b) =>
          accountLabel(a).localeCompare(accountLabel(b)),
        ),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [accounts, query]);

  const summaryText = selectedSet.has('*')
    ? 'All accounts'
    : selectedChips.length
      ? `${selectedChips.length} account${selectedChips.length === 1 ? '' : 's'} selected`
      : 'Select accounts';

  const headingName = (target.name || '').trim() || `Recipient ${index + 1}`;

  const closeDropdown = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;

    const handlePointer = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('touchstart', handlePointer);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('touchstart', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => {
        searchRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (collapsed) {
      setOpen(false);
    }
  }, [collapsed]);

  const toggleAccount = (accountId) => {
    if (accountId === '*') {
      onChange({
        ...target,
        accountIds: selectedSet.has('*') ? [] : ['*'],
      });
      return;
    }

    const next = new Set(selectedSet);
    next.delete('*');
    if (next.has(accountId)) {
      next.delete(accountId);
    } else {
      next.add(accountId);
    }
    onChange({ ...target, accountIds: Array.from(next) });
  };

  const handleRemoveChip = (accountId) => {
    if (accountId === '*') {
      onChange({ ...target, accountIds: [] });
      return;
    }
    toggleAccount(accountId);
  };

  const handleCardClick = (event) => {
    if (!collapsed) return;
    const target = event.target;
    const element = target instanceof Element ? target : target?.parentElement;
    if (
      element?.closest('button, a, input, textarea, select, label, [role="button"]')
    ) {
      return;
    }
    setCollapsed(false);
  };

  return (
    <div
      className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-black/20"
      onClick={handleCardClick}
    >
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        aria-controls={detailsId}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-200">
            {headingName}
          </p>
          <p className="mt-1 text-xs text-slate-500">{summaryText}</p>
        </div>
        <IconChevronDown
          className={`mt-1 h-4 w-4 shrink-0 transition-transform ${collapsed ? '' : 'rotate-180'}`}
        />
      </button>

      {collapsed ? null : (
        <div id={detailsId} className="mt-6 space-y-6">
          <div className="w-full md:w-64">
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

          <fieldset className="space-y-3" ref={dropdownRef}>
            <legend
              id={legendId}
              className="text-sm font-semibold text-slate-200"
            >
              Which accounts should notify this person?
            </legend>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 outline-none transition hover:border-primary hover:text-primary-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/60"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listboxId}
                onClick={() => setOpen((value) => !value)}
                ref={triggerRef}
              >
                <span>{summaryText}</span>
                <svg
                  aria-hidden="true"
                  className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.104l3.71-3.874a.75.75 0 111.08 1.04l-4.25 4.44a.75.75 0 01-1.08 0l-4.25-4.44a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {selectedChips.length > 0 ? (
                <div
                  className="flex flex-wrap items-center gap-2"
                  aria-live="polite"
                >
                  {selectedChips.map((chip) => (
                    <span
                      key={chip.id}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200"
                    >
                      {chip.label}
                      <button
                        type="button"
                        className="rounded-full p-0.5 text-slate-400 transition hover:text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        onClick={() => handleRemoveChip(chip.id)}
                        aria-label={`Remove ${chip.label}`}
                      >
                        <svg
                          aria-hidden="true"
                          className="h-3 w-3"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M4.22 4.22a.75.75 0 011.06 0L10 8.94l4.72-4.72a.75.75 0 111.06 1.06L11.06 10l4.72 4.72a.75.75 0 11-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 01-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 010-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Nothing selected yet.</p>
              )}
            </div>

            {open ? (
              <div className="relative mt-3 rounded-xl border border-slate-800 bg-slate-900/80 shadow-lg shadow-black/40">
                <div className="border-b border-slate-800 p-3">
                  <label
                    htmlFor={searchInputId}
                    className="block text-xs font-medium uppercase tracking-wide text-slate-400"
                  >
                    Search accounts
                  </label>
                  <input
                    id={searchInputId}
                    ref={searchRef}
                    type="search"
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary focus:ring-2 focus:ring-primary/60"
                    placeholder="Search by name or institution"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-describedby={legendId}
                  />
                </div>

                <div
                  id={listboxId}
                  role="listbox"
                  aria-multiselectable="true"
                  aria-labelledby={legendId}
                  className="max-h-64 overflow-y-auto p-3"
                >
                  <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                    <label className="flex items-center justify-between gap-3 text-sm text-slate-200">
                      <span className="font-medium">All accounts</span>
                      <input
                        type="checkbox"
                        className="rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary/40"
                        checked={selectedSet.has('*')}
                        onChange={() => toggleAccount('*')}
                      />
                    </label>
                    <p className="mt-1 text-xs text-slate-500">
                      Selecting this overrides individual account picks.
                    </p>
                  </div>

                  {filteredGroups.length === 0 ? (
                    <p className="px-3 py-8 text-center text-sm text-slate-500">
                      No accounts match "{query}".
                    </p>
                  ) : null}

                  {filteredGroups.map(
                    ({ label, accounts: groupedAccounts }) => (
                      <div key={label} className="mb-4 last:mb-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {label}
                        </p>
                        <div className="mt-2 flex flex-col gap-2">
                          {groupedAccounts.map((account) => {
                            const checkboxId = `${index}-${account.id}`;
                            const checked =
                              selectedSet.has('*') ||
                              selectedSet.has(account.id);
                            return (
                              <label
                                key={account.id}
                                htmlFor={checkboxId}
                                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 transition hover:border-primary/60"
                              >
                                <span>{accountLabel(account)}</span>
                                <input
                                  id={checkboxId}
                                  type="checkbox"
                                  className="rounded border-slate-600 bg-slate-900 text-primary focus:ring-primary/40"
                                  checked={checked}
                                  disabled={
                                    selectedSet.has('*') &&
                                    !selectedSet.has(account.id)
                                  }
                                  onChange={() => toggleAccount(account.id)}
                                />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ),
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-3 py-2">
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    onClick={() => {
                      setQuery('');
                      closeDropdown();
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : null}
          </fieldset>

          <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <div>
              <h3 className="text-base font-semibold text-slate-200">
                Apprise delivery
              </h3>
              <p className="text-xs text-slate-500">
                Choose a config key or drop direct URLs for this recipient.{' '}
                <a
                  href="https://github.com/caronc/apprise?tab=readme-ov-file#supported-notifications"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  See supported notification types
                </a>
              </p>
            </div>
            <div className="w-full md:w-64">
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
                value={target.appriseConfigKey ?? ''}
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
                value={(target.appriseUrls ?? []).join('\n')}
                onChange={(event) =>
                  onChange({
                    ...target,
                    appriseUrls: splitUrls(event.target.value),
                  })
                }
              />
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-red-500 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/10"
              onClick={onRemove}
            >
              <IconTrash className="h-4 w-4" />
              <span>Remove recipient</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Balance Bot onboarding and configuration wizard.
 * @returns {JSX.Element}
 */
const App = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [appriseApiUrl, setAppriseApiUrl] = useState(
    'http://apprise:8000/notify',
  );
  const [targets, setTargets] = useState([]);
  const [lastSavedTargets, setLastSavedTargets] = useState([]);
  const [setupToken, setSetupToken] = useState('');
  const [accessUrl, setAccessUrl] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [accessPreview, setAccessPreview] = useState(null);
  const isAdminView = currentStep === 3;
  const successMessageRef = useRef(null);
  const hasTargetChanges = useMemo(
    () => JSON.stringify(targets) !== JSON.stringify(lastSavedTargets),
    [targets, lastSavedTargets],
  );

  useEffect(() => {
    if (message && successMessageRef.current) {
      const node = successMessageRef.current;
      node.focus();
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [message]);

  useEffect(() => {
    // Fetch persisted configuration so the wizard can resume in place.
    const boot = async () => {
      try {
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error('Failed to load configuration');
        const data = await response.json();
        setAppriseApiUrl(data.notifier.appriseApiUrl);
        const bootTargets = data.notifications.targets ?? [];
        setTargets(bootTargets);
        setLastSavedTargets(bootTargets);

        const simplefinConfigured = Boolean(data.simplefin.configured);
        const appriseComplete = Boolean(data.onboarding?.appriseConfigured);

        if (simplefinConfigured) {
          setAccessPreview(data.simplefin.accessUrlPreview);
          try {
            const accountsResponse = await fetch('/api/simplefin/accounts');
            if (accountsResponse.ok) {
              const json = await accountsResponse.json();
              setAccounts(json.accounts ?? []);
            }
          } catch (accountError) {
            console.warn('Unable to load accounts', accountError);
          }
        }

        const nextStep = simplefinConfigured ? (appriseComplete ? 3 : 2) : 1;
        setCurrentStep(nextStep);
      } catch (configError) {
        console.error(configError);
        setError(
          "We couldn't load your saved settings. Give it another try in a moment.",
        );
      }
    };

    boot();
  }, []);

  const handleExchange = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const payload = {};
      if (setupToken.trim()) {
        payload.setupToken = setupToken.trim();
      }
      if (accessUrl.trim()) {
        payload.accessUrl = accessUrl.trim();
      }

      const response = await fetch('/api/simplefin/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || 'SimpleFIN exchange failed');
      }

      const data = await response.json();
      setAccounts(data.accounts ?? []);
      setAccessPreview(data.accessUrlPreview ?? null);
      setCurrentStep(2);
      setMessage(
        'Sweet! We grabbed your SimpleFIN accounts and stored the access link for safekeeping.',
      );
    } catch (exchangeError) {
      setError(
        exchangeError.message ||
          'Something felt off while talking to SimpleFIN. Double-check the token or access link and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAppriseSave = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appriseApiUrl,
          targets,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || 'Unable to save configuration');
      }

      const data = await response.json();
      const savedTargets = data.notifications.targets ?? [];
      setTargets(savedTargets);
      setLastSavedTargets(savedTargets);
      setAppriseApiUrl(data.notifier.appriseApiUrl);
      setMessage('Apprise is ready to relay your updates.');
      setCurrentStep(3);
    } catch (saveError) {
      setError(
        saveError.message ||
          'We were not able to save Apprise details. Give it another try.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleTargetsSave = async () => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appriseApiUrl,
          targets,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || 'Unable to save configuration');
      }

      const data = await response.json();
      const savedTargets = data.notifications.targets ?? [];
      setTargets(savedTargets);
      setLastSavedTargets(savedTargets);
      setAppriseApiUrl(data.notifier.appriseApiUrl);
      setMessage('All set! Your crew will get updates as balances change.');
    } catch (saveError) {
      setError(
        saveError.message ||
          "We weren't able to save those settings. Give it another shot and we'll keep an eye on things.",
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
        {isAdminView ? (
          <header className="flex flex-col gap-2 text-left">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img src={LOGO_URL} alt="Balance Bot" className="h-12 w-12" />
                <h1 className="text-3xl font-semibold lowercase tracking-tight">
                  balance-bot
                </h1>
              </div>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="hidden text-xs font-medium text-primary underline-offset-2 hover:underline md:block"
              >
                View on GitHub
              </a>
            </div>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs font-medium text-primary underline-offset-2 hover:underline md:hidden"
            >
              View on GitHub
            </a>
          </header>
        ) : (
          <header className="flex flex-col items-center gap-4 text-center">
            <img src={LOGO_URL} alt="Balance Bot" className="h-20 w-20" />
            <h1 className="text-3xl font-bold">
              Let's get Balance Bot connected
            </h1>
            <p className="max-w-2xl text-slate-400">
              We&apos;ll gather your SimpleFIN access and Apprise endpoint, then
              hand things over to the notification dashboard.
            </p>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              View the project on GitHub
            </a>
          </header>
        )}

        <section
          className={`flex w-full flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl shadow-black/40 ${
            isAdminView
              ? 'md:self-stretch lg:max-w-none'
              : 'md:self-center md:px-10 lg:max-w-3xl'
          }`}
        >
          <div className="flex flex-col gap-6">
            {error ? (
              <div className="rounded-lg border border-red-500 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}
            {message ? (
              <div
                ref={successMessageRef}
                tabIndex={-1}
                className="rounded-lg border border-emerald-500 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 focus:outline-none"
              >
                {message}
              </div>
            ) : null}

            {currentStep === 1 ? (
              <form className="flex flex-col gap-4" onSubmit={handleExchange}>
                <div>
                  <h2 className="text-xl font-semibold">Connect SimpleFIN</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Generate a setup token or access link from your{' '}
                    <a
                      href="https://www.simplefin.org/"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      SimpleFIN account
                    </a>{' '}
                    so Balance Bot can read balances securely.
                  </p>
                </div>
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
                  {loading ? 'Checking…' : "Let's keep going"}
                </button>

                {accessPreview ? (
                  <p className="text-sm text-slate-400">
                    Stored access link:{' '}
                    <span className="font-mono">{accessPreview}</span>
                  </p>
                ) : null}
              </form>
            ) : null}

            {currentStep === 2 ? (
              <form
                className="flex flex-col gap-4"
                onSubmit={handleAppriseSave}
              >
                <div>
                  <h2 className="text-xl font-semibold">Connect Apprise</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Point Balance Bot at your{' '}
                    <a
                      href="https://github.com/caronc/apprise"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Apprise notification server
                    </a>{' '}
                    so alerts reach the right places.
                  </p>
                </div>
                <div>
                  <label
                    className="block text-sm font-medium text-slate-300"
                    htmlFor="apprise-url"
                  >
                    Apprise API endpoint
                  </label>
                  <input
                    id="apprise-url"
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-primary focus:ring-2 focus:ring-primary/60"
                    value={appriseApiUrl}
                    onChange={(event) => setAppriseApiUrl(event.target.value)}
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Point us at your Apprise server so we can move on to the
                    notification dashboard.
                  </p>
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading || !(appriseApiUrl || '').trim()}
                >
                  {loading ? 'Saving…' : 'Save and continue'}
                </button>
              </form>
            ) : null}

            {currentStep === 3 ? (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Notification recipients
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Alerts flow through Apprise at{' '}
                      <span className="font-mono">{appriseApiUrl}</span>.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/10"
                    onClick={addTarget}
                  >
                    <IconPlus className="h-4 w-4" />
                    <span>Add recipient</span>
                  </button>
                </div>

                <div className="flex flex-col gap-4">
                  {targets.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/80 px-4 py-6 text-sm text-slate-400">
                      Add at least one person or channel so Balance Bot knows
                      who to nudge when something changes.
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

                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  {hasTargetChanges || loading ? (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleTargetsSave}
                      disabled={loading || accounts.length === 0}
                    >
                      {loading ? 'Saving…' : 'Save recipients'}
                    </button>
                  ) : null}
                  {accounts.length === 0 ? (
                    <p className="text-sm text-amber-300">
                      We&apos;ll unlock saving once SimpleFIN shares your
                      accounts.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
};

export default App;
