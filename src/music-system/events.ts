/**
 * src/music-system/events.ts
 * Typed event emitter for the music system.
 * Any consumer (logging, metrics, UI progress) can subscribe.
 */

import type { MusicEvent, MusicEventType, MusicEventCallback } from './types';

export class MusicEventBus {
    private listeners = new Map<MusicEventType, MusicEventCallback[]>();
    private allListeners: MusicEventCallback[] = [];

    /** Subscribe to a specific event type */
    on(type: MusicEventType, cb: MusicEventCallback): () => void {
        const list = this.listeners.get(type) ?? [];
        list.push(cb);
        this.listeners.set(type, list);
        return () => this.off(type, cb);
    }

    /** Subscribe to ALL events */
    onAny(cb: MusicEventCallback): () => void {
        this.allListeners.push(cb);
        return () => {
            const idx = this.allListeners.indexOf(cb);
            if (idx >= 0) this.allListeners.splice(idx, 1);
        };
    }

    /** Remove a specific listener */
    off(type: MusicEventType, cb: MusicEventCallback): void {
        const list = this.listeners.get(type);
        if (!list) return;
        const idx = list.indexOf(cb);
        if (idx >= 0) list.splice(idx, 1);
        if (list.length === 0) this.listeners.delete(type);
    }

    /** Emit an event to all subscribers */
    emit(event: Omit<MusicEvent, 'timestamp'>): void {
        const full: MusicEvent = { ...event, timestamp: Date.now() };
        const list = this.listeners.get(event.type as MusicEventType) ?? [];
        for (const cb of list) {
            try { cb(full); } catch { /* subscriber must not break the bus */ }
        }
        for (const cb of this.allListeners) {
            try { cb(full); } catch { /* ditto */ }
        }
    }

    /** Remove all listeners */
    clear(): void {
        this.listeners.clear();
        this.allListeners = [];
    }
}

/** Singleton event bus for the music system */
export const globalEventBus = new MusicEventBus();
