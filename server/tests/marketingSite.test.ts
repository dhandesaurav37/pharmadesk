import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PAGE_SEO_MAP } from '../../src/config/seoRoutes';
import {
  PRICING_COMPARISON_ROWS,
  PRICING_PLANS,
  SAFETY_GUARANTEE_ITEMS,
} from '../../src/config/pricing';
import { AUTOMATION_CAPABILITIES, FAQ_ITEMS, PRODUCT_FEATURES_CORE } from '../../src/data/marketingContent';

const ROOT = process.cwd();

describe('Phase 13 Marketing Website, SEO, Pricing Safety & Truthfulness Checks', () => {
  it('provides clean robots.txt and sitemap.xml protecting private /app and /api/ routes', () => {
    const robots = fs.readFileSync(path.join(ROOT, 'public/robots.txt'), 'utf8');
    const sitemap = fs.readFileSync(path.join(ROOT, 'public/sitemap.xml'), 'utf8');

    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Disallow: /app');
    expect(robots).toContain('Disallow: /api/');

    for (const route of ['/features', '/pricing', '/about', '/contact', '/privacy', '/terms']) {
      expect(sitemap).toContain(route);
    }
    expect(sitemap).not.toContain('/app');
  });

  it('includes valid SoftwareApplication JSON-LD and meta tags in index.html without fake ratings', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(html).toContain('<title>PharmaDesk – Pharmacy & Medical Store Management Software</title>');
    expect(html).toContain('name="description"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(jsonLdMatch).not.toBeNull();
    const parsed = JSON.parse(jsonLdMatch![1]);
    expect(parsed['@type']).toBe('SoftwareApplication');
    expect(parsed.name).toBe('PharmaDesk');
    expect(parsed.aggregateRating).toBeUndefined();
    expect(parsed.offers).toBeUndefined();
  });

  it('defines distinct SEO titles and descriptions for every route and noindex for /app', () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();

    for (const [route, meta] of Object.entries(PAGE_SEO_MAP)) {
      expect(meta.title.length).toBeGreaterThan(15);
      expect(meta.description.length).toBeGreaterThan(40);
      titles.add(meta.title);
      descriptions.add(meta.description);
      if (route === '/app') {
        expect(meta.robots).toContain('noindex');
      }
    }

    expect(titles.size).toBe(Object.keys(PAGE_SEO_MAP).length);
    expect(descriptions.size).toBe(Object.keys(PAGE_SEO_MAP).length);
  });

  it('includes medicine safety and expiry features on all pricing plans without fake prices', () => {
    expect(PRICING_PLANS.map((p) => p.id)).toEqual([
      'starter',
      'growth',
      'professional',
      'enterprise',
    ]);
    for (const plan of PRICING_PLANS) {
      expect(plan.pricingStatus).toBe('PROPOSED_PLACEHOLDER');
      expect(plan.proposedMonthlyLabel).not.toMatch(/₹\s?\d+/);
    }

    const safetyRows = PRICING_COMPARISON_ROWS.filter((r) =>
      r.category.includes('Medicine Safety')
    );
    expect(safetyRows.length).toBeGreaterThanOrEqual(3);
    for (const row of safetyRows) {
      expect(row.starter).toBe('Included');
      expect(row.growth).toBe('Included');
      expect(row.professional).toBe('Included');
      expect(row.enterprise).toBe('Included');
    }
    expect(SAFETY_GUARANTEE_ITEMS.length).toBeGreaterThanOrEqual(4);
  });

  it('clearly separates implemented features vs planned automation and covers 10 FAQs', () => {
    expect(PRODUCT_FEATURES_CORE).toHaveLength(6);
    expect(FAQ_ITEMS).toHaveLength(10);

    const planned = AUTOMATION_CAPABILITIES.filter((c) => c.status === 'PLANNED');
    expect(planned.length).toBeGreaterThanOrEqual(1);
    expect(planned[0].badgeLabel).toContain('Planned');
  });

  it('contains zero fabricated pharmacy stats, testimonials, or unverified certifications in marketing code', () => {
    const dirsToScan = [
      path.join(ROOT, 'src/pages/marketing'),
      path.join(ROOT, 'src/components/marketing'),
      path.join(ROOT, 'src/data'),
      path.join(ROOT, 'src/config'),
    ];

    const forbiddenPatterns = [
      /4,000\+/i,
      /10,000\+/i,
      /99\.99%/i,
      /ISO\s*27001/i,
      /SOC\s*2/i,
      /HIPAA/i,
    ];

    for (const dir of dirsToScan) {
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        for (const pattern of forbiddenPatterns) {
          expect(content).not.toMatch(pattern);
        }
      }
    }
  });
});
