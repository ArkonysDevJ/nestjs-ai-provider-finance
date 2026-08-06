// src/App.tsx
// [F-ID: FE-APP-01]
// @version 1.10.0
// @changelog 1.10.0 — CreateTransactionForm.handleSubmit now clears
//   `success` (and cancels any pending successTimer) at the start of
//   every submit, not just `error`. Found while testing the new
//   POST /transactions rate limit: submitting again inside the 3s
//   success-message window right after a prior successful submission,
//   where this new attempt got throttled (429), showed "✓ Transacción
//   guardada" and the rate-limit error side by side -- the success
//   message was a stale leftover from the PREVIOUS submission, not a
//   true result of the failed one. No transaction was actually created;
//   the message was simply wrong. Fixed at the source (clear success
//   before the new attempt resolves) rather than papering over it with
//   a shorter timer or a z-index hack.
// @changelog 1.9.0 — Password recovery flow. AuthScreen gains a 'forgot'
//   mode: enters email, calls supabase.auth.resetPasswordForEmail() with
//   window.location.origin as redirectTo, shows a "check your email"
//   confirmation. When the user arrives via the recovery link, Supabase
//   fires PASSWORD_RECOVERY in onAuthStateChange -- App catches it, sets
//   isRecovery=true, and renders SetNewPasswordScreen instead of the
//   normal app. After a successful updateUser() call, USER_UPDATED fires,
//   isRecovery resets, and the user lands in the app normally.
//   Note: the redirect URL (window.location.origin) must be in Supabase
//   Auth → URL Configuration → Redirect URLs for production deploys.
// @changelog 1.8.0 — Navigation changed from scroll-based to view switching.
//   Three independent views (new | dashboard | transactions) rendered
//   conditionally -- one visible at a time. AppHeader receives the active
//   view and an onNavigate callback; nav links highlight the current view
//   and switch it on click. Hamburger still collapses links on mobile.
//   Removed scroll-to-section logic and section IDs; view state in App
//   is the single source of truth for what's visible. Default view: 'new'
//   (primary daily action is logging a transaction).
// @changelog 1.7.0 — Basic navigation header (AppHeader): sticky top bar
//   with logo, section links (Nueva / Dashboard / Transacciones), language
//   switcher, and sign-out. LanguageSwitcher now lives exclusively in
//   AppHeader -- removed from the old per-section floating placement.
//   Hamburger menu on mobile (≤640px) collapses links to a dropdown.
// @changelog 1.6.0 — TransactionList's category dropdown now filters
//   to categories applicable to that row's transaction type
//   (applies_to === tx.type || 'both') instead of showing the full
//   catalog. Before this, reclassifying an income transaction still
//   offered "Vivienda"/"Transporte"/etc. -- categories that only make
//   sense for expenses. Mirrors the applies_to column added in
//   supabase/migrations/003_category_types.sql and the server-side
//   validation in TransactionsService.reclassify(); this is a UX
//   filter, not the source of truth -- the backend still rejects a
//   mismatched categoryId even if this filter is bypassed.
// @changelog 1.5.0 — Dashboard's "Expense by category" is scoped to a
//   single month (input type="month", defaults to the current
//   month), matching the backend's GET /transactions/summary?month=
//   contract (see transactions.service.ts). Real usage spans multiple
//   months now, so an all-time category total stopped being a useful
//   number -- it only ever grows and never answers "how much did we
//   spend on X this month." "Expense by month" stays historical/
//   unscoped, as the trend reference next to the monthly breakdown.
// @changelog 1.4.0 — Mobile-first responsive pass. This app has real
//   production usage (2 named users) whose primary device is a phone,
//   not desktop -- this isn't a "nice to have," it's the main use
//   case. Header rows switched from inline flex styles to CSS classes
//   (app-header-row/app-header-actions/auth-lang-row) so they can wrap
//   via media query. TransactionList's table gets data-label attrs on
//   every <td> and collapses into stacked cards below 640px (see
//   index.css) instead of forcing horizontal scroll on a 5-column
//   table. Dashboard's .bar-row grid narrows its label column on
//   small screens. No JS added -- pure CSS breakpoint.
// @changelog 1.3.0 — Display-only category label mapping (useCategoryLabel):
//   when the UI is in English, category names render translated (e.g.
//   "Alimentación" → "Food") via i18n/locales/{es,en}.json's "categories"
//   dictionary. This is purely a rendered label -- the underlying
//   categories.name value, the <select> value (category_id), and every
//   API call/comparison still use the untouched Spanish name from the DB.
//   Falls back to the raw name if a category has no dictionary entry.
// @changelog 1.2.0 — Full ES/EN i18n via react-i18next. Spanish stays
//   the default language (see src/i18n/index.ts for the reasoning --
//   Latin America is this project's real initial market). All UI
//   copy moved to src/i18n/locales/{es,en}.json. The 8 category
//   names and the ai_provider domain values (gemini|local) are never
//   passed through t() -- they're persisted/compared data, not UI
//   copy, and must stay exactly as the backend returns them.
// @changelog 1.1.0 — Manual reclassification from the UI: per-row
//   category selector in TransactionList, calls
//   api.reclassifyTransaction and refreshes transactions+summary.
//   Previously the endpoint was only reachable via Bruno.
// @changelog 1.0.0 — Demo shell: auth (sign in/up via Supabase),
//   transaction creation form, list with an ai_provider badge (the
//   empirical proof of the pattern), and a dashboard of aggregates
//   by category/month. No elaborate design -- clear and functional,
//   see DoD #3 in the brief.

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Trans, useTranslation } from 'react-i18next';
import { supabase } from './lib/supabase';
import { api, Category, SummaryResponse, Transaction } from './lib/api';
import { setLanguage } from './i18n';

// Display-only category label. The 8 category names are persisted/compared
// domain data (categories.name in the DB, matched by AIProvider.classify()
// against CATEGORY_NAMES on the backend) -- never mutated. This only maps
// the *rendered* label per UI language via src/i18n/locales/{es,en}.json's
// "categories" dictionary. If a name has no entry (e.g. a category added
// later without updating the dictionary), it falls back to the raw name
// instead of showing a missing-translation key.
function useCategoryLabel() {
  const { t } = useTranslation();
  return (name: string) => t(`categories.${name}`, { defaultValue: name });
}

function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <div className="language-switcher" aria-label={t('language.label')}>
      <button
        type="button"
        className={i18n.language === 'es' ? 'lang-active' : ''}
        onClick={() => setLanguage('es')}
      >
        {t('language.es')}
      </button>
      <button
        type="button"
        className={i18n.language === 'en' ? 'lang-active' : ''}
        onClick={() => setLanguage('en')}
      >
        {t('language.en')}
      </button>
    </div>
  );
}

type AppView = 'new' | 'dashboard' | 'transactions';

// Sticky navigation header. View switching: each link calls onNavigate with
// the target view key instead of scrolling -- one view is rendered at a
// time in App. The active view is highlighted via 'nav-active' class.
// LanguageSwitcher lives here exclusively (not in any per-view component).
function AppHeader({
  session,
  view,
  onNavigate,
  onSignOut,
}: {
  session: Session;
  view: AppView;
  onNavigate: (v: AppView) => void;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Close menu when clicking outside on mobile.
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const navigate = (v: AppView) => {
    onNavigate(v);
    setMenuOpen(false);
  };

  return (
    <nav className="app-nav" ref={navRef}>
      <div className="app-nav-inner">
        <span className="app-nav-logo">{t('app.title')}</span>

        <button
          type="button"
          className="app-nav-hamburger"
          aria-label={t('nav.menu')}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? '✕' : '☰'}
        </button>

        <div className={`app-nav-links${menuOpen ? ' app-nav-links--open' : ''}`}>
          <a
            href="#"
            className={view === 'new' ? 'nav-active' : ''}
            onClick={(e) => { e.preventDefault(); navigate('new'); }}
          >
            {t('nav.newTransaction')}
          </a>
          <a
            href="#"
            className={view === 'dashboard' ? 'nav-active' : ''}
            onClick={(e) => { e.preventDefault(); navigate('dashboard'); }}
          >
            {t('nav.dashboard')}
          </a>
          <a
            href="#"
            className={view === 'transactions' ? 'nav-active' : ''}
            onClick={(e) => { e.preventDefault(); navigate('transactions'); }}
          >
            {t('nav.transactions')}
          </a>
          <div className="app-nav-divider" aria-hidden="true" />
          <LanguageSwitcher />
          <div className="app-nav-divider" aria-hidden="true" />
          <span className="app-nav-user" title={session.user.email}>
            {session.user.email}
          </span>
          <button
            type="button"
            className="app-nav-signout"
            onClick={onSignOut}
          >
            {t('app.signOut')}
          </button>
        </div>
      </div>
    </nav>
  );
}

function ProviderBadge({
  provider,
}: {
  provider: 'gemini' | 'local' | null;
}) {
  const { t } = useTranslation();
  // gemini/local are persisted domain values (ai_provider column) --
  // never translated, so they stay identical to what's stored in the DB.
  if (!provider)
    return <span className="badge badge-manual">{t('badge.manual')}</span>;
  return <span className={`badge badge-${provider}`}>{provider}</span>;
}

// Shown when the user arrives via a Supabase password-recovery link.
// At this point supabase already has a temporary session (the recovery
// token from the URL hash), so updateUser() works without extra auth.
// After success, USER_UPDATED fires in onAuthStateChange and App clears
// isRecovery -- no manual redirect needed.
function SetNewPasswordScreen({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
      // Give the user a moment to read the confirmation before the
      // USER_UPDATED event clears this screen automatically.
      setTimeout(onDone, 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="card">
        <div className="auth-lang-row">
          <LanguageSwitcher />
        </div>
        <h1>{t('auth.newPasswordTitle')}</h1>
        {done ? (
          <p className="success-text">{t('auth.passwordUpdated')}</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              placeholder={t('auth.newPasswordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <button type="submit" disabled={loading}>
              {t('auth.updatePassword')}
            </button>
            {error && <span className="error-text">{error}</span>}
          </form>
        )}
      </div>
    </div>
  );
}

function AuthScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'forgot'>('sign-in');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const switchMode = (next: typeof mode) => {
    setMode(next);
    setError(null);
    setLinkSent(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'forgot') {
        // redirectTo must be in Supabase Auth → URL Configuration → Redirect
        // URLs for production. In local dev, window.location.origin is the
        // LAN address (e.g. http://192.168.1.100:5173) -- make sure to add
        // that too, or use the localhost alias.
        const { error: err } = await supabase.auth.resetPasswordForEmail(
          email,
          { redirectTo: window.location.origin },
        );
        if (err) throw err;
        setLinkSent(true);
      } else {
        const { error: authError } =
          mode === 'sign-in'
            ? await supabase.auth.signInWithPassword({ email, password })
            : await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="card">
        <div className="auth-lang-row">
          <LanguageSwitcher />
        </div>

        {mode === 'forgot' ? (
          <>
            <h1>{t('auth.forgotTitle')}</h1>
            {linkSent ? (
              <>
                <p className="success-text">{t('auth.linkSent')}</p>
                <p>
                  <a href="#" onClick={(e) => { e.preventDefault(); switchMode('sign-in'); }}>
                    {t('auth.backToSignIn')}
                  </a>
                </p>
              </>
            ) : (
              <>
                <form onSubmit={handleSubmit}>
                  <input
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <button type="submit" disabled={loading}>
                    {t('auth.sendLink')}
                  </button>
                  {error && <span className="error-text">{error}</span>}
                </form>
                <p>
                  <a href="#" onClick={(e) => { e.preventDefault(); switchMode('sign-in'); }}>
                    {t('auth.backToSignIn')}
                  </a>
                </p>
              </>
            )}
          </>
        ) : (
          <>
            <h1>{t('auth.title')}</h1>
            <p>
              <Trans i18nKey="auth.subtitle" components={{ code: <code /> }} />
            </p>
            <form onSubmit={handleSubmit}>
              <input
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <button type="submit" disabled={loading}>
                {mode === 'sign-in' ? t('auth.signIn') : t('auth.signUp')}
              </button>
              {error && <span className="error-text">{error}</span>}
            </form>
            <p>
              {mode === 'sign-in' ? (
                <>
                  {t('auth.noAccount')}{' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); switchMode('sign-up'); }}>
                    {t('auth.createOne')}
                  </a>
                </>
              ) : (
                <>
                  {t('auth.haveAccount')}{' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); switchMode('sign-in'); }}>
                    {t('auth.signIn')}
                  </a>
                </>
              )}
            </p>
            {mode === 'sign-in' && (
              <p>
                <a href="#" onClick={(e) => { e.preventDefault(); switchMode('forgot'); }}>
                  {t('auth.forgotPassword')}
                </a>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TransactionForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  // Default: local today. todayLocal() uses local time so the date is correct
  // even when used at night in Peru (where UTC+0 would already be tomorrow).
  const [occurredAt, setOccurredAt] = useState(todayLocal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // Ref so the timeout can be cancelled if the component unmounts mid-flight.
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    // Clear any lingering success state from a previous submission before
    // this one resolves -- without this, submitting again within the 3s
    // success-message window (e.g. right after hitting the rate limit)
    // could show "✓ Transacción guardada" and the new error side by side,
    // even though this submission actually failed and created nothing.
    setSuccess(false);
    if (successTimer.current) clearTimeout(successTimer.current);
    setLoading(true);
    try {
      await api.createTransaction({
        description,
        amount: Number(amount),
        type,
        occurredAt, // YYYY-MM-DD from the date input — matches @IsDateString()
      });
      setDescription('');
      setAmount('');
      setOccurredAt(todayLocal()); // reset to today after each submission
      setSuccess(true);
      successTimer.current = setTimeout(() => setSuccess(false), 3000);
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Clean up timer on unmount.
  useEffect(() => () => {
    if (successTimer.current) clearTimeout(successTimer.current);
  }, []);

  return (
    <div className="card">
      <h2>{t('transactionForm.title')}</h2>
      <form onSubmit={handleSubmit}>
        <input
          placeholder={t('transactionForm.descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
        <input
          type="number"
          step="0.01"
          placeholder={t('transactionForm.amountPlaceholder')}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as 'income' | 'expense')}
        >
          <option value="expense">{t('transactionForm.expense')}</option>
          <option value="income">{t('transactionForm.income')}</option>
        </select>
        <div className="form-date-row">
          <label htmlFor="tx-date">{t('transactionForm.date')}</label>
          <input
            id="tx-date"
            type="date"
            value={occurredAt}
            onChange={(e) => e.target.value && setOccurredAt(e.target.value)}
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? t('transactionForm.classifying') : t('transactionForm.submit')}
        </button>
        {success && <span className="success-text">{t('transactionForm.created')}</span>}
        {error && <span className="error-text">{error}</span>}
      </form>
    </div>
  );
}

function TransactionList({
  transactions,
  categories,
  onReclassified,
}: {
  transactions: Transaction[];
  categories: Category[];
  onReclassified: () => void;
}) {
  const { t } = useTranslation();
  const categoryLabel = useCategoryLabel();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReclassify = async (transactionId: string, categoryId: string) => {
    setError(null);
    setPendingId(transactionId);
    try {
      await api.reclassifyTransaction(transactionId, categoryId);
      onReclassified();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="card">
      <h2>{t('transactionList.title')}</h2>
      {error && <p className="error-text">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>{t('transactionList.date')}</th>
            <th>{t('transactionList.description')}</th>
            <th>{t('transactionList.category')}</th>
            <th>{t('transactionList.amount')}</th>
            <th>{t('transactionList.classifiedBy')}</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id}>
              <td data-label={t('transactionList.date')}>{tx.occurred_at}</td>
              <td data-label={t('transactionList.description')}>{tx.description}</td>
              <td data-label={t('transactionList.category')}>
                <select
                  value={tx.category_id}
                  disabled={pendingId === tx.id || categories.length === 0}
                  onChange={(e) => handleReclassify(tx.id, e.target.value)}
                >
                  {categories
                    .filter(
                      (c) =>
                        c.applies_to === tx.type || c.applies_to === 'both',
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {categoryLabel(c.name)}
                      </option>
                    ))}
                </select>
              </td>
              <td data-label={t('transactionList.amount')}>
                {tx.type === 'expense' ? '-' : '+'}
                {Number(tx.amount).toFixed(2)}
              </td>
              <td data-label={t('transactionList.classifiedBy')}>
                <ProviderBadge provider={tx.ai_provider} />
              </td>
            </tr>
          ))}
          {transactions.length === 0 && (
            <tr>
              <td colSpan={5}>{t('transactionList.empty')}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Dashboard({
  summary,
  month,
  onMonthChange,
}: {
  summary: SummaryResponse | null;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const { t } = useTranslation();
  const categoryLabel = useCategoryLabel();
  if (!summary) return null;

  // Split byCategory into expense and income buckets. A category can appear
  // in both if it has applies_to='both' (only "Otros" today). A category
  // with totalExpense === 0 is an income-only row (e.g. Salario) -- don't
  // show it in the expense chart or it renders as an empty bar.
  const expenseCategories = summary.byCategory.filter((c) => c.totalExpense > 0);
  const incomeCategories = summary.byCategory.filter((c) => c.totalIncome > 0);

  const maxCategoryExpense = Math.max(1, ...expenseCategories.map((c) => c.totalExpense));
  const maxCategoryIncome = Math.max(1, ...incomeCategories.map((c) => c.totalIncome));
  const maxMonthExpense = Math.max(1, ...summary.byMonth.map((m) => m.totalExpense));

  return (
    <div className="card">
      <h2>{t('dashboard.title')}</h2>

      <div className="dashboard-month-picker">
        <label htmlFor="dashboard-month">{t('dashboard.monthLabel')}</label>
        <input
          id="dashboard-month"
          type="month"
          value={month}
          onChange={(e) => e.target.value && onMonthChange(e.target.value)}
        />
      </div>

      <h3>{t('dashboard.byCategory')}</h3>
      {expenseCategories.map((c) => (
        <div className="bar-row" key={`exp-${c.categoryId}`}>
          <span>{categoryLabel(c.categoryName)}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${(c.totalExpense / maxCategoryExpense) * 100}%` }}
            />
          </div>
          <span>{c.totalExpense.toFixed(2)}</span>
        </div>
      ))}
      {expenseCategories.length === 0 && <p>{t('dashboard.noData')}</p>}

      {incomeCategories.length > 0 && (
        <>
          <h3>{t('dashboard.byIncomeCategory')}</h3>
          {incomeCategories.map((c) => (
            <div className="bar-row bar-row--income" key={`inc-${c.categoryId}`}>
              <span>{categoryLabel(c.categoryName)}</span>
              <div className="bar-track">
                <div
                  className="bar-fill bar-fill--income"
                  style={{ width: `${(c.totalIncome / maxCategoryIncome) * 100}%` }}
                />
              </div>
              <span>{c.totalIncome.toFixed(2)}</span>
            </div>
          ))}
        </>
      )}

      <h3>{t('dashboard.byMonth')}</h3>
      {summary.byMonth.map((m) => (
        <div className="bar-row" key={m.month}>
          <span>{m.month}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${(m.totalExpense / maxMonthExpense) * 100}%` }}
            />
          </div>
          <span>{m.totalExpense.toFixed(2)}</span>
        </div>
      ))}
      {summary.byMonth.length === 0 && <p>{t('dashboard.noData')}</p>}
    </div>
  );
}

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

// Local date avoids the UTC-offset trap: new Date().toISOString() shifts to
// UTC, which in Peru (UTC-5) gives tomorrow's date after 7pm local time.
function todayLocal(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(currentYearMonth());
  // Navigation: one view visible at a time. Default 'new' (primary daily
  // action). After creating a transaction the view stays on 'new' so the
  // user can log another entry without navigating back manually.
  const [view, setView] = useState<AppView>('new');
  // true while the user is completing a password-recovery flow (arrived via
  // a reset-password email link). Cleared by the USER_UPDATED event.
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
      if (event === 'USER_UPDATED') {
        setIsRecovery(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      setLoadError(null);
      const [tx, sum, cats] = await Promise.all([
        api.listTransactions(),
        api.getSummary(month),
        api.listCategories(),
      ]);
      setTransactions(tx);
      setSummary(sum);
      setCategories(cats);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [session, month]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!sessionLoaded) return null;
  if (!session) return <AuthScreen />;
  if (isRecovery) return <SetNewPasswordScreen onDone={() => setIsRecovery(false)} />;

  const handleSignOut = () => supabase.auth.signOut();

  return (
    <>
      <AppHeader
        session={session}
        view={view}
        onNavigate={setView}
        onSignOut={handleSignOut}
      />
      <div className={`app-shell${view === 'new' ? ' app-shell--centered' : ''}`}>
        {loadError && <p className="error-text">{loadError}</p>}

        {view === 'new' && (
          <TransactionForm onCreated={refresh} />
        )}

        {view === 'dashboard' && (
          <Dashboard summary={summary} month={month} onMonthChange={setMonth} />
        )}

        {view === 'transactions' && (
          <TransactionList
            transactions={transactions}
            categories={categories}
            onReclassified={refresh}
          />
        )}
      </div>
    </>
  );
}
