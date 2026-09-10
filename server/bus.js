import { EventEmitter } from 'node:events';

/**
 * The one seam between systems. Sources emit 'support'; the engine turns that
 * into 'catch'; the WS layer broadcasts 'catch' to the overlay. Nothing reaches
 * into anything else.
 *
 *   bus.emit('support', rawEvent)   // from sources/*  or  sim.js
 *   bus.emit('catch',   payload)    // from index.js after the fish roll
 */
export const bus = new EventEmitter();
