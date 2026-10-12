import { CrmLead } from '../modules/crm/crm.models.js';

/** Normalize legacy lead statuses onto the Netbase pipeline without deleting history. */
export async function migrateCrmLeadStatuses() {
  const mappings = [
    { from: 'CONVERTED', to: 'WON' },
    { from: 'NOT_INTERESTED', to: 'LOST' },
    { from: 'INTERESTED', to: 'CONTACTED' },
    { from: 'FOLLOW_UP', to: 'CONTACTED' }
  ];
  for (const { from, to } of mappings) {
    await CrmLead.updateMany({ status: from, isDeleted: false }, { $set: { status: to } });
  }
}
