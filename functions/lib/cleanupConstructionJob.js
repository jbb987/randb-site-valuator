"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupConstructionProjectsJob = exports.cleanupConstructionJob = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const v2_1 = require("firebase-functions/v2");
/** Shared cleanup body. When a job doc is deleted, wipe its sub-collections
 *  (tasks, photos, documents) and the matching Storage prefixes. Without this,
 *  deleting a job leaves orphan data behind forever: Firestore rules can't
 *  reach sub-docs once the parent is gone, and Storage blobs accumulate cost
 *  indefinitely. */
async function cleanupJob(jobId, jobsCollection, photosPrefix, documentsPrefix) {
    v2_1.logger.info(`[cleanup] starting for ${jobsCollection}/${jobId}`);
    const firestore = admin.firestore();
    const storage = admin.storage().bucket();
    const subCollections = ['tasks', 'photos', 'documents'];
    const subCollectionResults = await Promise.allSettled(subCollections.map((sub) => firestore.recursiveDelete(firestore.collection(jobsCollection).doc(jobId).collection(sub))));
    subCollectionResults.forEach((r, i) => {
        if (r.status === 'rejected') {
            v2_1.logger.error(`[cleanup] failed to delete sub-collection ${subCollections[i]} for ${jobsCollection}/${jobId}`, r.reason);
        }
    });
    const blobPrefixes = [`${photosPrefix}/${jobId}/`, `${documentsPrefix}/${jobId}/`];
    const blobResults = await Promise.allSettled(blobPrefixes.map((prefix) => storage.deleteFiles({ prefix })));
    blobResults.forEach((r, i) => {
        if (r.status === 'rejected') {
            v2_1.logger.error(`[cleanup] failed to delete Storage prefix ${blobPrefixes[i]} for ${jobsCollection}/${jobId}`, r.reason);
        }
    });
    v2_1.logger.info(`[cleanup] complete for ${jobsCollection}/${jobId}`);
}
/** Bailey Project — original collection, kept for the CEO's existing data. */
exports.cleanupConstructionJob = (0, firestore_1.onDocumentDeleted)('construction-jobs/{jobId}', async (event) => cleanupJob(event.params.jobId, 'construction-jobs', 'construction-photos', 'construction-documents'));
/** Construction Projects — fresh duplicate for the construction team. */
exports.cleanupConstructionProjectsJob = (0, firestore_1.onDocumentDeleted)('construction-projects-jobs/{jobId}', async (event) => cleanupJob(event.params.jobId, 'construction-projects-jobs', 'construction-projects-photos', 'construction-projects-documents'));
//# sourceMappingURL=cleanupConstructionJob.js.map