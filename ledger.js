/* Pure subscription ledger. No DOM.
   Actual payments vs forecasts:
   - `payments: [{date, amount}]`, when present, is the only spend counted
     for that subscription. A forecast renew date is not a payment.
   - Absent `payments` keeps the previous rules (see chargeInMonth).
   - `renewEstimated: true` marks `renew` as a forecast for the lists.
     It is never treated as money already paid, and it does not raise
     attention or renewal notifications.
   - Banned/ended with no endedOn does not roll monthly charges past the
     latest known payment month. Do not invent an end date to get that. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Ledger = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const day = 864e5;

  function parseDay(s) {
    if (s == null || s === '') return null;
    const d = new Date(String(s) + 'T00:00:00');
    return isNaN(d) ? null : d;
  }
  function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
  function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    return y + '年' + m + '月';
  }
  function isEnded(s) {
    return !!(s && (s.endedOn || s.status === 'ended' || s.status === 'banned' || s.status === 'closed'));
  }
  function isRenewEstimated(s) {
    return !!(s && (s.renewEstimated === true || s.renewStatus === 'estimated'));
  }
  function hasPaymentLedger(s) { return Array.isArray(s && s.payments); }
  function priceUnknown(s) { return !!(s && (s.pricePending === true || (s.price == null && s.annualPrice == null))); }
  function knownStartMonth(s) {
    const d = parseDay(s.startedOn || s.start || s.firstPaid);
    return d ? monthStart(d) : null;
  }
  function latestKnownPaidMonth(s) {
    const d = parseDay(s.lastPaid) || parseDay(s.startedOn) || parseDay(s.start) || parseDay(s.firstPaid);
    return d ? monthStart(d) : null;
  }
  function daysUntil(renew, today) {
    const d = parseDay(renew);
    if (!d || !today) return null;
    return Math.round((d - today) / day);
  }

  function paymentTotal(s, key) {
    return s.payments.reduce((a, p) => {
      if (!p) return a;
      const d = parseDay(p.date);
      if (!d || monthKey(d) !== key) return a;
      const amt = p.amount != null ? +p.amount : 0;
      return a + (isFinite(amt) ? amt : 0);
    }, 0);
  }

  function yearlyDates(s) {
    const dates = [];
    if (s.lastPaid) dates.push(s.lastPaid);
    if (s.renew && !isRenewEstimated(s)) dates.push(s.renew);
    return dates;
  }

  /** Spend actually booked in YYYY-MM. `today` is the board's clock (local midnight). */
  function chargeInMonth(s, key, today) {
    if (!s || s.example) return 0;
    if (hasPaymentLedger(s)) return paymentTotal(s, key);
    if (priceUnknown(s)) return 0;
    if (s.recurring === 'yearly') {
      const amount = +s.annualPrice || 0;
      if (!amount) return 0;
      return yearlyDates(s).some(x => {
        const d = parseDay(x);
        return d && monthKey(d) === key;
      }) ? amount : 0;
    }
    const start = knownStartMonth(s) || monthStart(today);
    if (key < monthKey(start)) return 0;
    const end = parseDay(s.endedOn);
    if (end && key > monthKey(monthStart(end))) return 0;
    if (isEnded(s) && !end) {
      const cap = latestKnownPaidMonth(s);
      if (!cap || key > monthKey(cap)) return 0;
    }
    return +s.price || 0;
  }

  function earliestStart(subs, oneoffs, now) {
    let start = now;
    (oneoffs || []).forEach(o => {
      const d = parseDay(o.date);
      if (!d) return;
      const m = monthStart(d);
      if (m < start) start = m;
    });
    (subs || []).forEach(s => {
      if (!s || s.example) return;
      const consider = m => { if (m && m <= now && m < start) start = m; };
      if (hasPaymentLedger(s)) {
        s.payments.forEach(p => {
          const d = parseDay(p && p.date);
          if (d) consider(monthStart(d));
        });
        return;
      }
      if (priceUnknown(s)) return;
      if (s.recurring === 'yearly') {
        yearlyDates(s).forEach(x => {
          const d = parseDay(x);
          if (d) consider(monthStart(d));
        });
      } else {
        consider(knownStartMonth(s));
      }
    });
    const minStart = addMonths(now, -23);
    if (start < minStart) start = minStart;
    return start;
  }

  function spendSeries(subs, oneoffs, today) {
    const now = monthStart(today);
    const start = earliestStart(subs, oneoffs, now);
    const months = [];
    for (let cur = new Date(start); cur <= now; cur = addMonths(cur, 1)) {
      const key = monthKey(cur);
      let subTotal = 0;
      (subs || []).forEach(s => { subTotal += chargeInMonth(s, key, today); });
      const ooTotal = (oneoffs || []).reduce((a, o) => {
        const d = parseDay(o.date);
        if (!d || monthKey(d) !== key) return a;
        return a + (+o.amount || 0);
      }, 0);
      months.push({ key, label: monthLabel(key), subTotal, ooTotal, total: subTotal + ooTotal });
    }
    let cum = 0;
    months.forEach(m => { cum += m.total; m.cumulative = cum; });
    return months;
  }

  function inUpcoming(s, today) {
    if (!s || isEnded(s)) return false;
    const d = daysUntil(s.renew, today);
    return d != null && d >= 0 && d <= 30;
  }
  function inAttention(s, today) {
    if (!s || isEnded(s) || isRenewEstimated(s) || s.remind === false) return false;
    const d = daysUntil(s.renew, today);
    return d != null && d <= 7;
  }
  function renewalNotifyDays(s, today) {
    if (!s || isEnded(s) || s.remind === false || isRenewEstimated(s)) return null;
    const d = daysUntil(s.renew, today);
    if (d === 3 || d === 1) return d;
    return null;
  }
  function renewWhen(s, daysLeft) {
    if (daysLeft == null) return '续费日待补';
    if (isRenewEstimated(s)) {
      if (daysLeft > 0) return daysLeft + ' 天后 · ' + s.renew + '（预计）';
      if (daysLeft === 0) return '预计今天续费 · ' + s.renew;
      return '预计续费日已过 · ' + s.renew;
    }
    if (daysLeft < 0) return '已过期 ' + (-daysLeft) + ' 天';
    if (daysLeft === 0) return '今天到期';
    return daysLeft + ' 天后 · ' + s.renew;
  }

  return {
    day, parseDay, monthStart, monthKey, addMonths, monthLabel,
    isEnded, isRenewEstimated, hasPaymentLedger, priceUnknown,
    chargeInMonth, spendSeries, daysUntil, inUpcoming, inAttention,
    renewalNotifyDays, renewWhen
  };
});
