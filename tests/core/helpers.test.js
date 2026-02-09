import { loadModule } from '../setup.js';
import { mockNextTick } from '../helpers/mock-vue.js';
import { createMockPageStore, createMockConfigStore, createMockUiStore } from '../helpers/mock-stores.js';

describe('helpers', () => {
    let helpers;
    let pageStore, configStore, uiStore;

    const defaultConfig = {
        canvasW: 6071, canvasH: 8598,
        finishW: 5197, finishH: 7323,
        bleed: 118, safeTop: 472, safeBottom: 472,
        safeInside: 472, safeOutside: 354,
        scale: 0.12,
    };

    beforeEach(() => {
        loadModule('src/js/composables/layout.js');
        loadModule('src/js/core/helpers.js');
        pageStore = createMockPageStore();
        configStore = createMockConfigStore({ pageConfig: { ...defaultConfig } });
        uiStore = createMockUiStore();
        helpers = window.MangaApp.createHelpers({
            Vue: { nextTick: mockNextTick },
            pageStore, configStore, uiStore,
            layoutUtils: window.MangaApp.layoutUtils,
            addScript: null,
        });
    });

    describe('getClientPos', () => {
        it('should extract coordinates from mouse event', () => {
            const result = helpers.getClientPos({ clientX: 100, clientY: 200 });
            expect(result).toEqual({ x: 100, y: 200 });
        });

        it('should extract coordinates from touch event', () => {
            const result = helpers.getClientPos({
                touches: [{ clientX: 50, clientY: 75 }],
            });
            expect(result).toEqual({ x: 50, y: 75 });
        });
    });

    describe('guideProps', () => {
        it('should calculate right page (index 0) coordinates', () => {
            const props = helpers.guideProps(0);
            const scale = 0.12;
            const fx = (6071 - 5197) / 2;
            const fy = (8598 - 7323) / 2;

            expect(props.finishX).toBeCloseTo(fx * scale);
            expect(props.finishY).toBeCloseTo(fy * scale);
            expect(props.finishW).toBeCloseTo(5197 * scale);
            expect(props.finishH).toBeCloseTo(7323 * scale);
        });

        it('should swap safeInside/safeOutside for left page (even index)', () => {
            const right = helpers.guideProps(0);
            const left = helpers.guideProps(2);

            // Left page (even index) has swapped inside/outside margins
            expect(left.safeX).not.toBeCloseTo(right.safeX);
            expect(left.safeW).toBeCloseTo(right.safeW);
        });

        it('should calculate bleed area', () => {
            const props = helpers.guideProps(0);
            const scale = 0.12;
            const fx = (6071 - 5197) / 2;
            const fy = (8598 - 7323) / 2;

            expect(props.bleedX).toBeCloseTo((fx - 118) * scale);
            expect(props.bleedY).toBeCloseTo((fy - 118) * scale);
            expect(props.bleedW).toBeCloseTo((5197 + 118 * 2) * scale);
        });

        it('should generate SVG path strings', () => {
            const props = helpers.guideProps(0);
            expect(typeof props.centerPath).toBe('string');
            expect(typeof props.tonboPath).toBe('string');
            expect(props.centerPath).toContain('M');
            expect(props.tonboPath).toContain('M');
        });
    });

    describe('getPageTextPreview', () => {
        it('should join text of scripts with char names', () => {
            const page = {
                scripts: [
                    { char: 'Alice', text: 'Hello' },
                    { char: '', text: 'direction' },
                    { char: 'Bob', text: 'World' },
                ],
            };
            expect(helpers.getPageTextPreview(page)).toBe('Hello / World');
        });

        it('should return empty string for page with no scripts', () => {
            expect(helpers.getPageTextPreview({ scripts: [] })).toBe('');
        });

        it('should return empty string for page without scripts property', () => {
            expect(helpers.getPageTextPreview({})).toBe('');
        });
    });

    describe('getUnassignedScripts', () => {
        it('should return scripts without valid drawingId', () => {
            pageStore.pages = [{
                scripts: [
                    { id: 1, drawingId: 100 },
                    { id: 2, drawingId: null },
                    { id: 3, drawingId: 999 },
                ],
                drawings: [{ id: 100 }],
            }];
            const result = helpers.getUnassignedScripts(0);
            expect(result).toHaveLength(2);
            expect(result[0].id).toBe(2);
            expect(result[1].id).toBe(3);
        });
    });

    describe('getScriptsForDrawing', () => {
        it('should return scripts matching drawingId', () => {
            pageStore.pages = [{
                scripts: [
                    { id: 1, drawingId: 100 },
                    { id: 2, drawingId: 200 },
                    { id: 3, drawingId: 100 },
                ],
                drawings: [],
            }];
            const result = helpers.getScriptsForDrawing(0, 100);
            expect(result).toHaveLength(2);
            expect(result.map(s => s.id)).toEqual([1, 3]);
        });
    });
});
