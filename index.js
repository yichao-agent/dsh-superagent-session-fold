/**
 * Host half of dsh-session-fold.
 *
 * The plugin is renderer-only: the folded browsing region lives in the Client
 * module (`client.js`). The Host row exists so the bundle has a Loader entry
 * and the client module graph can publish it.
 */
export function apply() {}
