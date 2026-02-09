/**
 * Vue 3 reactive primitives mock for testing.
 * Provides simple ref/computed/nextTick that work without Vue runtime.
 */

export function mockRef(initial) {
    return { value: initial };
}

export function mockComputed(getter) {
    return {
        get value() {
            return getter();
        },
    };
}

export function mockNextTick(fn) {
    if (fn) fn();
}

export function createMockVueDeps() {
    return {
        ref: mockRef,
        computed: mockComputed,
        nextTick: mockNextTick,
    };
}
