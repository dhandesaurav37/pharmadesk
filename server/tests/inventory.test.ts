import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { Express } from 'express';
import {
  setTestMembership,
  clearTestMemberships,
} from '../src/middleware/tenantAuthorization';
import {
  clearTestMedicines,
  setTestMedicine,
} from '../src/services/medicineService';
import {
  clearTestInventory,
  setTestBatch,
} from '../src/services/inventoryService';

describe('Phase 5: Medicine Catalogue & Batch-Level Inventory Tests', () => {
  let app: Express;
  const tenantId = 'pharma-metro-mumbai';
  const branchId = 'main-counter';
  const otherBranchId = 'night-counter';

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    clearTestMemberships();
    clearTestMedicines();
    clearTestInventory();

    // 1. Owner
    setTestMembership(tenantId, 'owner-1', {
      tenantId,
      userId: 'owner-1',
      name: 'Rajesh Mehta',
      email: 'owner@metropharma.test',
      role: 'owner',
      status: 'active',
      assignedBranchIds: [branchId, otherBranchId, '*'],
      permissions: ['*'],
    });

    // 2. Pharmacist
    setTestMembership(tenantId, 'pharm-1', {
      tenantId,
      userId: 'pharm-1',
      name: 'Sunita Patil',
      email: 'sunita@metropharma.test',
      role: 'pharmacist',
      status: 'active',
      assignedBranchIds: [branchId],
    });

    // 3. Cashier
    setTestMembership(tenantId, 'cashier-1', {
      tenantId,
      userId: 'cashier-1',
      name: 'Rohan Deshmukh',
      email: 'rohan@metropharma.test',
      role: 'cashier',
      status: 'active',
      assignedBranchIds: [branchId],
    });

    // 4. Helper (restricted from adding stock, adjusting stock, or creating medicines)
    setTestMembership(tenantId, 'helper-1', {
      tenantId,
      userId: 'helper-1',
      name: 'Mahesh Kadam',
      email: 'mahesh@metropharma.test',
      role: 'helper',
      status: 'active',
      assignedBranchIds: [branchId],
    });

    // 5. Deactivated Employee
    setTestMembership(tenantId, 'deactivated-1', {
      tenantId,
      userId: 'deactivated-1',
      name: 'Ex Employee',
      email: 'ex@metropharma.test',
      role: 'pharmacist',
      status: 'deactivated',
      assignedBranchIds: [branchId],
    });
  });

  const authHeader = (uid: string) => `Bearer test-mock-token:${uid}:${uid}@metropharma.test`;

  describe('1. Medicine Catalogue Management', () => {
    it('creates a medicine with all statutory pharmaceutical attributes', async () => {
      const payload = {
        name: 'Augmentin 625 Duo',
        genericName: 'Amoxicillin (500mg) + Clavulanic Acid (125mg)',
        brand: 'GlaxoSmithKline Pharmaceuticals Ltd',
        category: 'Tablet',
        dosageForm: 'tablet',
        strength: '625 mg',
        packSize: '10 Tablets',
        uom: 'strip',
        hsnCode: '300410',
        gstRate: 12,
        barcode: '8901030582910',
        prescriptionRequired: true,
        minStockThreshold: 15,
        description: 'Broad spectrum antibiotic for bacterial infections',
      };

      const res = await request(app)
        .post(`/api/v1/tenants/${tenantId}/medicines`)
        .set('Authorization', authHeader('pharm-1'))
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe('Augmentin 625 Duo');
      expect(res.body.data.status).toBe('active');
    });

    it('rejects duplicate medicine with identical name, strength and dosage form', async () => {
      const payload = {
        name: 'Dolo 650',
        genericName: 'Paracetamol',
        brand: 'Micro Labs Ltd',
        dosageForm: 'tablet',
        strength: '650 mg',
        packSize: '15 Tablets',
      };

      // First creation succeeds
      const firstRes = await request(app)
        .post(`/api/v1/tenants/${tenantId}/medicines`)
        .set('Authorization', authHeader('pharm-1'))
        .send(payload);
      expect(firstRes.status).toBe(201);

      // Duplicate creation fails with 409 Conflict
      const dupRes = await request(app)
        .post(`/api/v1/tenants/${tenantId}/medicines`)
        .set('Authorization', authHeader('pharm-1'))
        .send(payload);

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.detail).toContain('already exists');
    });

    it('updates medicine details and preserves historical record', async () => {
      // Seed medicine
      const medId = 'med_paracip_500';
      setTestMedicine(tenantId, {
        id: medId,
        tenantId,
        name: 'Paracip 500',
        genericName: 'Paracetamol',
        brand: 'Cipla Ltd',
        category: 'Tablet',
        dosageForm: 'tablet',
        strength: '500 mg',
        packSize: '10 Tablets',
        uom: 'strip',
        hsnCode: '300490',
        gstRate: 12,
        prescriptionRequired: false,
        minStockThreshold: 20,
        status: 'active',
        createdBy: 'pharm-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .patch(`/api/v1/tenants/${tenantId}/medicines/${medId}`)
        .set('Authorization', authHeader('pharm-1'))
        .send({
          minStockThreshold: 35,
          description: 'Updated anti-pyretic formulation reorder limit',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.minStockThreshold).toBe(35);
      expect(res.body.data.description).toBe('Updated anti-pyretic formulation reorder limit');
    });

    it('archives a medicine without deleting it from database', async () => {
      const medId = 'med_to_archive';
      setTestMedicine(tenantId, {
        id: medId,
        tenantId,
        name: 'Discontinued Med',
        genericName: 'Generic Salt',
        brand: 'Old Pharma',
        category: 'Syrup',
        dosageForm: 'syrup',
        strength: '100 ml',
        packSize: '1 Bottle',
        uom: 'bottle',
        hsnCode: '300490',
        gstRate: 12,
        prescriptionRequired: false,
        minStockThreshold: 5,
        status: 'active',
        createdBy: 'pharm-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .patch(`/api/v1/tenants/${tenantId}/medicines/${medId}/archive`)
        .set('Authorization', authHeader('owner-1'))
        .send({ archive: true });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('archived');

      // Verify still fetchable
      const getRes = await request(app)
        .get(`/api/v1/tenants/${tenantId}/medicines/${medId}`)
        .set('Authorization', authHeader('pharm-1'));
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.status).toBe('archived');
    });
  });

  describe('2. Batch-Level Inventory & Multiple Batches per Medicine', () => {
    const medId = 'med_azithral_500';

    beforeEach(() => {
      setTestMedicine(tenantId, {
        id: medId,
        tenantId,
        name: 'Azithral 500',
        genericName: 'Azithromycin (500mg)',
        brand: 'Alembic Pharmaceuticals Ltd',
        category: 'Tablet',
        dosageForm: 'tablet',
        strength: '500 mg',
        packSize: '5 Tablets',
        uom: 'strip',
        hsnCode: '300410',
        gstRate: 12,
        prescriptionRequired: true,
        minStockThreshold: 20,
        status: 'active',
        createdBy: 'pharm-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    it('allows creating multiple independent batches for a single medicine', async () => {
      // Batch 1 (Expiring 2027)
      const batch1Res = await request(app)
        .post(`/api/v1/tenants/${tenantId}/inventory/opening-stock`)
        .set('Authorization', authHeader('pharm-1'))
        .set('X-Branch-ID', branchId)
        .send({
          medicineId: medId,
          batchNumber: 'AZ-0101',
          expiryDate: '2027-12',
          purchasePrice: 95.5,
          mrp: 132.0,
          quantity: 40,
        });

      expect(batch1Res.status).toBe(201);
      expect(batch1Res.body.data.batch.batchNumber).toBe('AZ-0101');
      expect(batch1Res.body.data.batch.currentStock).toBe(40);

      // Batch 2 (Expiring 2028 with different purchase price)
      const batch2Res = await request(app)
        .post(`/api/v1/tenants/${tenantId}/inventory/opening-stock`)
        .set('Authorization', authHeader('pharm-1'))
        .set('X-Branch-ID', branchId)
        .send({
          medicineId: medId,
          batchNumber: 'AZ-0202',
          expiryDate: '2028-06',
          purchasePrice: 102.0,
          mrp: 145.0,
          quantity: 60,
        });

      expect(batch2Res.status).toBe(201);
      expect(batch2Res.body.data.batch.batchNumber).toBe('AZ-0202');
      expect(batch2Res.body.data.batch.currentStock).toBe(60);

      // List batches for medicine
      const listRes = await request(app)
        .get(`/api/v1/tenants/${tenantId}/inventory?medicineId=${medId}`)
        .set('Authorization', authHeader('pharm-1'))
        .set('X-Branch-ID', branchId);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBe(2);
      const totalStock = listRes.body.data.reduce((sum: number, b: any) => sum + b.currentStock, 0);
      expect(totalStock).toBe(100);
    });

    it('records an immutable OPENING_STOCK movement in the ledger', async () => {
      const res = await request(app)
        .post(`/api/v1/tenants/${tenantId}/inventory/opening-stock`)
        .set('Authorization', authHeader('pharm-1'))
        .set('X-Branch-ID', branchId)
        .send({
          medicineId: medId,
          batchNumber: 'AZ-LEDGER-01',
          expiryDate: '2027-08',
          purchasePrice: 90,
          mrp: 125,
          quantity: 50,
          freeQuantity: 5,
        });

      expect(res.status).toBe(201);
      const batchId = res.body.data.batch.id;

      // Query movement history
      const movRes = await request(app)
        .get(`/api/v1/tenants/${tenantId}/inventory/movements?batchId=${batchId}`)
        .set('Authorization', authHeader('pharm-1'))
        .set('X-Branch-ID', branchId);

      expect(movRes.status).toBe(200);
      expect(movRes.body.data.length).toBe(1);
      expect(movRes.body.data[0].movementType).toBe('OPENING_STOCK');
      expect(movRes.body.data[0].quantityChange).toBe(55); // 50 + 5 free
      expect(movRes.body.data[0].previousQuantity).toBe(0);
      expect(movRes.body.data[0].newQuantity).toBe(55);
    });
  });

  describe('3. Stock Adjustments & Negative Stock Prevention', () => {
    const batchId = 'batch_pan40_01';

    beforeEach(() => {
      setTestBatch(tenantId, {
        id: batchId,
        tenantId,
        branchId,
        medicineId: 'med_pan_40',
        medicineName: 'Pan 40 Tablet',
        batchNumber: 'PAN-99',
        expiryDate: '2028-10',
        purchasePrice: 110,
        mrp: 160,
        sellingPrice: 160,
        quantityReceived: 50,
        currentStock: 30,
        freeQuantity: 0,
        status: 'normal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    it('successfully processes stock reduction with reason and appends movement', async () => {
      const res = await request(app)
        .post(`/api/v1/tenants/${tenantId}/inventory/adjustments`)
        .set('Authorization', authHeader('pharm-1'))
        .set('X-Branch-ID', branchId)
        .send({
          batchId,
          movementType: 'DAMAGE',
          quantityChange: -5,
          reason: 'Water leakage in storage rack A-3',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.batch.currentStock).toBe(25);
      expect(res.body.data.movement.movementType).toBe('DAMAGE');
      expect(res.body.data.movement.previousQuantity).toBe(30);
      expect(res.body.data.movement.newQuantity).toBe(25);
    });

    it('strictly forbids adjustments that would result in negative stock balance', async () => {
      const res = await request(app)
        .post(`/api/v1/tenants/${tenantId}/inventory/adjustments`)
        .set('Authorization', authHeader('pharm-1'))
        .set('X-Branch-ID', branchId)
        .send({
          batchId,
          movementType: 'MANUAL_ADJUSTMENT',
          quantityChange: -35, // Current is 30, would result in -5
          reason: 'Physical count variance',
        });

      expect(res.status).toBe(400);
      expect(res.body.detail).toContain('negative inventory balance');
    });

    it('enforces branch isolation: rejects adjusting a batch belonging to another branch', async () => {
      // User requests under otherBranchId, but batch is in branchId
      const res = await request(app)
        .post(`/api/v1/tenants/${tenantId}/inventory/adjustments`)
        .set('Authorization', authHeader('owner-1'))
        .set('X-Branch-ID', otherBranchId)
        .send({
          batchId,
          quantityChange: -2,
          reason: 'Branch cross-check test',
        });

      expect(res.status).toBe(400);
      expect(res.body.detail).toContain('belongs to branch');
    });
  });

  describe('4. Expiry Tracking & Near-Expiry Analysis', () => {
    beforeEach(() => {
      // Expired batch
      setTestBatch(tenantId, {
        id: 'batch_expired_01',
        tenantId,
        branchId,
        medicineId: 'med_1',
        medicineName: 'Expired Syrup',
        batchNumber: 'EXP-01',
        expiryDate: '2025-01-01', // already expired
        purchasePrice: 50,
        mrp: 80,
        sellingPrice: 80,
        quantityReceived: 10,
        currentStock: 10,
        freeQuantity: 0,
        status: 'expired',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Near-expiry batch (within 60 days)
      const nearExpDate = new Date();
      nearExpDate.setDate(nearExpDate.getDate() + 45);
      const nearExpStr = nearExpDate.toISOString().slice(0, 10);

      setTestBatch(tenantId, {
        id: 'batch_near_01',
        tenantId,
        branchId,
        medicineId: 'med_2',
        medicineName: 'Near Expiry Drops',
        batchNumber: 'NEAR-01',
        expiryDate: nearExpStr,
        purchasePrice: 100,
        mrp: 150,
        sellingPrice: 150,
        quantityReceived: 20,
        currentStock: 20,
        freeQuantity: 0,
        status: 'near_expiry',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    it('calculates expired stock and valuation at risk correctly', async () => {
      const res = await request(app)
        .get(`/api/v1/tenants/${tenantId}/inventory/expiry?warningDays=90`)
        .set('Authorization', authHeader('pharm-1'))
        .set('X-Branch-ID', branchId);

      expect(res.status).toBe(200);
      expect(res.body.data.expiredBatches.length).toBe(1);
      expect(res.body.data.nearExpiryBatches.length).toBe(1);
      expect(res.body.data.summary.totalExpiredQuantity).toBe(10);
      expect(res.body.data.summary.expiredPurchaseCost).toBe(500); // 10 * 50
      expect(res.body.data.summary.expiredMrpValue).toBe(800); // 10 * 80
      expect(res.body.data.summary.totalNearExpiryQuantity).toBe(20);
      expect(res.body.data.summary.nearExpiryPurchaseCost).toBe(2000); // 20 * 100
    });
  });

  describe('5. Low-Stock & Inventory Valuation Reporting', () => {
    beforeEach(() => {
      setTestMedicine(tenantId, {
        id: 'med_low',
        tenantId,
        name: 'Thyronorm 50mcg',
        genericName: 'Thyroxine Sodium',
        brand: 'Abbott',
        category: 'Tablet',
        dosageForm: 'tablet',
        strength: '50 mcg',
        packSize: '120 Tablets',
        uom: 'bottle',
        hsnCode: '300490',
        gstRate: 12,
        prescriptionRequired: true,
        minStockThreshold: 15,
        status: 'active',
        createdBy: 'pharm-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setTestBatch(tenantId, {
        id: 'batch_thyro_01',
        tenantId,
        branchId,
        medicineId: 'med_low',
        medicineName: 'Thyronorm 50mcg',
        batchNumber: 'TH-001',
        expiryDate: '2028-12',
        purchasePrice: 150,
        mrp: 210,
        sellingPrice: 210,
        quantityReceived: 20,
        currentStock: 4, // 4 <= threshold of 15
        freeQuantity: 0,
        status: 'low_stock',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    it('generates low-stock report with reorder quantity suggestion', async () => {
      const res = await request(app)
        .get(`/api/v1/tenants/${tenantId}/inventory/low-stock`)
        .set('Authorization', authHeader('pharm-1'))
        .set('X-Branch-ID', branchId);

      expect(res.status).toBe(200);
      expect(res.body.data.totalLowStock).toBe(1);
      const item = res.body.data.lowStockItems[0];
      expect(item.currentStock).toBe(4);
      expect(item.minStockThreshold).toBe(15);
      // Reorder suggestion: 15 * 2 - 4 = 26
      expect(item.suggestedReorderQuantity).toBe(26);
    });

    it('computes accurate inventory purchase value, MRP value, and gross margin', async () => {
      const res = await request(app)
        .get(`/api/v1/tenants/${tenantId}/inventory/valuation`)
        .set('Authorization', authHeader('owner-1'))
        .set('X-Branch-ID', branchId);

      expect(res.status).toBe(200);
      expect(res.body.data.totalStockQuantity).toBe(4);
      expect(res.body.data.totalPurchaseValue).toBe(600); // 4 * 150
      expect(res.body.data.totalMrpValue).toBe(840); // 4 * 210
      expect(res.body.data.projectedGrossMargin).toBe(240); // 840 - 600
      expect(res.body.data.grossMarginPercent).toBe(28.6); // 240 / 840 * 100
    });
  });

  describe('6. Role-Based Access Control and Immediate Revocation', () => {
    it('restricts helpers from performing stock adjustments (requires inventory.adjust)', async () => {
      const res = await request(app)
        .post(`/api/v1/tenants/${tenantId}/inventory/adjustments`)
        .set('Authorization', authHeader('helper-1'))
        .set('X-Branch-ID', branchId)
        .send({
          batchId: 'any_batch',
          quantityChange: -1,
          reason: 'Helper attempting stock edit',
        });

      expect(res.status).toBe(403);
      expect(res.body.detail).toContain('Missing required permission');
    });

    it('restricts cashiers from viewing valuation / wholesale PTR margins', async () => {
      const res = await request(app)
        .get(`/api/v1/tenants/${tenantId}/inventory/valuation`)
        .set('Authorization', authHeader('cashier-1'))
        .set('X-Branch-ID', branchId);

      expect(res.status).toBe(403);
    });

    it('immediately rejects deactivated employees with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/tenants/${tenantId}/medicines`)
        .set('Authorization', authHeader('deactivated-1'))
        .set('X-Branch-ID', branchId);

      expect(res.status).toBe(403);
      expect(res.body.detail).toContain('deactivated');
    });
  });
});
