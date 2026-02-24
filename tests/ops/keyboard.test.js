import { loadModule } from '../setup.js';
import { mockNextTick } from '../helpers/mock-vue.js';
import { createMockPageStore, createMockConfigStore, createMockUiStore } from '../helpers/mock-stores.js';

describe('keyboard', () => {
    let pageStore, configStore, uiStore;

    const makeScript = (id, text, opts = {}) => ({
        id,
        type: opts.type || 'dialogue',
        char: opts.char || 'Alice',
        text,
        drawingId: opts.drawingId || null,
        layout: { x: 300, y: 200, fontSize: 14 },
    });

    function createKeyboard(scripts) {
        loadModule('src/js/core/helpers.js');
        loadModule('src/js/ops/keyboard.js');

        pageStore = createMockPageStore({
            pages: [{ id: 1, scripts, drawings: [] }],
        });
        configStore = createMockConfigStore({
            pageConfig: { defaultFontSize: 14 },
        });
        uiStore = createMockUiStore();

        const helpers = window.MangaApp.createHelpers({
            Vue: { nextTick: mockNextTick },
            pageStore, configStore, uiStore,
            addScript: null,
        });

        return window.MangaApp.createKeyboard({
            Vue: { nextTick: mockNextTick },
            pageStore, uiStore,
            helpers,
        });
    }

    describe('performSplit (via Ctrl+Enter)', () => {
        it('should split text at cursor position', () => {
            const scripts = [makeScript(1, 'Hello World')];
            const keyboard = createKeyboard(scripts);

            const mockEvent = {
                key: 'Enter',
                ctrlKey: true,
                preventDefault: vi.fn(),
                target: { selectionStart: 5 },
            };
            keyboard.handleScriptTextKeydown(mockEvent, 0, 0);

            expect(scripts[0].text).toBe('Hello');
            expect(scripts).toHaveLength(2);
            expect(scripts[1].text).toBe(' World');
        });

        it('should split at beginning (cursor = 0)', () => {
            const scripts = [makeScript(1, 'Hello')];
            const keyboard = createKeyboard(scripts);

            const mockEvent = {
                key: 'Enter',
                ctrlKey: true,
                preventDefault: vi.fn(),
                target: { selectionStart: 0 },
            };
            keyboard.handleScriptTextKeydown(mockEvent, 0, 0);

            expect(scripts[0].text).toBe('');
            expect(scripts[1].text).toBe('Hello');
        });

        it('should split at end', () => {
            const scripts = [makeScript(1, 'Hello')];
            const keyboard = createKeyboard(scripts);

            const mockEvent = {
                key: 'Enter',
                ctrlKey: true,
                preventDefault: vi.fn(),
                target: { selectionStart: 5 },
            };
            keyboard.handleScriptTextKeydown(mockEvent, 0, 0);

            expect(scripts[0].text).toBe('Hello');
            expect(scripts[1].text).toBe('');
        });

        it('should trim trailing newlines from first part and leading from second', () => {
            const scripts = [makeScript(1, 'Hello\n\n\nWorld')];
            const keyboard = createKeyboard(scripts);

            const mockEvent = {
                key: 'Enter',
                ctrlKey: true,
                preventDefault: vi.fn(),
                target: { selectionStart: 5 },
            };
            keyboard.handleScriptTextKeydown(mockEvent, 0, 0);

            expect(scripts[0].text).toBe('Hello');
            expect(scripts[1].text).toBe('World');
        });

        it('should inherit char and type from original script', () => {
            const scripts = [makeScript(1, 'Hello World', { char: 'Bob', type: 'direction' })];
            const keyboard = createKeyboard(scripts);

            const mockEvent = {
                key: 'Enter',
                ctrlKey: true,
                preventDefault: vi.fn(),
                target: { selectionStart: 5 },
            };
            keyboard.handleScriptTextKeydown(mockEvent, 0, 0);

            expect(scripts[1].char).toBe('Bob');
            expect(scripts[1].type).toBe('direction');
        });
    });

    describe('mergeScriptWithPrev (via Backspace at start)', () => {
        it('should merge current text into previous script', () => {
            const scripts = [
                makeScript(1, 'Hello'),
                makeScript(2, ' World'),
            ];
            const keyboard = createKeyboard(scripts);

            const mockEvent = {
                key: 'Backspace',
                preventDefault: vi.fn(),
                target: { selectionStart: 0, selectionEnd: 0 },
            };
            keyboard.handleScriptTextKeydown(mockEvent, 0, 1);

            expect(scripts).toHaveLength(1);
            expect(scripts[0].text).toBe('Hello World');
            expect(scripts[0].id).toBe(1);
        });

        it('should not merge first script (sIndex = 0)', () => {
            const scripts = [makeScript(1, 'Hello')];
            const keyboard = createKeyboard(scripts);

            const mockEvent = {
                key: 'Backspace',
                preventDefault: vi.fn(),
                target: { selectionStart: 0, selectionEnd: 0 },
            };
            keyboard.handleScriptTextKeydown(mockEvent, 0, 0);

            expect(scripts).toHaveLength(1);
            expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        });
    });
});
