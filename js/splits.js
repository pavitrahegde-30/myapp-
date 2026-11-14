/**
 * splits.js
 * Controls Feature 6: Split Expenses & Group Settlements.
 * Handles splitting bills among friends, calculating equal or custom shares,
 * tracking pending/settled amounts, and marking friends as settled.
 */

import { CATEGORIES, getTodayISO } from './storage.js';
import { formatCurrency, formatDate, escapeHtml, populateCategorySelect } from './transactions.js';

let splitsState = {
  activeFilter: 'all',
  splitMode: 'equal', // 'equal' | 'custom'
  participants: [
    { name: 'Alex', amount: 0 },
    { name: 'Sam', amount: 0 }
  ]
};

let splitsCallbacks = {
  onDataChange: () => {},
  showToast: () => {},
  openConfirm: () => {}
};

let cachedSplits = [];

/**
 * Initializes the Split Expenses module, event listeners, and dynamic form.
 * @param {object} callbacks
 */
export function initSplitsModule(callbacks) {
  splitsCallbacks = { ...splitsCallbacks, ...callbacks };

  const form = document.getElementById('split-expense-form');
  const catSelect = document.getElementById('split-category');
  const dateInput = document.getElementById('split-date');
  const amountInput = document.getElementById('split-amount');
  const addParticipantBtn = document.getElementById('split-add-participant-btn');
  const modeToggle = document.getElementById('split-mode-toggle');
  const filterToggle = document.getElementById('splits-filter-toggle');
  const resetBtn = document.getElementById('split-form-reset-btn');
  const cardsContainer = document.getElementById('splits-cards-container');

  if (catSelect) {
    populateCategorySelect(catSelect, 'expense');
  }

  if (dateInput) {
    dateInput.value = getTodayISO();
  }

  renderParticipantInputs();

  // Mode toggle (Equal vs Custom)
  modeToggle?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-split-mode]');
    if (!btn) return;
    splitsState.splitMode = btn.dataset.splitMode;
    modeToggle.querySelectorAll('.segment-btn').forEach((b) => b.classList.toggle('active', b === btn));
    renderParticipantInputs();
    updateLiveSharesPreview();
  });

  // Filter toggle (All vs Pending vs Settled)
  filterToggle?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-splits-filter]');
    if (!btn) return;
    splitsState.activeFilter = btn.dataset.splitsFilter;
    filterToggle.querySelectorAll('.segment-btn').forEach((b) => b.classList.toggle('active', b === btn));
    renderSplitsList();
  });

  // Amount input triggers live share calculations
  amountInput?.addEventListener('input', updateLiveSharesPreview);

  // Add participant button
  addParticipantBtn?.addEventListener('click', () => {
    splitsState.participants.push({ name: '', amount: 0 });
    renderParticipantInputs();
    updateLiveSharesPreview();
  });

  // Delegated remove participant
  document.getElementById('split-participants-list')?.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-remove-participant]');
    if (!removeBtn) return;
    const index = parseInt(removeBtn.dataset.removeParticipant, 10);
    if (!isNaN(index) && splitsState.participants.length > 1) {
      splitsState.participants.splice(index, 1);
      renderParticipantInputs();
      updateLiveSharesPreview();
    } else {
      splitsCallbacks.showToast('You must keep at least one friend to split with', 'error');
    }
  });

  // Form submit handler
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearSplitErrors();

    const titleInput = document.getElementById('split-title');
    const amountVal = parseFloat(amountInput?.value || '');
    const titleVal = titleInput?.value?.trim() || '';
    const catVal = catSelect?.value || 'Other';
    const dateVal = dateInput?.value || getTodayISO();
    const recordMyShare = document.getElementById('split-record-my-share')?.checked ?? true;

    // Validation
    let hasError = false;
    if (!titleVal) {
      titleInput?.classList.add('invalid');
      document.getElementById('split-title-error').textContent = 'Please enter a bill or event title.';
      hasError = true;
    }

    if (isNaN(amountVal) || amountVal <= 0) {
      amountInput?.classList.add('invalid');
      document.getElementById('split-amount-error').textContent = 'Enter a valid total bill amount greater than $0.';
      hasError = true;
    }

    // Read participants from DOM
    const participantRows = document.querySelectorAll('.split-participant-row');
    const participantsData = [];
    let customTotal = 0;

    participantRows.forEach((row, i) => {
      const nameInp = row.querySelector('.participant-name-input');
      const amtInp = row.querySelector('.participant-amount-input');
      const name = nameInp?.value?.trim() || `Friend ${i + 1}`;
      const amt = parseFloat(amtInp?.value || '0');
      customTotal += isNaN(amt) ? 0 : amt;
      participantsData.push({ name, amount: amt });
    });

    if (participantsData.length === 0) {
      document.getElementById('split-participants-error').textContent = 'Add at least one friend to split with.';
      hasError = true;
    }

    if (hasError) return;

    // Calculate my personal share
    const totalPeople = participantsData.length + 1; // You + friends
    let myShare = 0;

    if (splitsState.splitMode === 'equal') {
      const equalShare = Number((amountVal / totalPeople).toFixed(2));
      myShare = Number((amountVal - (equalShare * participantsData.length)).toFixed(2));
      participantsData.forEach((p) => {
        p.amount = equalShare;
      });
    } else {
      myShare = Math.max(0, Number((amountVal - customTotal).toFixed(2)));
    }

    const payload = {
      title: titleVal,
      total_amount: amountVal,
      category: catVal,
      date: dateVal,
      paid_by: 'You',
      my_share: myShare,
      participants: participantsData,
      record_my_share: recordMyShare
    };

    try {
      const res = await fetch('/api/splits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to create split (HTTP ${res.status})`);
      }

      form.reset();
      dateInput.value = getTodayISO();
      splitsState.participants = [
        { name: 'Alex', amount: 0 },
        { name: 'Sam', amount: 0 }
      ];
      renderParticipantInputs();
      updateLiveSharesPreview();

      splitsCallbacks.showToast('Split expense created successfully', 'success');
      await splitsCallbacks.onDataChange();
    } catch (err) {
      splitsCallbacks.showToast(err.message, 'error');
    }
  });

  // Reset button
  resetBtn?.addEventListener('click', () => {
    setTimeout(() => {
      dateInput.value = getTodayISO();
      splitsState.participants = [
        { name: 'Alex', amount: 0 },
        { name: 'Sam', amount: 0 }
      ];
      renderParticipantInputs();
      updateLiveSharesPreview();
      clearSplitErrors();
    }, 0);
  });

  // Delegated Settle & Delete buttons in card list
  cardsContainer?.addEventListener('click', async (e) => {
    // Settle button clicked
    const settleBtn = e.target.closest('[data-settle-id]');
    if (settleBtn) {
      const participantId = settleBtn.dataset.settleId;
      const currentStatus = settleBtn.dataset.currentStatus;
      const newStatus = currentStatus === 'settled' ? 'pending' : 'settled';

      try {
        const res = await fetch(`/api/splits/participants/${participantId}/settle`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        });

        if (!res.ok) {
          throw new Error('Failed to update settlement status');
        }

        splitsCallbacks.showToast(
          newStatus === 'settled' ? 'Marked as settled / paid!' : 'Marked as pending',
          'success'
        );
        await splitsCallbacks.onDataChange();
      } catch (err) {
        splitsCallbacks.showToast(err.message, 'error');
      }
      return;
    }

    // Delete split bill clicked
    const deleteBtn = e.target.closest('[data-delete-split-id]');
    if (deleteBtn) {
      const splitId = deleteBtn.dataset.deleteSplitId;
      const splitTitle = deleteBtn.dataset.splitTitle || 'this split bill';

      splitsCallbacks.openConfirm(
        `Are you sure you want to delete "${splitTitle}"? This will remove all friend balances for this bill.`,
        async () => {
          try {
            const res = await fetch(`/api/splits/${splitId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete split expense');
            splitsCallbacks.showToast('Split expense deleted', 'success');
            await splitsCallbacks.onDataChange();
          } catch (err) {
            splitsCallbacks.showToast(err.message, 'error');
          }
        },
        'Delete Split Bill',
        'Delete'
      );
    }
  });
}

function clearSplitErrors() {
  ['split-title', 'split-amount', 'split-category', 'split-date'].forEach((id) => {
    document.getElementById(id)?.classList.remove('invalid');
  });
  ['split-title-error', 'split-amount-error', 'split-category-error', 'split-date-error', 'split-participants-error'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

function renderParticipantInputs() {
  const container = document.getElementById('split-participants-list');
  if (!container) return;

  const isCustom = splitsState.splitMode === 'custom';

  container.innerHTML = splitsState.participants
    .map((p, idx) => `
      <div class="split-participant-row">
        <input
          type="text"
          class="form-control participant-name-input"
          placeholder="Friend's Name (e.g., Alex)"
          value="${escapeHtml(p.name)}"
          data-index="${idx}"
          maxlength="40"
          required
        />
        <input
          type="number"
          class="form-control mono participant-amount-input"
          placeholder="Share ($)"
          value="${p.amount > 0 ? p.amount : ''}"
          step="0.01"
          min="0"
          data-index="${idx}"
          ${!isCustom ? 'readonly style="background: var(--bg-hover, #f8fafc); cursor: default;"' : ''}
        />
        <button
          type="button"
          class="icon-btn icon-btn-danger"
          data-remove-participant="${idx}"
          title="Remove friend"
          aria-label="Remove friend ${idx + 1}"
        >
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `)
    .join('');

  // Bind change listeners to update state
  container.querySelectorAll('.participant-name-input').forEach((inp) => {
    inp.addEventListener('input', (e) => {
      const i = parseInt(e.target.dataset.index, 10);
      if (!isNaN(i) && splitsState.participants[i]) {
        splitsState.participants[i].name = e.target.value;
      }
    });
  });

  if (isCustom) {
    container.querySelectorAll('.participant-amount-input').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const i = parseInt(e.target.dataset.index, 10);
        const amt = parseFloat(e.target.value || '0');
        if (!isNaN(i) && splitsState.participants[i]) {
          splitsState.participants[i].amount = isNaN(amt) ? 0 : amt;
        }
        updateLiveSharesPreview();
      });
    });
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function updateLiveSharesPreview() {
  const rawAmt = parseFloat(document.getElementById('split-amount')?.value || '0');
  const totalAmount = isNaN(rawAmt) || rawAmt < 0 ? 0 : rawAmt;
  const numFriends = splitsState.participants.length;
  const totalPeople = numFriends + 1;

  let myShare = 0;
  let friendsShare = 0;

  if (splitsState.splitMode === 'equal') {
    const eachShare = totalPeople > 0 ? Number((totalAmount / totalPeople).toFixed(2)) : 0;
    friendsShare = eachShare * numFriends;
    myShare = Math.max(0, totalAmount - friendsShare);

    // Update the read-only inputs
    document.querySelectorAll('.participant-amount-input').forEach((inp) => {
      inp.value = eachShare > 0 ? eachShare.toFixed(2) : '';
    });
  } else {
    let customSum = 0;
    document.querySelectorAll('.participant-amount-input').forEach((inp) => {
      const v = parseFloat(inp.value || '0');
      customSum += isNaN(v) ? 0 : v;
    });
    friendsShare = customSum;
    myShare = Math.max(0, totalAmount - customSum);
  }

  const myShareEl = document.getElementById('split-preview-my-share');
  const friendsShareEl = document.getElementById('split-preview-friends-share');

  if (myShareEl) myShareEl.textContent = formatCurrency(myShare);
  if (friendsShareEl) friendsShareEl.textContent = formatCurrency(friendsShare);
}

/**
 * Fetches and renders the entire Split Expenses view.
 */
export async function renderSplits() {
  try {
    const res = await fetch('/api/splits');
    if (!res.ok) throw new Error('Failed to fetch split expenses');
    const result = await res.json();
    cachedSplits = Array.isArray(result.data) ? result.data : [];
  } catch (err) {
    console.error('Error loading splits:', err);
    cachedSplits = [];
  }

  // Calculate Summary KPIs
  let totalBills = 0;
  let totalOwed = 0;
  let totalSettled = 0;
  let totalMyShare = 0;
  let pendingCount = 0;
  let settledCount = 0;

  for (const split of cachedSplits) {
    totalBills += Number(split.total_amount) || 0;
    totalMyShare += Number(split.my_share) || 0;

    for (const p of split.participants || []) {
      const amt = Number(p.amount) || 0;
      if (p.status === 'settled') {
        totalSettled += amt;
        settledCount += 1;
      } else {
        totalOwed += amt;
        pendingCount += 1;
      }
    }
  }

  const billsEl = document.getElementById('splits-total-bills');
  const countEl = document.getElementById('splits-total-count');
  const owedEl = document.getElementById('splits-total-owed');
  const pendingCountEl = document.getElementById('splits-pending-count');
  const settledEl = document.getElementById('splits-total-settled');
  const settledCountEl = document.getElementById('splits-settled-count');
  const myShareEl = document.getElementById('splits-my-share');

  if (billsEl) billsEl.textContent = formatCurrency(totalBills);
  if (countEl) countEl.textContent = `${cachedSplits.length} shared ${cachedSplits.length === 1 ? 'bill' : 'bills'}`;
  if (owedEl) owedEl.textContent = formatCurrency(totalOwed);
  if (pendingCountEl) pendingCountEl.textContent = `${pendingCount} pending repayments`;
  if (settledEl) settledEl.textContent = formatCurrency(totalSettled);
  if (settledCountEl) settledCountEl.textContent = `${settledCount} repayments collected`;
  if (myShareEl) myShareEl.textContent = formatCurrency(totalMyShare);

  renderSplitsList();
}

function renderSplitsList() {
  const container = document.getElementById('splits-cards-container');
  const emptyState = document.getElementById('splits-empty-state');
  if (!container) return;

  const filter = splitsState.activeFilter;
  const filtered = cachedSplits.filter((split) => {
    if (filter === 'pending') return !split.is_fully_settled;
    if (filter === 'settled') return split.is_fully_settled;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyState?.classList.remove('hidden');
    return;
  }

  emptyState?.classList.add('hidden');

  container.innerHTML = filtered
    .map((split) => {
      const participants = split.participants || [];
      const settledCount = participants.filter((p) => p.status === 'settled').length;
      const pct = participants.length > 0 ? (settledCount / participants.length) * 100 : 0;

      return `
        <article class="split-card">
          <div class="split-card-header">
            <div class="split-card-title-group">
              <div class="split-card-title">
                <span>${escapeHtml(split.title)}</span>
                <span class="badge cell-muted" style="font-size: 11px; padding: 2px 6px; background: var(--bg-hover, #f1f5f9); border-radius: 4px;">
                  ${escapeHtml(split.category)}
                </span>
              </div>
              <span class="split-card-meta">${formatDate(split.date)} · Your Share: <strong>${formatCurrency(split.my_share)}</strong></span>
            </div>

            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="split-card-total">
                <span class="split-card-amount mono">${formatCurrency(split.total_amount)}</span>
                <span class="split-card-meta mono ${split.total_owed > 0 ? 'text-expense' : 'text-income'}">
                  ${split.total_owed > 0 ? `${formatCurrency(split.total_owed)} pending` : 'Fully settled'}
                </span>
              </div>
              <button
                type="button"
                class="icon-btn icon-btn-danger"
                data-delete-split-id="${split.id}"
                data-split-title="${escapeHtml(split.title)}"
                title="Delete split expense"
                aria-label="Delete ${escapeHtml(split.title)}"
              >
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </div>

          <!-- Progress bar -->
          <div class="progress-track progress-track-sm" style="margin: 2px 0;">
            <div class="progress-fill ${pct === 100 ? '' : 'warning'}" style="width: ${pct}%; background-color: ${pct === 100 ? '#15803d' : '#d97706'};"></div>
          </div>

          <!-- Participants list -->
          <div class="split-card-participants">
            ${participants
              .map(
                (p) => `
                <div class="split-participant-item">
                  <span class="split-participant-name">
                    <i data-lucide="${p.status === 'settled' ? 'check-circle-2' : 'clock'}" style="width: 14px; height: 14px; color: ${p.status === 'settled' ? '#15803d' : '#d97706'};"></i>
                    <span>${escapeHtml(p.name)}</span>
                  </span>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="mono font-medium">${formatCurrency(p.amount)}</span>
                    <span class="split-status-badge ${p.status}">
                      ${p.status === 'settled' ? 'Paid' : 'Pending'}
                    </span>
                    <button
                      type="button"
                      class="btn ${p.status === 'settled' ? 'btn-secondary' : 'btn-primary'} btn-sm"
                      style="padding: 2px 8px; font-size: 11px; height: 26px;"
                      data-settle-id="${p.id}"
                      data-current-status="${p.status}"
                      title="${p.status === 'settled' ? 'Mark as Pending' : 'Mark as Paid'}"
                    >
                      <i data-lucide="${p.status === 'settled' ? 'rotate-ccw' : 'check'}" style="width: 12px; height: 12px;"></i>
                      <span>${p.status === 'settled' ? 'Undo' : 'Mark Paid'}</span>
                    </button>
                  </div>
                </div>
              `
              )
              .join('')}
          </div>
        </article>
      `;
    })
    .join('');

  if (window.lucide) {
    window.lucide.createIcons();
  }
}
