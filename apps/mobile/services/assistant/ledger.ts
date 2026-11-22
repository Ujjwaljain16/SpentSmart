import { LedgerSource } from '@spentsmart/assistant/ledger';
import { Proposal } from '@spentsmart/assistant/tools';
import { Repositories } from '@/db/repositories';

const PAGE = 500;

/** The assistant's tools read the phone's own database through this. Nothing here writes. */
export function repositoryLedger(repos: Repositories): LedgerSource {
  return {
    async transactions(start, end) {
      const out = [];
      let cursor = null;
      do {
        const page = await repos.transactions.list({ since: start, until: end }, PAGE, cursor);
        for (const t of page.items) {
          out.push({ id: t.id, type: t.type, amountPaise: t.amountPaise, occurredAt: t.occurredAt, payeeName: t.payeeName, payeeVpa: t.payeeVpa, categoryKey: t.categoryKey, note: t.note, tags: t.tags });
        }
        cursor = page.nextCursor;
      } while (cursor);
      return out;
    },
    categories: () => repos.categories.list(),
    async budgets(now) {
      return (await repos.budgets.statuses(new Date(now))).map((b) => ({ categoryKey: b.categoryKey, status: b.status }));
    },
    goals: () => repos.goals.list(),
    async accounts() {
      return (await repos.accounts.list()).map((a) => ({ id: a.id, name: a.name, type: a.type, balancePaise: a.balancePaise, openingBalancePaise: a.openingBalancePaise }));
    },
    async payday() {
      const day = (await repos.settings.loadAll()).payday;
      return day > 0 ? day : null;
    },
  };
}

/** Save a change the assistant proposed. Called only from the user's tap on the confirmation card. */
export async function applyProposal(repos: Repositories, proposal: Proposal): Promise<void> {
  if (proposal.kind === 'transaction') {
    await repos.transactions.insert({
      amountPaise: proposal.amountPaise,
      type: proposal.type,
      categoryKey: proposal.categoryKey,
      payeeName: proposal.payeeName,
      paymentMethod: 'upi',
      note: proposal.note,
      occurredAt: proposal.occurredAt,
      verifiedBy: 'user',
      source: 'ai',
    });
  } else {
    await repos.goals.add({ name: proposal.name, targetPaise: proposal.targetPaise, deadline: proposal.deadline });
  }
}
