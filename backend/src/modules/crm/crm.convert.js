import { AppError } from '../../utils/errors.js';
import { CONVERTIBLE_LEAD_STATUSES, isWonStatus } from './constants.js';
import {
  ClientActivity, ClientContact, CrmClient, CrmLead, CrmProject, LeadActivity
} from './crm.models.js';
import { contractValueOf, moneyAmount, nextCrmId, notifyUser, sessionOpts, withCrmTransaction } from './crm.helpers.js';

export async function convertLeadToClient(leadId, user, body = {}) {
  return withCrmTransaction(async (session) => {
    const lead = await CrmLead.findOne({ _id: leadId, isDeleted: false }).session(session || null);
    if (!lead) throw new AppError('Lead not found', 404);
    if (lead.clientId) throw new AppError('Lead is already converted', 400);
    const existing = await CrmClient.findOne({ sourceLeadId: lead._id, isDeleted: false }).session(session || null);
    if (existing) throw new AppError('Lead is already converted', 400);
    if (!CONVERTIBLE_LEAD_STATUSES.includes(lead.status) && !body.forceConvert) {
      throw new AppError('Only qualified, later-stage, or won leads can be converted', 400);
    }

    const quoted = moneyAmount(lead.quotedAmount ?? lead.expectedDealValue ?? lead.estimatedBudget ?? 0);
    const clientCode = await nextCrmId('crm_client', 'CLT', session);
    const assignedTo = body.assignedTo === undefined || body.assignedTo === ''
      ? lead.assignedTo
      : body.assignedTo;
    const [client] = await CrmClient.create([{
      clientId: clientCode,
      clientName: body.clientName || lead.leadName || lead.companyName,
      companyName: body.companyName || lead.companyName,
      legalCompanyName: body.legalCompanyName || '',
      companyType: body.companyType || '',
      industry: body.industry || lead.industry,
      companyWebsite: body.companyWebsite || lead.companyWebsite,
      companyEmail: body.companyEmail || lead.email,
      companyPhone: body.companyPhone || lead.phone,
      country: body.country || lead.country,
      state: body.state || lead.state,
      city: body.city || lead.city,
      district: body.district || lead.district,
      address: body.address || lead.address,
      postalCode: body.postalCode || lead.postalCode,
      companySize: body.companySize || lead.companySize,
      timezone: body.timezone || lead.timezone,
      businessDescription: body.businessDescription || lead.businessRequirements || lead.requirementDescription || lead.projectDescription,
      gstVatNumber: body.gstVatNumber || '',
      taxId: body.taxId || '',
      registrationNumber: body.registrationNumber || '',
      billingAddress: body.billingAddress || '',
      shippingAddress: body.shippingAddress || '',
      sourceLeadId: lead._id,
      sourceLeadCode: lead.leadId,
      technologies: body.technologies?.length ? body.technologies : (lead.requiredTechnologies || []),
      contractValue: body.contractValue ?? quoted,
      currency: body.currency || lead.currency || 'INR',
      startDate: body.startDate || lead.expectedStartDate,
      endDate: body.endDate || lead.deadline,
      duration: body.duration || lead.estimatedDuration || '',
      paymentTerms: body.paymentTerms || '',
      notes: body.notes || body.conversionNotes || lead.notes || '',
      assignedTo: assignedTo || null,
      createdBy: user._id,
      updatedBy: user._id
    }], session ? { session } : {});

    if (lead.contactPersonName || lead.email || lead.phone) {
      await ClientContact.create([{
        clientId: client._id,
        contactName: lead.contactPersonName || lead.leadName,
        designation: lead.designation,
        email: lead.email,
        phone: lead.phone,
        whatsapp: lead.whatsappNumber,
        linkedIn: lead.linkedInProfile,
        isPrimary: true,
        isDecisionMaker: Boolean(lead.isDecisionMaker),
        createdBy: user._id
      }], session ? { session } : {});
    }

    let project = null;
    if (body.createProject !== false) {
      const contractValue = moneyAmount(body.contractValue ?? quoted);
      const [created] = await CrmProject.create([{
        projectId: await nextCrmId('crm_project', 'PRJ', session),
        projectName: body.projectName || lead.leadName || lead.companyName || 'Project',
        clientId: client._id,
        sourceLeadId: lead._id,
        projectDescription: lead.projectDescription || lead.requirementDescription || '',
        projectType: lead.expectedProjectType || '',
        industry: lead.industry,
        estimatedStartDate: lead.expectedStartDate,
        expectedEndDate: lead.deadline,
        estimatedDuration: body.duration || lead.estimatedDuration || '',
        status: 'NOT_STARTED',
        progressPercent: 0,
        scope: lead.businessRequirements || lead.requirementDescription || '',
        requirements: lead.businessRequirements || lead.requirementDescription || '',
        technologyStack: lead.requiredTechnologies || [],
        contractValue,
        currency: body.currency || lead.currency || 'INR',
        paymentTerms: body.paymentTerms || '',
        finalAmount: contractValue,
        outstanding: contractValue,
        confirmedReceived: 0,
        creditsTotal: 0,
        nextPaymentDueDate: body.nextPaymentDueDate || null,
        notes: body.conversionNotes || '',
        createdBy: user._id,
        updatedBy: user._id
      }], session ? { session } : {});
      project = created;
    }

    lead.status = isWonStatus(lead.status) ? lead.status : 'WON';
    if (lead.status !== 'WON' && lead.status !== 'CONVERTED') lead.status = 'WON';
    lead.convertedDate = new Date();
    lead.convertedBy = user._id;
    lead.clientId = client._id;
    lead.conversionNotes = body.conversionNotes || '';
    lead.updatedBy = user._id;
    await lead.save(sessionOpts(session));

    await LeadActivity.create([{
      leadId: lead._id,
      type: 'LEAD_CONVERTED',
      title: 'Lead converted to client',
      description: body.conversionNotes || '',
      actor: user._id,
      occurredAt: new Date(),
      metadata: { clientId: client._id, clientCode, projectId: project?._id }
    }], session ? { session } : {});

    await ClientActivity.create([{
      clientId: client._id,
      type: 'CLIENT_CREATED',
      title: 'Client created from lead',
      description: `Converted from lead ${lead.leadId}`,
      actor: user._id,
      metadata: { leadId: lead._id, projectId: project?._id }
    }], session ? { session } : {});

    await notifyUser({
      recipient: lead.assignedTo,
      type: 'LEAD_CONVERTED',
      title: 'Lead converted',
      message: `${lead.leadName} was converted to client ${client.clientId}.`,
      entityType: 'CrmClient',
      entityId: client._id,
      link: `/crm/clients/${client._id}`,
      actor: user._id,
      dedupeKey: `lead-converted:${lead._id}`
    });

    return { lead, client, project };
  });
}

export { contractValueOf };
