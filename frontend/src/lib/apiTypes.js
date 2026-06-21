/**
 * @typedef {Object} Provenance
 * @property {string} kind
 * @property {string} label
 * @property {string} scientific_validity
 * @property {string} explanation
 * @property {string} model_version
 * @property {string=} database_mode
 * @property {string} engine
 * @property {string[]} claims
 * @property {string[]} disclaimers
 * @property {Object.<string, unknown>} metadata
 */

/**
 * @typedef {Object} PredictionResult
 * @property {"success"} status
 * @property {string} engine
 * @property {string} prediction_kind
 * @property {string} prediction_label
 * @property {string} scientific_validity
 * @property {string} explanation
 * @property {string} model_version
 * @property {string=} database_mode
 * @property {Object.<string, unknown>} parameters
 * @property {string[]} limitations
 * @property {string} sequence
 * @property {Provenance} provenance
 * @property {Array<Object.<string, unknown>>} frames
 * @property {string=} pdb
 * @property {number[]} plddt
 * @property {number[][]=} pae
 * @property {Object.<string, unknown>} meta
 * @property {string[]} warnings
 */

/**
 * @typedef {Object} GuardrailDecision
 * @property {boolean} ok
 * @property {boolean} allowed
 * @property {string} message
 * @property {string} reason
 * @property {number} estimate_mib
 * @property {number} estimated_memory_mib
 * @property {number} budget_mib
 * @property {string[]} suggested_actions
 */

export {};
