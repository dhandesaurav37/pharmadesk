import { Router, Request, Response } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { ForbiddenError } from '../lib/errors';
import { createPublicLeadSchema, LeadService } from '../services/leadService';

export const publicLeadRouter = Router();

/**
 * Public lead generation & enquiry intake endpoint.
 * Strictly write-only from the public web surface; records are never publicly readable.
 */
publicLeadRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createPublicLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const result = await LeadService.submitPublicLead(parsed.data, {
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('user-agent') || '',
    });

    res.status(201).json({
      success: true,
      data: result,
      message:
        'Thank you. Your enquiry has been recorded and our team will get in touch shortly.',
    });
  })
);

/**
 * Explicitly block public listing or reading of lead records.
 */
publicLeadRouter.get('/', (_req: Request, _res: Response) => {
  throw new ForbiddenError('Lead enquiry records are not publicly accessible.');
});
