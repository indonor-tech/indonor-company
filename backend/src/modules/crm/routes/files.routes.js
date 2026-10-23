import express from 'express';
import { authenticate } from '../../../middleware/auth.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { AppError } from '../../../utils/errors.js';
import { sendStoredFile } from '../crm.files.js';
import {
  ClientDocument, CrmInvoice, CrmLead, CrmPayment, CrmProject, PartnerDue, PartnerDuePayment, PartnerSettlement, ProjectDocument
} from '../crm.models.js';
import { CONFIDENTIAL_DOCUMENT_TYPES } from '../constants.js';
import { canAccessFinancial } from '../crm.helpers.js';
import { rejectViewAdminMutations } from '../middleware/crmAccess.js';
import { hasPermission } from '../../auth/roles.js';

const router = express.Router();
router.use(authenticate, rejectViewAdminMutations);

router.get('/:ownerType/:ownerId/:fileId', asyncHandler(async (req, res) => {
  const { ownerType, ownerId, fileId } = req.params;
  if (ownerType === 'lead') {
    if (!hasPermission(req.user, 'crm:leads:read')) throw new AppError('You do not have permission for this action', 403);
    const lead = await CrmLead.findOne({ _id: ownerId, isDeleted: false });
    if (!lead) throw new AppError('Lead not found', 404);
    const file = (lead.attachments || []).find((item) => String(item._id) === String(fileId));
    if (!file) throw new AppError('Attachment not found', 404);
    return sendStoredFile(res, file);
  }
  if (ownerType === 'client') {
    if (!hasPermission(req.user, 'crm:clients:read')) throw new AppError('You do not have permission for this action', 403);
    const document = await ClientDocument.findOne({ _id: fileId, clientId: ownerId, isDeleted: false });
    if (!document) throw new AppError('Document not found', 404);
    return sendStoredFile(res, document);
  }
  if (ownerType === 'project') {
    if (!hasPermission(req.user, 'crm:projects:read')) throw new AppError('You do not have permission for this action', 403);
    const document = await ProjectDocument.findOne({ _id: fileId, projectId: ownerId, isDeleted: false });
    if (!document) throw new AppError('Document not found', 404);
    if (CONFIDENTIAL_DOCUMENT_TYPES.includes(document.documentType) && !canAccessFinancial(req.user)) {
      throw new AppError('This document is restricted to authorized finance users', 403);
    }
    return sendStoredFile(res, document);
  }
  if (ownerType === 'invoice') {
    if (!canAccessFinancial(req.user)) throw new AppError('Financial information is restricted', 403);
    const invoice = await CrmInvoice.findOne({ _id: ownerId, isDeleted: false });
    if (!invoice) throw new AppError('Invoice not found', 404);
    const file = (invoice.attachments || []).find((item) => String(item._id) === String(fileId));
    if (!file) throw new AppError('Attachment not found', 404);
    return sendStoredFile(res, file);
  }
  if (ownerType === 'settlement') {
    if (!canAccessFinancial(req.user)) throw new AppError('Financial information is restricted', 403);
    const settlement = await PartnerSettlement.findOne({ _id: ownerId, isDeleted: false });
    if (!settlement) throw new AppError('Settlement not found', 404);
    const file = (settlement.attachments || []).find((item) => String(item._id) === String(fileId));
    if (!file) throw new AppError('Attachment not found', 404);
    return sendStoredFile(res, file);
  }
  if (ownerType === 'payment') {
    if (!canAccessFinancial(req.user)) throw new AppError('Financial information is restricted', 403);
    const payment = await CrmPayment.findOne({ _id: ownerId, isDeleted: false });
    if (!payment) throw new AppError('Payment not found', 404);
    const file = (payment.attachments || []).find((item) => String(item._id) === String(fileId));
    if (!file) throw new AppError('Attachment not found', 404);
    return sendStoredFile(res, file);
  }
  if (ownerType === 'due') {
    if (!canAccessFinancial(req.user)) throw new AppError('Financial information is restricted', 403);
    const due = await PartnerDue.findOne({ _id: ownerId, isDeleted: false });
    if (!due) throw new AppError('Due not found', 404);
    const file = (due.attachments || []).find((item) => String(item._id) === String(fileId));
    if (!file) throw new AppError('Attachment not found', 404);
    return sendStoredFile(res, file);
  }
  if (ownerType === 'due-payment') {
    if (!canAccessFinancial(req.user)) throw new AppError('Financial information is restricted', 403);
    const payment = await PartnerDuePayment.findOne({ _id: ownerId, isDeleted: false });
    if (!payment) throw new AppError('Due payment not found', 404);
    const file = (payment.attachments || []).find((item) => String(item._id) === String(fileId));
    if (!file) throw new AppError('Attachment not found', 404);
    return sendStoredFile(res, file);
  }
  if (ownerType === 'project-inline') {
    if (!hasPermission(req.user, 'crm:projects:read')) throw new AppError('You do not have permission for this action', 403);
    const project = await CrmProject.findOne({ _id: ownerId, isDeleted: false });
    if (!project) throw new AppError('Project not found', 404);
    throw new AppError('Attachment not found', 404);
  }
  throw new AppError('Unknown file owner', 404);
}));

export default router;
