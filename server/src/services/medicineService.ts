import { firestore } from '../lib/firebaseAdmin';
import { NotFoundError, BadRequestError, ConflictError } from '../lib/errors';
import { AuditService } from './auditService';
import { logger } from '../lib/logger';
import { env } from '../config/env';

export interface MedicineRecord {
  id: string;
  tenantId: string;
  name: string; // Brand / trade name (e.g. "Dolo 650", "Augmentin 625 Duo")
  genericName: string; // Salt composition (e.g. "Paracetamol", "Amoxicillin + Clavulanic Acid")
  brand: string; // Manufacturer / Brand marketing agency (e.g. "Micro Labs", "GSK")
  category: string; // Tablet, Capsule, Syrup, Injection, Cream, Drops, Inhaler, Powder, Surgical
  dosageForm: string; // tablet, capsule, syrup, injection, cream, drops, ointment
  strength: string; // e.g. "650 mg", "500 mg / 125 mg"
  packSize: string; // e.g. "15 Tablets", "100 ml", "1 Vial"
  uom: string; // strip, bottle, vial, box, piece, tube
  hsnCode: string; // e.g. "300490"
  gstRate: number; // 0, 5, 12, 18
  barcode?: string | null;
  prescriptionRequired: boolean;
  minStockThreshold: number; // reorder point threshold (packs)
  description?: string | null;
  status: 'active' | 'inactive' | 'archived';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMedicineInput {
  name: string;
  genericName: string;
  brand: string;
  category: string;
  dosageForm: string;
  strength: string;
  packSize: string;
  uom?: string;
  hsnCode?: string;
  gstRate?: number;
  barcode?: string | null;
  prescriptionRequired?: boolean;
  minStockThreshold?: number;
  description?: string | null;
  status?: 'active' | 'inactive';
}

export interface UpdateMedicineInput {
  name?: string;
  genericName?: string;
  brand?: string;
  category?: string;
  dosageForm?: string;
  strength?: string;
  packSize?: string;
  uom?: string;
  hsnCode?: string;
  gstRate?: number;
  barcode?: string | null;
  prescriptionRequired?: boolean;
  minStockThreshold?: number;
  description?: string | null;
  status?: 'active' | 'inactive' | 'archived';
}

export interface ListMedicinesOptions {
  search?: string;
  category?: string;
  status?: string;
  page?: number;
  limit?: number;
}

// In-memory store for unit test execution
const testMedicineStore = new Map<string, MedicineRecord>();

export function setTestMedicine(tenantId: string, med: MedicineRecord) {
  testMedicineStore.set(`${tenantId}:${med.id}`, med);
}

export function clearTestMedicines() {
  testMedicineStore.clear();
}

export class MedicineService {
  private static isTest(): boolean {
    return (
      process.env.NODE_ENV === 'test' ||
      env.NODE_ENV === 'test' ||
      Boolean(process.env.VITEST)
    );
  }

  /**
   * Creates a new medicine formulation in the tenant's catalogue with duplicate detection.
   */
  public static async createMedicine(
    tenantId: string,
    input: CreateMedicineInput,
    userId: string
  ): Promise<MedicineRecord> {
    const trimmedName = input.name.trim();
    const trimmedGeneric = input.genericName.trim();
    const trimmedBrand = input.brand.trim();
    const trimmedStrength = input.strength.trim();
    const trimmedDosage = input.dosageForm.trim().toLowerCase();
    const barcode = input.barcode?.trim() || null;

    if (!trimmedName || !trimmedGeneric || !trimmedBrand) {
      throw new BadRequestError('Medicine name, generic composition, and manufacturer/brand are required');
    }

    // 1. Check for duplicates within tenant (same name + strength + dosageForm, or identical barcode)
    await this.assertNoDuplicate(tenantId, trimmedName, trimmedStrength, trimmedDosage, barcode);

    const now = new Date().toISOString();
    const id = `med_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const medicine: MedicineRecord = {
      id,
      tenantId,
      name: trimmedName,
      genericName: trimmedGeneric,
      brand: trimmedBrand,
      category: input.category || 'Tablet',
      dosageForm: trimmedDosage,
      strength: trimmedStrength,
      packSize: input.packSize || '10 Tablets',
      uom: input.uom || 'strip',
      hsnCode: input.hsnCode || '300490',
      gstRate: typeof input.gstRate === 'number' ? input.gstRate : 12,
      barcode,
      prescriptionRequired: input.prescriptionRequired ?? true,
      minStockThreshold: typeof input.minStockThreshold === 'number' ? input.minStockThreshold : 10,
      description: input.description?.trim() || null,
      status: input.status || 'active',
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    if (this.isTest()) {
      testMedicineStore.set(`${tenantId}:${id}`, medicine);
    } else {
      const db = firestore();
      await db.collection('tenants').doc(tenantId).collection('medicines').doc(id).set(medicine);
    }

    // Audit log
    await AuditService.log({
      tenantId,
      action: 'MEDICINE_CREATED',
      actingUserId: userId,
      metadata: {
        resourceType: 'medicines',
        resourceId: id,
        name: medicine.name,
        genericName: medicine.genericName,
        strength: medicine.strength,
      },
    });

    logger.info({ tenantId, medicineId: id, name: medicine.name }, 'Medicine created successfully');
    return medicine;
  }

  /**
   * Retrieves a single medicine by ID.
   */
  public static async getMedicine(tenantId: string, medicineId: string): Promise<MedicineRecord> {
    if (this.isTest()) {
      const med = testMedicineStore.get(`${tenantId}:${medicineId}`);
      if (!med) {
        throw new NotFoundError(`Medicine '${medicineId}' not found in pharmacy catalogue.`);
      }
      return med;
    }

    const db = firestore();
    const snap = await db.collection('tenants').doc(tenantId).collection('medicines').doc(medicineId).get();
    if (!snap.exists) {
      throw new NotFoundError(`Medicine '${medicineId}' not found in pharmacy catalogue.`);
    }

    return snap.data() as MedicineRecord;
  }

  /**
   * Lists medicines with multi-field search (name, generic, brand, barcode), filters, and pagination.
   */
  public static async listMedicines(
    tenantId: string,
    options: ListMedicinesOptions = {}
  ): Promise<{ medicines: MedicineRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 25));

    let all: MedicineRecord[] = [];

    if (this.isTest()) {
      for (const [key, val] of testMedicineStore.entries()) {
        if (key.startsWith(`${tenantId}:`)) {
          all.push(val);
        }
      }
    } else {
      const db = firestore();
      const snap = await db.collection('tenants').doc(tenantId).collection('medicines').get();
      all = snap.docs.map((doc) => doc.data() as MedicineRecord);
    }

    // Search filter
    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      all = all.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.genericName.toLowerCase().includes(q) ||
          m.brand.toLowerCase().includes(q) ||
          (m.barcode && m.barcode.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (options.category && options.category !== 'all') {
      const cat = options.category.toLowerCase();
      all = all.filter((m) => m.category.toLowerCase() === cat);
    }

    // Status filter
    if (options.status && options.status !== 'all') {
      all = all.filter((m) => m.status === options.status);
    }

    // Sort by name ascending
    all.sort((a, b) => a.name.localeCompare(b.name));

    const total = all.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginated = all.slice(startIndex, startIndex + limit);

    return {
      medicines: paginated,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Updates an existing medicine.
   */
  public static async updateMedicine(
    tenantId: string,
    medicineId: string,
    input: UpdateMedicineInput,
    userId: string
  ): Promise<MedicineRecord> {
    const existing = await this.getMedicine(tenantId, medicineId);

    const name = input.name !== undefined ? input.name.trim() : existing.name;
    const genericName = input.genericName !== undefined ? input.genericName.trim() : existing.genericName;
    const brand = input.brand !== undefined ? input.brand.trim() : existing.brand;
    const strength = input.strength !== undefined ? input.strength.trim() : existing.strength;
    const dosageForm = input.dosageForm !== undefined ? input.dosageForm.trim().toLowerCase() : existing.dosageForm;
    const barcode = input.barcode !== undefined ? (input.barcode ? input.barcode.trim() : null) : existing.barcode;

    // Check duplicate if key identifiers changed
    if (name !== existing.name || strength !== existing.strength || dosageForm !== existing.dosageForm || (barcode && barcode !== existing.barcode)) {
      await this.assertNoDuplicate(tenantId, name, strength, dosageForm, barcode ?? null, medicineId);
    }

    const now = new Date().toISOString();
    const updated: MedicineRecord = {
      ...existing,
      name,
      genericName,
      brand,
      category: input.category ?? existing.category,
      dosageForm,
      strength,
      packSize: input.packSize ?? existing.packSize,
      uom: input.uom ?? existing.uom,
      hsnCode: input.hsnCode ?? existing.hsnCode,
      gstRate: typeof input.gstRate === 'number' ? input.gstRate : existing.gstRate,
      barcode,
      prescriptionRequired: input.prescriptionRequired ?? existing.prescriptionRequired,
      minStockThreshold: typeof input.minStockThreshold === 'number' ? input.minStockThreshold : existing.minStockThreshold,
      description: input.description !== undefined ? (input.description ? input.description.trim() : null) : existing.description,
      status: input.status ?? existing.status,
      updatedAt: now,
    };

    if (this.isTest()) {
      testMedicineStore.set(`${tenantId}:${medicineId}`, updated);
    } else {
      const db = firestore();
      await db.collection('tenants').doc(tenantId).collection('medicines').doc(medicineId).set(updated);
    }

    await AuditService.log({
      tenantId,
      action: 'MEDICINE_UPDATED',
      actingUserId: userId,
      metadata: {
        resourceType: 'medicines',
        resourceId: medicineId,
        previous: existing,
        updated,
      },
    });

    return updated;
  }

  /**
   * Archives a medicine without deleting historical transactions or existing batches.
   */
  public static async archiveMedicine(
    tenantId: string,
    medicineId: string,
    userId: string,
    archive: boolean = true
  ): Promise<MedicineRecord> {
    const existing = await this.getMedicine(tenantId, medicineId);
    const newStatus = archive ? 'archived' : 'active';

    const now = new Date().toISOString();
    const updated: MedicineRecord = {
      ...existing,
      status: newStatus,
      updatedAt: now,
    };

    if (this.isTest()) {
      testMedicineStore.set(`${tenantId}:${medicineId}`, updated);
    } else {
      const db = firestore();
      await db.collection('tenants').doc(tenantId).collection('medicines').doc(medicineId).update({
        status: newStatus,
        updatedAt: now,
      });
    }

    await AuditService.log({
      tenantId,
      action: archive ? 'MEDICINE_ARCHIVED' : 'MEDICINE_RESTORED',
      actingUserId: userId,
      metadata: {
        resourceType: 'medicines',
        resourceId: medicineId,
        previousStatus: existing.status,
        newStatus,
      },
    });

    return updated;
  }

  /**
   * Enforces no duplicate active medicine with identical name + strength + dosageForm or duplicate barcode.
   */
  private static async assertNoDuplicate(
    tenantId: string,
    name: string,
    strength: string,
    dosageForm: string,
    barcode: string | null,
    excludeId?: string
  ): Promise<void> {
    let all: MedicineRecord[] = [];

    if (this.isTest()) {
      for (const [key, val] of testMedicineStore.entries()) {
        if (key.startsWith(`${tenantId}:`)) {
          all.push(val);
        }
      }
    } else {
      const db = firestore();
      const snap = await db.collection('tenants').doc(tenantId).collection('medicines').get();
      all = snap.docs.map((doc) => doc.data() as MedicineRecord);
    }

    const lowerName = name.toLowerCase();
    const lowerStrength = strength.toLowerCase();
    const lowerDosage = dosageForm.toLowerCase();

    for (const m of all) {
      if (excludeId && m.id === excludeId) continue;
      if (m.status === 'archived') continue; // Archived medicines do not block re-creation

      // Check formulation match
      if (
        m.name.toLowerCase() === lowerName &&
        m.strength.toLowerCase() === lowerStrength &&
        m.dosageForm.toLowerCase() === lowerDosage
      ) {
        throw new ConflictError(
          `A medicine formulation with name '${name}', strength '${strength}', and dosage form '${dosageForm}' already exists in this pharmacy.`
        );
      }

      // Check barcode uniqueness
      if (barcode && m.barcode && m.barcode === barcode) {
        throw new ConflictError(
          `Barcode '${barcode}' is already assigned to medicine '${m.name}' (${m.strength}).`
        );
      }
    }
  }
}
