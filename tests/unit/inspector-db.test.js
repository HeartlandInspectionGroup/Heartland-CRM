import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// We can't run actual IndexedDB in Node, but we can verify the module structure
const dbPath = resolve(__dirname, '../../assets/js/inspector/inspector-db.js');
const dbSource = readFileSync(dbPath, 'utf-8');

describe('Inspector DB — Module Structure', () => {
  it('should be a valid JavaScript file', () => {
    expect(() => new Function(dbSource)).not.toThrow();
  });

  it('should define all required store names', () => {
    expect(dbSource).toContain("inspections: 'inspections'");
    expect(dbSource).toContain("section_data: 'section_data'");
    expect(dbSource).toContain("photos: 'photos'");
    expect(dbSource).toContain("sync_queue: 'sync_queue'");
    expect(dbSource).toContain("section_templates: 'section_templates'");
  });

  it('should export all required methods', () => {
    const requiredMethods = [
      'saveInspection', 'getInspection', 'getAllInspections',
      'saveSectionData', 'getSectionData', 'getAllSectionData',
      'savePhoto', 'getSectionPhotos', 'getInspectionPhotos', 'deletePhoto',
      'enqueue', 'getSyncQueue', 'dequeueSyncItem', 'clearSyncQueue',
      'cacheSectionTemplates', 'getCachedTemplates',
    ];
    requiredMethods.forEach(method => {
      expect(dbSource).toContain(method + ':');
    });
  });

  it('should use compound key for section_data store', () => {
    expect(dbSource).toContain("keyPath: ['inspection_id', 'section_id']");
  });

  it('should create indexes for photo lookups', () => {
    expect(dbSource).toContain("'by_inspection'");
    expect(dbSource).toContain("'by_section'");
  });
});
